import request from 'supertest';
import jwt from 'jsonwebtoken';
import { defineResource, validateDefinition } from '../core/defineResource.js';
import { normalizeChecklist, formatChecklist, parseChecklist } from '../core/checklist.js';
import { createApp } from '../app.js';
import { buildOpenApi } from './openapiService.js';
import { formatCell } from '../utils/pdfGenerator.js';
import { startDb, makeActor } from '../../test/db.js';
import { TEST_SECRET } from '../../test/helpers.js';
import config from '../../crypt.config.js';

const [superRole, midRole] = config.roles;
const chores = defineResource({
  key: 'chores',
  label: 'Chores',
  titleField: 'title',
  fields: {
    title: { type: 'string', label: 'Title', required: true, list: true },
    steps: { type: 'checklist', label: 'Steps', list: true, max: 3 },
    more: { type: 'checklist', label: 'More' },
  },
  permissions: { read: config.roles, create: [midRole], update: [midRole], delete: [] },
  report: { columns: ['title', 'steps'] },
});

let db;
let app;
let auth;
const bearer = (a) => ({ Authorization: `Bearer ${jwt.sign({ userId: a.userId, role: a.role, name: a.name }, TEST_SECRET)}` });

beforeAll(async () => {
  db = await startDb([chores]);
  app = await createApp();
  auth = bearer(await makeActor(midRole, 'Lister'));
});
afterAll(() => db.stop());
beforeEach(() => db.clear());

const create = (body) => request(app).post('/api/r/chores').set(auth).send({ title: 'T', ...body });

describe('checklist definition', () => {
  const base = { key: 'x', label: 'X', permissions: { read: [], create: [], update: [], delete: [] } };
  test.each(['filter', 'search', 'unique'])('rejects %s on a checklist field', (flag) => {
    const errors = validateDefinition({ ...base, fields: { c: { type: 'checklist', [flag]: true } } });
    expect(errors.join()).toMatch(new RegExp(`"c" \\(checklist\\) does not support "${flag}"`));
  });
  test('accepts list and max, rejects an out-of-range max', () => {
    expect(validateDefinition({ ...base, fields: { c: { type: 'checklist', list: true, max: 200 } } })).toEqual([]);
    expect(validateDefinition({ ...base, fields: { c: { type: 'checklist', max: 201 } } })).toHaveLength(1);
    expect(validateDefinition({ ...base, fields: { c: { type: 'checklist', max: 0 } } })).toHaveLength(1);
  });
});

describe('checklist values', () => {
  test('trims text, drops empty items, normalises done and strips extra keys', async () => {
    const res = await create({ steps: [{ text: '  one ', done: true }, { text: '   ' }, { text: 'two', done: 'yes', evil: 1 }] });
    expect(res.status).toBe(201);
    expect(res.body.item.steps).toEqual([{ text: 'one', done: true }, { text: 'two', done: false }]);
    expect(res.body.item.more).toEqual([]);
  });
  test('more items than max is a 400 naming the field; empty items do not count', async () => {
    const four = ['a', 'b', 'c', 'd'].map((text) => ({ text, done: false }));
    const bad = await create({ steps: four });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toMatch(/Steps.*max 3/);
    expect(bad.body.fields).toHaveProperty('steps');
    expect((await create({ steps: [...four.slice(0, 3), { text: ' ' }] })).status).toBe(201);
  });
  test('text over 200 characters and non-list values are 400', async () => {
    const long = await create({ steps: [{ text: 'x'.repeat(201) }] });
    expect(long.status).toBe(400);
    expect(long.body.error).toMatch(/Steps/);
    expect((await create({ steps: 'nope' })).status).toBe(400);
    expect((await create({ steps: [42] })).status).toBe(400);
    expect((await create({ steps: [{ text: 5 }] })).status).toBe(400);
  });
  test('default max is 50 and the hard cap is 200', () => {
    const items = (n) => Array.from({ length: n }, (_, i) => ({ text: `i${i}` }));
    expect(normalizeChecklist({}, 'c', items(50))).toHaveLength(50);
    expect(() => normalizeChecklist({}, 'c', items(51))).toThrow(/max 50/);
    expect(() => normalizeChecklist({ max: 999 }, 'c', items(201))).toThrow(/max 200/);
  });
  test('PATCH replaces the whole array', async () => {
    const id = (await create({ steps: [{ text: 'a' }, { text: 'b' }] })).body.item._id;
    const res = await request(app).patch(`/api/r/chores/${id}`).set(auth).send({ steps: [{ text: 'c', done: true }] });
    expect(res.status).toBe(200);
    expect(res.body.item.steps).toEqual([{ text: 'c', done: true }]);
    const cleared = await request(app).patch(`/api/r/chores/${id}`).set(auth).send({ steps: [] });
    expect(cleared.body.item.steps).toEqual([]);
  });
  test('/api/meta lists the type with its effective max', async () => {
    const res = await request(app).get('/api/meta').set(auth);
    const fields = res.body.resources.find((r) => r.key === 'chores').fields;
    expect(fields.find((f) => f.name === 'steps')).toMatchObject({ type: 'checklist', max: 3, list: true });
    expect(fields.find((f) => f.name === 'more')).toMatchObject({ type: 'checklist', max: 50 });
  });
});

