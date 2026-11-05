// Integration: Lab Ledger over HTTP — seed, request → approve → overdue (sweeper, injected now) →
// return Damaged → Maintenance; labels, scan lookup, voice, dashboard panel, calibration audit.
// Validates: lab-ledger Requirements 2.1, 3.1–3.9, 4.1, 5.1, 5.3, 6.1, 7.1–7.3
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import request from 'supertest';
import { startLabDb, equipment, checkouts, calibrations, labs } from './lab.js';
import { createApp } from '../src/app.js';
import { runSeed } from '../src/seed/index.js';
import { buildIntents } from '../src/core/intentRegistry.js';
import { setReportDir } from '../src/services/reportService.js';
import { sweep } from '../src/services/sweeperService.js';
import { OUT_STATUSES, CHECKOUT_STATUS } from '../src/resources/checkouts.js';

const DAY = 86400000;
let db;
let app;
let dir;
const tokens = {};

const binary = (res, cb) => { const chunks = []; res.on('data', (c) => chunks.push(c)); res.on('end', () => cb(null, Buffer.concat(chunks))); };
const as = (who) => ({ Authorization: `Bearer ${tokens[who]}` });

beforeAll(async () => {
  db = await startLabDb();
  db.ctx.intents = await buildIntents(db.registry); // app intents from src/intents + built-ins
  dir = await mkdtemp(path.join(os.tmpdir(), 'lab-int-'));
  setReportDir(dir);
  app = await createApp();
  await runSeed(db.registry);
  for (const [who, email, password] of [
    ['manager', 'manager@lab.test', 'lab-manager-demo'],
    ['tech', 'tech@lab.test', 'lab-tech-demo'],
    ['student', 'student@lab.test', 'lab-student-demo'],
  ]) {
    const res = await request(app).post('/api/auth/login').send({ email, password });
    expect(res.status).toBe(200);
    tokens[who] = res.body.token;
  }
});
afterAll(async () => {
  await db.stop();
  await rm(dir, { recursive: true, force: true });
});

test('seed: 3 labs, 40 items, 25 calibrations, every checkout status, 2 overdue — and idempotent', async () => {
  expect(await labs.model.countDocuments()).toBe(3);
  expect(await equipment.model.countDocuments()).toBe(40);
  expect(await calibrations.model.countDocuments()).toBe(25);
  const statuses = await checkouts.model.distinct('status');
  expect(statuses.sort()).toEqual([...CHECKOUT_STATUS].sort());
  expect(await checkouts.model.countDocuments({ status: 'Overdue' })).toBe(2);
  expect((await equipment.model.distinct('category')).length).toBe(7);

  // seed invariant: CheckedOut iff exactly one out loan
  for (const item of await equipment.model.find().lean()) {
    const out = await checkouts.model.countDocuments({ equipment: item._id, status: { $in: OUT_STATUSES } });
    expect(out <= 1 && (item.status === 'CheckedOut') === (out === 1)).toBe(true);
  }
  const again = await runSeed(db.registry);
  expect(Object.values(again).every((n) => n === 0)).toBe(true);
});

test('permissions: labs/equipment writes by role; generic checkout mutations are LabManager-only', async () => {
  const meta = await request(app).get('/api/meta').set(as('student'));
  const byKey = Object.fromEntries(meta.body.resources.map((r) => [r.key, r.permissions]));
  expect(byKey.equipment).toEqual({ read: true, create: false, update: false, delete: false });
  expect(byKey.calibrations.create).toBe(false);

  expect((await request(app).post('/api/r/labs').set(as('tech')).send({ name: 'Annex' })).status).toBe(403);
  expect((await request(app).post('/api/r/labs').set(as('manager')).send({ name: 'Annex Lab' })).status).toBe(201);
  expect((await request(app).post('/api/r/equipment').set(as('tech')).send({ name: 'X', assetTag: 'x-1' })).status).toBe(403);
  const created = await request(app).post('/api/r/equipment').set(as('manager')).send({ name: 'Signal Tracer', assetTag: 'll-0901', category: 'Electronics' });
  expect(created.status).toBe(201);
  expect(created.body.item.assetTag).toBe('LL-0901'); // normalised by the beforeCreate hook
  expect((await request(app).post('/api/r/checkouts').set(as('tech')).send({})).status).toBe(403);
  expect((await request(app).patch(`/api/r/checkouts/${(await checkouts.model.findOne().lean())._id}`).set(as('student')).send({ purpose: 'x' })).status).toBe(403);
});

