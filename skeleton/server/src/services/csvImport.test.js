import request from 'supertest';
import jwt from 'jsonwebtoken';
import fc from 'fast-check';
import { defineResource } from '../core/defineResource.js';
import { createApp } from '../app.js';
import { parseCsv } from './csvImportService.js';
import { csvCell } from './csvService.js';
import { startDb, makeActor } from '../../test/db.js';
import { TEST_SECRET } from '../../test/helpers.js';
import config from '../../crypt.config.js';

const [, writerRole, readerRole] = config.roles;

const runes = defineResource({
  key: 'runes',
  label: 'Runes',
  fields: {
    name: { type: 'string', label: 'Name', required: true, list: true, search: true, unique: true },
    power: { type: 'number', label: 'Power', min: 0, max: 100 },
    kind: { type: 'enum', label: 'Kind', values: ['Fire', 'Frost'], default: 'Fire', filter: true },
    tags: { type: 'enum', label: 'Tags', multiple: true, values: ['Old', 'Rare'] },
    active: { type: 'boolean', label: 'Active' },
    carvedOn: { type: 'date', label: 'Carved on' },
  },
  permissions: { read: [writerRole, readerRole], create: [writerRole], update: [], delete: [] },
});

let db;
let app;
let writer;
let reader;
const tokenFor = (a, role) => ({ Authorization: `Bearer ${jwt.sign({ userId: a.userId, role, name: role }, TEST_SECRET)}` });

beforeAll(async () => {
  db = await startDb([runes]);
  app = await createApp();
  writer = tokenFor(await makeActor(writerRole, writerRole), writerRole);
  reader = tokenFor(await makeActor(readerRole, readerRole), readerRole);
});
afterAll(() => db.stop());
beforeEach(() => db.clear());

const post = (body, auth = writer) => request(app).post('/api/r/runes/import').set(auth).send(body);

describe('parseCsv', () => {
  test('handles quotes, escaped quotes, embedded newlines, CRLF, BOM and blank lines', () => {
    const rows = parseCsv('\uFEFFa,b\r\n"x,1","say ""hi"""\r\n\r\n"l1\nl2",z');
    expect(rows).toEqual([['a', 'b'], ['x,1', 'say "hi"'], ['l1\nl2', 'z']]);
  });
  test('rejects an unterminated quote', () => {
    expect(() => parseCsv('a,b\n"oops,1')).toThrow(/unterminated/);
  });
  test('round-trips arbitrary cells written by csvCell', () => {
    const cell = fc.string({ maxLength: 12 }).filter((s) => !/^[=+\-@\t\r]/.test(s) && s.trim() !== '');
    fc.assert(
      fc.property(fc.array(fc.array(cell, { minLength: 2, maxLength: 2 }), { minLength: 1, maxLength: 6 }), (table) => {
        const text = table.map((r) => r.map(csvCell).join(',')).join('\r\n');
        expect(parseCsv(text)).toEqual(table);
      }),
      { numRuns: 100 }
    );
  });
});

describe('POST /api/r/:key/import', () => {
  const good = 'Name,Power,Kind,Tags,Active,Carved on\nIsa,10,frost,Old;Rare,yes,2030-01-02\nFehu,20,Fire,,no,\n';

  test('dry run is the default: validates and writes nothing', async () => {
    const res = await post({ csv: good });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ dryRun: true, total: 2, valid: 2, created: 0, errors: [] });
    expect(res.body.preview[0]).toMatchObject({ name: 'Isa', power: 10, kind: 'Frost', tags: ['Old', 'Rare'], active: true });
    expect(await runes.model.countDocuments()).toBe(0);
  });

  test('dryRun:false creates the valid rows and reports the bad ones by row number', async () => {
    const csv = 'Name,Power,Kind\nIsa,10,Frost\n,5,Fire\nUruz,500,Fire\nAnsuz,abc,Fire\nGebo,1,Wind\n';
    const res = await post({ csv, dryRun: false });
    expect(res.status).toBe(200);
    expect(res.body.created).toBe(1);
    expect(res.body.errors.map((e) => e.row)).toEqual([3, 4, 5, 6]);
    expect(res.body.errors[2].message).toMatch(/not a number/);
    expect(res.body.errors[3].message).toMatch(/must be one of/);
    expect(await runes.model.countDocuments()).toBe(1);
  });

  test('flags duplicates inside the file and database duplicates at import time', async () => {
    const dry = await post({ csv: 'Name\nIsa\nisa\n' });
    expect(dry.body.errors).toHaveLength(1);
    expect(dry.body.errors[0]).toMatchObject({ row: 3 });
    await runes.model.create({ name: 'Isa' });
    const real = await post({ csv: 'Name\nIsa\nNaud\n', dryRun: false });
    expect(real.body.created).toBe(1);
    expect(real.body.errors).toHaveLength(1);
  });

  test('reports ignored columns and rejects a CSV with no matching column', async () => {
    const res = await post({ csv: 'Name,Mystery\nIsa,x\n' });
    expect(res.body.ignoredColumns).toEqual(['Mystery']);
    expect((await post({ csv: 'foo,bar\n1,2\n' })).status).toBe(400);
    expect((await post({ csv: 'Name\n' })).status).toBe(400);
    expect((await post({})).status).toBe(400);
  });

  test('requires create permission and authentication', async () => {
    expect((await post({ csv: good }, reader)).status).toBe(403);
    expect((await request(app).post('/api/r/runes/import').send({ csv: good })).status).toBe(401);
  });

  test('export then import restores the same records', async () => {
    await runes.model.insertMany([
      { name: 'Isa, cold', power: 7, kind: 'Frost', tags: ['Old'], active: true, carvedOn: new Date('2030-05-06') },
      { name: 'Fehu', power: 0, kind: 'Fire', active: false },
    ]);
    const exported = (await request(app).get('/api/r/runes/export').set(writer)).text;
    await runes.model.deleteMany({});
    const res = await post({ csv: exported, dryRun: false });
    expect(res.body).toMatchObject({ created: 2, errors: [] });
    const back = await runes.model.find().sort({ name: 1 }).lean();
    expect(back.map((r) => r.name)).toEqual(['Fehu', 'Isa, cold']);
    expect(back[1]).toMatchObject({ power: 7, kind: 'Frost', tags: ['Old'], active: true });
  });
});
