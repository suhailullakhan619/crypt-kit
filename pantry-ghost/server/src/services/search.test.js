import request from 'supertest';
import jwt from 'jsonwebtoken';
import { defineResource } from '../core/defineResource.js';
import { createApp } from '../app.js';
import { startDb, makeActor } from '../../test/db.js';
import { TEST_SECRET } from '../../test/helpers.js';
import config from '../../crypt.config.js';

const [superRole, midRole, lowRole] = config.roles;
const bearer = (a) => ({ Authorization: `Bearer ${jwt.sign({ userId: a.userId, role: a.role, name: a.name }, TEST_SECRET)}` });

const docs = defineResource({
  key: 'docs',
  label: 'Docs',
  icon: 'file',
  titleField: 'title',
  fields: {
    title: { type: 'string', label: 'Title', required: true, search: true },
    summary: { type: 'text', label: 'Summary', search: true },
    pin: { type: 'string', label: 'Pin', search: true, secret: true },
    status: { type: 'enum', label: 'Status', values: ['Open', 'Archived'], default: 'Open' },
  },
  permissions: { read: [midRole, lowRole], create: [midRole], update: [midRole], delete: [] },
  softDelete: { field: 'status', value: 'Archived', at: 'archivedAt' },
});
const vault = defineResource({
  key: 'vault',
  label: 'Vault',
  titleField: 'name',
  fields: { name: { type: 'string', label: 'Name', required: true, search: true } },
  permissions: { read: [midRole], create: [midRole], update: [midRole], delete: [] },
});
const plain = defineResource({
  key: 'plain',
  label: 'Plain',
  titleField: 'name',
  fields: { name: { type: 'string', label: 'Name', required: true } },
  permissions: { read: [midRole], create: [midRole], update: [midRole], delete: [] },
});

let db;
let app;
let member;
let viewer;
let admin;

beforeAll(async () => {
  db = await startDb([docs, vault, plain]);
  app = await createApp();
});
afterAll(() => db.stop());
beforeEach(async () => {
  await db.clear();
  member = await makeActor(midRole, 'Mia');
  viewer = await makeActor(lowRole, 'Vic');
  admin = await makeActor(superRole, 'Root');
});

const add = (key, body) => request(app).post(`/api/r/${key}`).set(bearer(member)).send(body);
const search = (q, who = member) => request(app).get('/api/search').set(bearer(who)).query({ q });
const group = (res, key) => res.body.results.find((g) => g.key === key);

describe('global search', () => {
  test('requires authentication', async () => {
    expect((await request(app).get('/api/search').query({ q: 'abc' })).status).toBe(401);
  });

  test('short, blank, missing or over-long q returns empty results', async () => {
    await add('docs', { title: 'Alpha' });
    for (const q of ['', 'a', '  a ', undefined, 'x'.repeat(101)]) {
      const res = await search(q);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ results: [] });
    }
  });

  test('result shape and case-insensitive match across searchable fields', async () => {
    const d = await add('docs', { title: 'Zebra plan', summary: 'nothing here' });
    await add('docs', { title: 'Other', summary: 'The ZEBRA crossing is long' });
    const res = await search('zebra');
    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(1);
    const g = res.body.results[0];
    expect(g).toMatchObject({ key: 'docs', label: 'Docs', icon: 'file' });
    expect(g.items).toHaveLength(2);
    const first = g.items.find((i) => i._id === d.body.item._id);
    expect(Object.keys(first).sort()).toEqual(['_id', 'subtitle', 'title']);
    expect(first.title).toBe('Zebra plan');
    expect(first.subtitle).toBeNull();
    const second = g.items.find((i) => i.title === 'Other');
    expect(second.subtitle).toBe('The ZEBRA crossing is long');
  });

  test('regex characters are escaped: "a.c" does not match "abc"', async () => {
    await add('docs', { title: 'abc' });
    await add('docs', { title: 'a.c literal' });
    const res = await search('a.c');
    expect(group(res, 'docs').items.map((i) => i.title)).toEqual(['a.c literal']);
    expect((await search('.*')).body.results).toEqual([]);
    expect((await search('(')).status).toBe(200);
  });

  test('max 5 items per resource', async () => {
    for (let i = 0; i < 8; i += 1) await add('docs', { title: `needle ${i}` });
    const res = await search('needle');
    expect(group(res, 'docs').items).toHaveLength(5);
  });

  test('soft-deleted records are excluded', async () => {
    const a = await add('docs', { title: 'ghost one' });
    await add('docs', { title: 'ghost two' });
    await docs.model.updateOne({ _id: a.body.item._id }, { status: 'Archived' });
    const res = await search('ghost');
    expect(group(res, 'docs').items.map((i) => i.title)).toEqual(['ghost two']);
  });

  test('secret fields are not searched', async () => {
    await add('docs', { title: 'Plain', pin: 'hunter2' });
    expect((await search('hunter2')).body.results).toEqual([]);
  });

  test('resources the role cannot read are absent; non-searchable ones never appear', async () => {
    await add('docs', { title: 'shared word' });
    await add('vault', { name: 'shared word' });
    await add('plain', { name: 'shared word' });
    const asMember = await search('shared');
    expect(asMember.body.results.map((g) => g.key).sort()).toEqual(['docs', 'vault']);
    const asViewer = await search('shared', viewer);
    expect(asViewer.body.results.map((g) => g.key)).toEqual(['docs']);
    const asAdmin = await search('shared', admin);
    expect(asAdmin.body.results.map((g) => g.key).sort()).toEqual(['docs', 'vault']);
  });

  test('a record with no match returns no group', async () => {
    await add('docs', { title: 'something' });
    expect((await search('zzzz')).body).toEqual({ results: [] });
  });
});