test('workflow: request → approve (double approval 409) → overdue by sweeper → return Damaged → Maintenance', async () => {
  const item = await equipment.model.findOne({ name: 'Logic Analyzer' }).lean();
  const now = Date.now();

  const bad = await request(app).post('/api/checkouts').set(as('student')).send({ equipmentId: String(item._id), dueBack: new Date(now + 45 * DAY).toISOString() });
  expect(bad.status).toBe(400);

  const req = await request(app).post('/api/checkouts').set(as('student')).send({ equipmentId: String(item._id), dueBack: new Date(now + 2 * DAY).toISOString(), purpose: 'Bus decoding' });
  expect(req.status).toBe(201);
  expect(req.body.checkout).toMatchObject({ status: 'Requested', borrower: { name: 'Priya Student' } });
  const id = req.body.checkout._id;

  expect((await request(app).post(`/api/checkouts/${id}/approve`).set(as('student'))).status).toBe(403);
  const [a1, a2] = await Promise.all([
    request(app).post(`/api/checkouts/${id}/approve`).set(as('tech')),
    request(app).post(`/api/checkouts/${id}/approve`).set(as('manager')),
  ]);
  expect([a1.status, a2.status].sort()).toEqual([200, 409]);
  expect((await equipment.model.findById(item._id).lean()).status).toBe('CheckedOut');

  // a second request for an item that is out → 409 naming the status
  const busy = await request(app).post('/api/checkouts').set(as('student')).send({ equipmentId: String(item._id), dueBack: new Date(now + 2 * DAY).toISOString() });
  expect(busy.status).toBe(409);
  expect(busy.body.error).toMatch(/CheckedOut/);

  // workflowOnly: generic PATCH cannot free it
  const forged = await request(app).patch(`/api/r/equipment/${item._id}`).set(as('manager')).send({ status: 'Available' });
  expect(forged.status).toBe(409);

  await sweep(db.registry, new Date(now + 3 * DAY));
  expect((await checkouts.model.findById(id).lean()).status).toBe('Overdue');

  const ret = await request(app).post(`/api/checkouts/${id}/return`).set(as('tech')).send({ condition: 'Damaged', notes: 'Probe clip snapped' });
  expect(ret.status).toBe(200);
  expect(ret.body.checkout).toMatchObject({ status: 'Returned', returnCondition: 'Damaged', receivedBy: { name: 'Tomas Technician' } });
  const after = await equipment.model.findById(item._id).lean();
  expect(after).toMatchObject({ status: 'Maintenance', condition: 'Damaged' });

  const timeline = await request(app).get(`/api/r/equipment/${item._id}/activity`).set(as('student'));
  expect(timeline.body.items.filter((e) => e.action === 'status').map((e) => e.diff.status)).toEqual([['CheckedOut', 'Maintenance'], ['Available', 'CheckedOut']]);

  const mine = await request(app).get('/api/checkouts/mine').set(as('student'));
  expect(mine.status).toBe(200);
  expect(mine.body.items.some((c) => c._id === id)).toBe(true);
});

test('reject needs a reason; students cancel only their own requests', async () => {
  const item = await equipment.model.findOne({ name: 'Optical Bench Kit' }).lean();
  const due = new Date(Date.now() + 3 * DAY).toISOString();
  const r1 = (await request(app).post('/api/checkouts').set(as('student')).send({ equipmentId: String(item._id), dueBack: due })).body.checkout._id;
  expect((await request(app).post(`/api/checkouts/${r1}/reject`).set(as('tech')).send({})).status).toBe(400);
  const rej = await request(app).post(`/api/checkouts/${r1}/reject`).set(as('tech')).send({ reason: 'Bench booked' });
  expect(rej.body.checkout).toMatchObject({ status: 'Rejected', rejectReason: 'Bench booked' });

  const r2 = (await request(app).post('/api/checkouts').set(as('tech')).send({ equipmentId: String(item._id), dueBack: due })).body.checkout._id;
  expect((await request(app).post(`/api/checkouts/${r2}/cancel`).set(as('student'))).status).toBe(403);
  expect((await request(app).post(`/api/checkouts/${r2}/cancel`).set(as('tech'))).body.checkout.status).toBe('Cancelled');
});

test('calibration via the generic API schedules the next date', async () => {
  const item = await equipment.model.findOne({ name: 'Analytical Balance' }).lean();
  expect(item.status).toBe('CalibrationDue');
  const res = await request(app).post('/api/r/calibrations').set(as('tech')).send({ equipment: String(item._id), performedAt: '2026-01-15', result: 'Pass', certificateNo: 'CAL-X' });
  expect(res.status).toBe(201);
  const after = await equipment.model.findById(item._id).lean();
  expect(after.status).toBe('Available');
  expect(after.nextCalibration.toISOString()).toBe(new Date(Date.UTC(2026, 0, 15) + 180 * DAY).toISOString());
  expect((await request(app).post('/api/r/calibrations').set(as('student')).send({ equipment: String(item._id), performedAt: '2026-01-15' })).status).toBe(403);
  const future = await request(app).post('/api/r/calibrations').set(as('tech')).send({ equipment: String(item._id), performedAt: new Date(Date.now() + 5 * DAY).toISOString() });
  expect(future.status).toBe(400);
});

