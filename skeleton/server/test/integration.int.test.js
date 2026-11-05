// Integration: login → create note → transition → activity → report download (task 11.2)
// Validates: Requirements 3.1, 5.1, 5.8, 6.2, 10.4, 15.2
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import request from 'supertest';
import { startDb } from './db.js';
import { createApp } from '../src/app.js';
import { runSeed } from '../src/seed/index.js';
import { buildIntents } from '../src/core/intentRegistry.js';
import { setReportDir } from '../src/services/reportService.js';
import { sweep } from '../src/services/sweeperService.js';
import notes from '../src/resources/notes.js';

let db;
let app;
let dir;

beforeAll(async () => {
  db = await startDb([notes]);
  db.ctx.intents = await buildIntents(db.registry, { appIntents: [] });
  dir = await mkdtemp(path.join(os.tmpdir(), 'crypt-int-'));
  setReportDir(dir);
  app = await createApp();
});
afterAll(async () => {
  await db.stop();
  await rm(dir, { recursive: true, force: true });
});

const login = async (email, password) => (await request(app).post('/api/auth/login').send({ email, password })).body.token;

test('seed is idempotent', async () => {
  const first = await runSeed(db.registry);
  const second = await runSeed(db.registry);
  expect(first.notes).toBe(8);
  expect(second.notes).toBe(0);
  expect(await notes.model.countDocuments()).toBe(8);
});

test('full note lifecycle over HTTP', async () => {
  const member = await login('member@crypt.test', 'crypt-member-demo');
  const viewer = await login('viewer@crypt.test', 'crypt-viewer-demo');
  expect(member).toBeTruthy();

  const created = await request(app).post('/api/r/notes').set('Authorization', `Bearer ${member}`)
    .send({ title: 'Summon integration test', priority: 'High', dueDate: '2020-01-01' });
  expect(created.status).toBe(201);
  const id = created.body.item._id;

  // sweeper flags the past-due note as Overdue
  const swept = await sweep(db.registry);
  expect(swept.notes).toBeGreaterThanOrEqual(1);
  const overdue = await request(app).get(`/api/r/notes/${id}`).set('Authorization', `Bearer ${viewer}`);
  expect(overdue.body.item.status).toBe('Overdue');

  const done = await request(app).patch(`/api/r/notes/${id}`).set('Authorization', `Bearer ${member}`).send({ status: 'Done' });
  expect(done.status).toBe(200);

  const timeline = await request(app).get(`/api/r/notes/${id}/activity`).set('Authorization', `Bearer ${viewer}`);
  expect(timeline.body.items.map((e) => e.action)).toEqual(['status', 'update', 'status', 'create']);
  expect(timeline.body.items[2].actorName).toBe('System');

  const voice = await request(app).post('/api/voice/ask').set('Authorization', `Bearer ${viewer}`).send({ text: 'How many notes are done?' });
  expect(voice.body.intent).toBe('COUNT_BY_VALUE');
  expect(voice.body.data).toBe(2);

  const report = await request(app).post('/api/reports').set('Authorization', `Bearer ${viewer}`)
    .send({ resource: 'notes', filters: { priority: 'High' }, title: 'High priority' });
  expect(report.status).toBe(201);
  expect(report.body.report.count).toBe(3);

  const pdf = await request(app).get(`/api/reports/${report.body.report._id}/download`).set('Authorization', `Bearer ${viewer}`)
    .buffer(true).parse((res, cb) => { const chunks = []; res.on('data', (c) => chunks.push(c)); res.on('end', () => cb(null, Buffer.concat(chunks))); });
  expect(pdf.status).toBe(200);
  expect(pdf.headers['content-type']).toBe('application/pdf');
  expect(pdf.body.subarray(0, 4).toString()).toBe('%PDF');

  const dash = await request(app).get('/api/dashboard').set('Authorization', `Bearer ${viewer}`);
  const nd = dash.body.resources.find((r) => r.key === 'notes');
  expect(nd.total).toBe(9);
  expect(dash.body.recent.length).toBe(10);
});