describe('checklist CSV, PDF and OpenAPI', () => {
  test('format and parse round-trip', () => {
    const items = [{ text: 'a', done: true }, { text: 'b, c', done: false }];
    expect(formatChecklist(items)).toBe('[x] a; [ ] b, c');
    expect(parseChecklist('[x] a; [ ] b, c')).toEqual(items);
    expect(parseChecklist('plain; [X] big')).toEqual([{ text: 'plain', done: false }, { text: 'big', done: true }]);
  });
  test('export writes [x] text; [ ] text', async () => {
    await create({ title: 'Export me', steps: [{ text: 'one', done: true }, { text: 'two', done: false }] });
    const res = await request(app).get('/api/r/chores/export').set(auth);
    expect(res.status).toBe(200);
    expect(res.text).toContain('[x] one; [ ] two');
  });
  test('import parses the same format (dry run validates, real run creates)', async () => {
    const csv = 'Title,Steps\r\nA,[x] one; [ ] two\r\nB,\r\nC,[ ] 1; [ ] 2; [ ] 3; [ ] 4\r\n';
    const dry = await request(app).post('/api/r/chores/import').set(auth).send({ csv });
    expect(dry.status).toBe(200);
    expect(dry.body.valid).toBe(2);
    expect(dry.body.errors).toHaveLength(1);
    expect(dry.body.errors[0]).toMatchObject({ row: 4 });
    expect(dry.body.errors[0].message).toMatch(/steps/);
    const real = await request(app).post('/api/r/chores/import').set(auth).send({ csv, dryRun: false });
    expect(real.body.created).toBe(2);
    const a = await chores.model.findOne({ title: 'A' }).lean();
    expect(a.steps).toEqual([{ text: 'one', done: true }, { text: 'two', done: false }]);
  });
  test('reports show "done/total done"', () => {
    expect(formatCell([{ text: 'a', done: true }, { text: 'b', done: false }, { text: 'c', done: true }], 'checklist')).toBe('2/3 done');
    expect(formatCell([], 'checklist')).toBe('\u2014');
    expect(formatCell(undefined, 'checklist')).toBe('\u2014');
  });
  test('the OpenAPI document describes the field as an array of items', () => {
    const doc = buildOpenApi(db.registry, config);
    expect(doc.components.schemas.ChoresInput.properties.steps).toMatchObject({ type: 'array', maxItems: 3 });
    expect(doc.components.schemas.ChoresInput.properties.steps.items.properties.done.type).toBe('boolean');
  });
  test('the superuser role name is configured (sanity)', () => {
    expect(superRole).toBe(config.roles[0]);
  });
});