test('scan lookup by tag and QR label PDF', async () => {
  const scan = await request(app).get('/api/equipment/by-tag/ll-0001').set(as('student'));
  expect(scan.status).toBe(200);
  expect(scan.body.item).toMatchObject({ name: 'Digital Oscilloscope', assetTag: 'LL-0001', status: 'CheckedOut', lab: { name: 'Physics B-12' } });
  expect(scan.body.activeCheckout.borrower).toEqual({ _id: expect.any(String), name: 'Priya Student' });
  expect(Object.keys(scan.body.activeCheckout.borrower)).toEqual(['_id', 'name']);

  const missing = await request(app).get('/api/equipment/by-tag/NOPE-1').set(as('student'));
  expect(missing.status).toBe(404);
  expect(missing.body.error).toBe('No equipment haunts this tag');

  const ids = (await equipment.model.find().limit(30).lean()).map((e) => String(e._id));
  expect((await request(app).post('/api/equipment/labels').set(as('student')).send({ ids })).status).toBe(403);
  expect((await request(app).post('/api/equipment/labels').set(as('tech')).send({ ids: [] })).status).toBe(400);
  expect((await request(app).post('/api/equipment/labels').set(as('tech')).send({ ids: Array(61).fill(ids[0]) })).status).toBe(400);
  const pdf = await request(app).post('/api/equipment/labels').set(as('tech')).send({ ids }).buffer(true).parse(binary);
  expect(pdf.status).toBe(200);
  expect(pdf.headers['content-type']).toBe('application/pdf');
  expect(pdf.body.subarray(0, 4).toString()).toBe('%PDF');
  expect((pdf.body.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length).toBe(2); // 30 labels → 2 sheets of 24
});

test('voice: WHO_HAS, IS_AVAILABLE, CALIBRATION_DUE, OVERDUE_RETURNS (names for staff only)', async () => {
  const ask = (who, text) => request(app).post('/api/voice/ask').set(as(who)).send({ text });

  const who = await ask('tech', 'Who has the osciloscope?');
  expect(who.body.intent).toBe('WHO_HAS');
  expect(who.body.answer).toMatch(/^Priya Student has the Digital Oscilloscope \(LL-0001\), due back /);

  const shelf = await ask('student', 'who has the function generator');
  expect(shelf.body.answer).toBe('Nobody — the Function Generator (LL-0002) is on the shelf in Physics B-12.');

  const many = await ask('student', 'who has the micropipette set');
  expect(many.body.answer).toMatch(/^I found 2: LL-0022 and LL-0023/);

  const avail = await ask('student', 'Is the centrifuge available?');
  expect(avail.body.intent).toBe('IS_AVAILABLE');
  expect(avail.body.answer).toMatch(/^I found 2|^Yes/);

  const cal = await ask('tech', 'What needs calibration this month?');
  expect(cal.body.intent).toBe('CALIBRATION_DUE');
  expect(cal.body.data.count).toBeGreaterThanOrEqual(2);

  const overdueTech = await ask('tech', 'Which items are overdue?');
  expect(overdueTech.body.intent).toBe('OVERDUE_RETURNS');
  expect(overdueTech.body.answer).toMatch(/with Priya Student/);
  const overdueStudent = await ask('student', 'Which items are overdue?');
  expect(overdueStudent.body.answer).toMatch(/^\d+ items? (is|are) overdue\.$/);
  expect(overdueStudent.body.data.items).toEqual([]);

  const ex = await request(app).get('/api/voice/examples').set(as('student'));
  expect(ex.body.examples).toEqual(expect.arrayContaining(['who has the oscilloscope', 'which items are overdue']));
});

test('dashboard "Out right now" panel lists active loans, overdue first', async () => {
  const dash = await request(app).get('/api/dashboard').set(as('student'));
  const panel = dash.body.panels.find((p) => p.key === 'outNow');
  expect(panel.title).toBe('Out right now');
  expect(panel.data.total).toBe(await checkouts.model.countDocuments({ status: { $in: OUT_STATUSES } }));
  expect(panel.data.rows[0].overdue).toBe(true);
  expect(panel.data.rows.find((r) => r.assetTag === 'LL-0001')).toMatchObject({ item: 'Digital Oscilloscope', borrower: 'Priya Student' });
  for (const r of panel.data.rows) expect(r.overdue).toBe(r.status === 'Overdue' || new Date(r.dueBack) < new Date());
  expect(panel.data.rows.findIndex((r) => !r.overdue)).toBeGreaterThan(panel.data.rows.findLastIndex((r) => r.status === 'Overdue'));
});

test('Calibration Audit report preset produces a PDF of calibrated equipment', async () => {
  const rep = await request(app).post('/api/reports').set(as('manager'))
    .send({ resource: 'equipment', filters: { requiresCalibration: 'true' }, title: 'Calibration Audit' });
  expect(rep.status).toBe(201);
  expect(rep.body.report.count).toBe(await equipment.model.countDocuments({ requiresCalibration: true, status: { $ne: 'Retired' } }));
  const pdf = await request(app).get(`/api/reports/${rep.body.report._id}/download`).set(as('manager')).buffer(true).parse(binary);
  expect(pdf.status).toBe(200);
  expect(pdf.body.subarray(0, 4).toString()).toBe('%PDF');
});
