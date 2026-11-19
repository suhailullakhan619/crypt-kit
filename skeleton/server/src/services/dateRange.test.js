import request from 'supertest';
import jwt from 'jsonwebtoken';
import { defineResource } from '../core/defineResource.js';
import { createApp } from '../app.js';
import { startDb, makeActor } from '../../test/db.js';
import { TEST_SECRET } from '../../test/helpers.js';
import config from '../../crypt.config.js';

const [superRole, midRole, lowRole] = config.roles;
const bearer = (a) => ({ Authorization: `Bearer ${jwt.sign({ userId: a.userId, role: a.role, name: a.name }, TEST_SECRET)}` });

const events = defineResource({
  key: 'events',
  label: 'Events',
  titleField: 'title',
  fields: {
    title: { type: 'string', label: 'Title', required: true, list: true },
    when: { type: 'date', label: 'When', list: true },
    secretDate: { type: 'date', label: 'Secret date', secret: true },
  },
  permissions: { read: [midRole], create: [midRole], update: [midRole], delete: [] },
});

let db;
let app;
let auth;

beforeAll(async () => {
  db = await startDb([events]);
  app = await createApp();
});
afterAll(() => db.stop());
beforeEach(async () => {
  await db.clear();
  auth = bearer(await makeActor(midRole, 'Dana'));
  const rows = [
    ['early', '2026-10-31T23:59:59.000Z'],
    ['first', '2026-11-01T00:00:00.000Z'],
    ['noon', '2026-11-15T12:00:00.000Z'],
    ['lastday', '2026-11-30T18:30:00.000Z'],
    ['later', '2026-12-01T00:00:00.000Z'],
  ];
  for (const [title, when] of rows) await events.model.create({ title, when: new Date(when), secretDate: new Date(when) });
  await events.model.create({ title: 'undated' });
});

const list = (query) => request(app).get('/api/r/events').set(auth).query({ limit: 100, sort: 'when', ...query });
const titles = (res) => res.body.items.map((i) => i.title);

describe('date-range filters', () => {
  test('_from only is inclusive', async () => {
    expect(titles(await list({ when_from: '2026-11-15' }))).toEqual(['noon', 'lastday', 'later']);
  });

  test('_to only with a date includes that whole day', async () => {
    expect(titles(await list({ when_to: '2026-11-30' }))).toEqual(['early', 'first', 'noon', 'lastday']);
  });

  test('both bounds together', async () => {
    const res = await list({ when_from: '2026-11-01', when_to: '2026-11-30' });
    expect(res.status).toBe(200);
    expect(titles(res)).toEqual(['first', 'noon', 'lastday']);
    expect(res.body.total).toBe(3);
  });

  test('a single day as both bounds', async () => {
    expect(titles(await list({ when_from: '2026-11-15', when_to: '2026-11-15' }))).toEqual(['noon']);
  });

  test('ISO datetime bounds are exact and inclusive', async () => {
    const res = await list({ when_from: '2026-11-15T12:00:00Z', when_to: '2026-11-30T18:30:00.000Z' });
    expect(titles(res)).toEqual(['noon', 'lastday']);
    expect(titles(await list({ when_to: '2026-11-15T11:59:59Z' }))).toEqual(['early', 'first']);
  });

  test('works on a date field that is not filter: true; undated records are excluded', async () => {
    expect(events.def.fields.when.filter).toBeUndefined();
    const res = await list({ when_from: '2000-01-01' });
    expect(res.body.total).toBe(5);
  });

  test('empty values are ignored', async () => {
    expect((await list({ when_from: '', when_to: '' })).body.total).toBe(6);
  });

  test.each(['yesterday', '2026-13-01', '2026-02-30', '11/01/2026', '2026-11-01 10:00', '12345'])('invalid value %s is 400', async (bad) => {
    for (const p of ['when_from', 'when_to']) {
      const res = await list({ [p]: bad });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(new RegExp(p));
    }
  });

  test('repeated parameter is 400', async () => {
    const res = await request(app).get('/api/r/events?when_from=2026-11-01&when_from=2026-11-02').set(auth);
    expect(res.status).toBe(400);
  });

  test('secret date fields do not accept ranges (parameter is ignored)', async () => {
    expect((await list({ secretDate_from: '2030-01-01' })).body.total).toBe(6);
    expect((await list({ secretDate_to: 'garbage' })).status).toBe(200);
  });

  test('unknown fields and non-date fields ignore _from/_to', async () => {
    expect((await list({ title_from: '2030-01-01', nope_to: 'x' })).body.total).toBe(6);
  });

  test('export honours the range', async () => {
    const res = await request(app).get('/api/r/events/export').set(auth).query({ when_from: '2026-11-01', when_to: '2026-11-30' });
    expect(res.status).toBe(200);
    for (const t of ['first', 'noon', 'lastday']) expect(res.text).toContain(t);
    for (const t of ['early', 'later', 'undated']) expect(res.text).not.toContain(t);
    const bad = await request(app).get('/api/r/events/export').set(auth).query({ when_from: 'nope' });
    expect(bad.status).toBe(400);
  });
});