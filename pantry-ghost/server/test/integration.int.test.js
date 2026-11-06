// Integration: seed → login per role → intake → FEFO plan/commit → voice → impact report
// Validates: Requirements 2.1–2.5, 3.2, 4.5, 5.3–5.5, 6.1, 6.2, 7.1–7.4
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import request from 'supertest';
import { startPantry, pdfText, HOUSEHOLD_CODE, donors, stockLots, households, distributions } from './pantry.js';
import { runSeed } from '../src/seed/index.js';
import { setReportDir } from '../src/services/reportService.js';
import { reclassifyAll } from '../src/services/expiryService.js';
import ActivityLog from '../src/models/ActivityLog.js';

let db;
let app;
let dir;
const tokens = {};
const now = new Date();
const month = now.toISOString().slice(0, 7);

beforeAll(async () => {
  ({ db, app } = await startPantry());
  dir = await mkdtemp(path.join(os.tmpdir(), 'pantry-int-'));
  setReportDir(dir);
});
afterAll(async () => {
  await db.stop();
  await rm(dir, { recursive: true, force: true });
});

const as = (role) => ({ Authorization: `Bearer ${tokens[role]}` });
const binary = (res, cb) => { const c = []; res.on('data', (d) => c.push(d)); res.on('end', () => cb(null, Buffer.concat(c))); };

test('demo seed: counts, idempotence and exact stock math (Req 7.4)', async () => {
  const first = await runSeed(db.registry, { now });
  expect(first).toEqual({ donors: 12, 'stock-lots': 120, households: 45, distributions: 150 });
  expect(await runSeed(db.registry, { now })).toEqual({ donors: 0, 'stock-lots': 0, households: 0, distributions: 0 });

  const lots = await stockLots.model.find().lean();
  const out = new Map();
  for (const d of await distributions.model.find().lean()) for (const l of d.lines) out.set(String(l.lot), (out.get(String(l.lot)) ?? 0) + l.quantity);
  for (const lot of lots) {
    expect(lot.quantity).toBeGreaterThanOrEqual(0);
    expect(lot.receivedQuantity - (out.get(String(lot._id)) ?? 0)).toBe(lot.quantity);
  }
  const statuses = new Set(lots.map((l) => l.status));
  for (const s of ['Fresh', 'ExpiringSoon', 'Expired', 'Depleted', 'Discarded']) expect(statuses).toContain(s);
  expect((await households.model.find().lean()).every((h) => /^H-\d{4}$/.test(h.code))).toBe(true);
  // the seed already classified every lot against `now`: the boot-time job has nothing to change
  expect((await reclassifyAll(db.registry, now)).changed).toBe(0);
});

test('every demo account can sign in with its role', async () => {
  for (const [role, email, password] of [
    ['Coordinator', 'coordinator@pantry.test', 'pantry-coordinator-demo'],
    ['Volunteer', 'volunteer@pantry.test', 'pantry-volunteer-demo'],
    ['Board', 'board@pantry.test', 'pantry-board-demo'],
  ]) {
    const res = await request(app).post('/api/auth/login').send({ email, password });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe(role);
    tokens[role] = res.body.token;
  }
});

test('permission matrix for the four resources (Req 2.1–2.5)', async () => {
  const status = async (role, method, url, body) => (await request(app)[method](url).set(as(role)).send(body)).status;
  expect(await status('Board', 'get', '/api/r/households')).toBe(403);
  expect(await status('Board', 'get', '/api/r/distributions')).toBe(403);
  expect(await status('Board', 'get', '/api/r/donors')).toBe(403);
  expect(await status('Board', 'get', '/api/r/stock-lots')).toBe(200);
  expect(await status('Volunteer', 'post', '/api/r/donors', { name: 'Bakery Bob', type: 'Business' })).toBe(201);
  const donor = (await request(app).get('/api/r/donors?q=Bakery%20Bob').set(as('Volunteer'))).body.items[0];
  expect(await status('Volunteer', 'patch', `/api/r/donors/${donor._id}`, { contact: 'x' })).toBe(403);
  expect(await status('Coordinator', 'patch', `/api/r/donors/${donor._id}`, { contact: 'x' })).toBe(200);
  // distributions: generic mutations are denied to everyone, the superuser included
  const dist = await distributions.model.findOne().lean();
  expect(await status('Coordinator', 'post', '/api/r/distributions', { household: String(dist.household) })).toBe(405);
  expect(await status('Coordinator', 'patch', `/api/r/distributions/${dist._id}`, { totalUnits: 1 })).toBe(405);
  expect(await status('Coordinator', 'delete', `/api/r/distributions/${dist._id}`)).toBe(405);
  expect(await distributions.model.countDocuments()).toBe(150);
});

test('intake: parse is a draft, save is an explicit second call (Req 4.5)', async () => {
  const before = await stockLots.model.countDocuments();
  const parsed = await request(app).post('/api/intake/parse').set(as('Volunteer'))
    .send({ text: 'add twelve cans of black beans expiring March 3rd from Fresh Mart' });
  expect(parsed.status).toBe(200);
  const { draft } = parsed.body;
  expect(draft).toMatchObject({ quantity: 12, unit: 'can', itemName: 'Black beans', category: 'Canned', donorName: 'Fresh Mart', missing: [] });
  expect(await stockLots.model.countDocuments()).toBe(before);

  expect((await request(app).post('/api/intake/parse').set(as('Board')).send({ text: 'add 1 can of soup' })).status).toBe(403);
  const bad = await request(app).post('/api/intake').set(as('Volunteer')).send({ lots: [draft, { itemName: 'Mystery' }] });
  expect(bad.status).toBe(400);
  expect(bad.body).toMatchObject({ index: 1 });
  expect(await stockLots.model.countDocuments()).toBe(before);

  const saved = await request(app).post('/api/intake').set(as('Volunteer'))
    .send({ lots: [draft, { quantity: 6, unit: 'L', itemName: 'Milk', category: 'Dairy', expiresOn: new Date(now.getTime() + 2 * 86400000).toISOString().slice(0, 10) }] });
  expect(saved.status).toBe(201);
  expect(saved.body.items.map((l) => [l.itemName, l.status, l.location, l.donor?.name ?? null])).toEqual([
    ['Black beans', 'Fresh', 'Shelf', 'Fresh Mart'],
    ['Milk', 'ExpiringSoon', 'Fridge', null],
  ]);
  expect(await stockLots.model.countDocuments()).toBe(before + 2);
  expect(await ActivityLog.countDocuments({ resource: 'stock-lots', recordId: saved.body.items[0]._id, action: 'create' })).toBe(1);
});

test('distribute: new household → FEFO plan → commit; 409 shortfall changes nothing (Req 5.3–5.5)', async () => {
  const hh = await request(app).post('/api/r/households').set(as('Volunteer')).send({ size: 4, dietary: ['NutAllergy'], name: 'should be dropped' });
  expect(hh.status).toBe(201);
  expect(hh.body.item.code).toBe('H-0046');
  expect(hh.body.item.name).toBeUndefined();
  const householdId = hh.body.item._id;

  const plan = await request(app).post('/api/distributions/plan').set(as('Volunteer'))
    .send({ householdId, items: [{ category: 'Canned', quantity: 5 }, { category: 'Dairy', quantity: 2 }] });
  expect(plan.status).toBe(200);
  expect(plan.body.shortfalls).toEqual([]);
  expect(plan.body.lines.reduce((s, l) => s + l.quantity, 0)).toBe(7);
  // cold first
  const locs = plan.body.lines.map((l) => l.location);
  expect(locs.indexOf('Fridge')).toBeLessThan(locs.indexOf('Shelf'));

  const lines = plan.body.lines.map(({ lotId, quantity }) => ({ lotId, quantity }));
  const before = await stockLots.model.find({ _id: { $in: lines.map((l) => l.lotId) } }).lean();
  const committed = await request(app).post('/api/distributions').set(as('Volunteer')).send({ householdId, lines });
  expect(committed.status).toBe(201);
  expect(committed.body.distribution).toMatchObject({ totalUnits: 7, household: { code: 'H-0046' } });
  for (const lot of before) {
    const after = await stockLots.model.findById(lot._id).lean();
    const taken = lines.filter((l) => l.lotId === String(lot._id)).reduce((s, l) => s + l.quantity, 0);
    expect(after.quantity).toBe(lot.quantity - taken);
  }

  const snapshot = JSON.stringify(await stockLots.model.find().sort({ _id: 1 }).select({ quantity: 1, status: 1 }).lean());
  const greedy = await request(app).post('/api/distributions').set(as('Volunteer'))
    .send({ householdId, lines: [lines[0], { lotId: lines[0].lotId, quantity: 999 }] });
  expect(greedy.status).toBe(409);
  expect(greedy.body.short).toEqual([expect.objectContaining({ lotId: lines[0].lotId, quantity: 999 })]);
  expect(JSON.stringify(await stockLots.model.find().sort({ _id: 1 }).select({ quantity: 1, status: 1 }).lean())).toBe(snapshot);
  expect(await distributions.model.countDocuments()).toBe(151);

  expect((await request(app).post('/api/distributions/plan').set(as('Board')).send({ householdId, items: [] })).status).toBe(403);
});

test('voice: INTAKE drafts without saving; Board gets aggregates (Req 6.1, 6.2)', async () => {
  const count = await stockLots.model.countDocuments();
  const intake = await request(app).post('/api/voice/ask').set(as('Volunteer')).send({ text: 'log 3 kilos of apples expiring tomorrow from green valley farm' });
  expect(intake.body).toMatchObject({ intent: 'INTAKE', data: { saved: false, draft: { quantity: 3, unit: 'kg', category: 'Produce', donorName: 'Green Valley Farm' } } });
  expect(intake.body.answer).toMatch(/say confirm or edit it on screen/);
  expect(await stockLots.model.countDocuments()).toBe(count);

  const exp = await request(app).post('/api/voice/ask').set(as('Board')).send({ text: 'What expires this week?' });
  expect(exp.body.intent).toBe('EXPIRING_THIS_WEEK');
  expect(exp.body.data.count).toBeGreaterThan(0);

  const served = await request(app).post('/api/voice/ask').set(as('Board')).send({ text: 'How many households did we serve this month?' });
  expect(served.body.intent).toBe('HOUSEHOLDS_SERVED');
  expect(served.body.data.households).toBeGreaterThan(0);
  expect(JSON.stringify(served.body)).not.toMatch(HOUSEHOLD_CODE);

  const ex = await request(app).get('/api/voice/examples').set(as('Board'));
  expect(ex.body.examples).toEqual(expect.arrayContaining(['what expires this week', 'how many households did we serve this month']));
});

test('impact report: Coordinator and Board generate it; listed and downloadable; units include intake (Req 7.1–7.3)', async () => {
  const preview = await request(app).get(`/api/reports/impact/preview?month=${month}`).set(as('Board'));
  expect(preview.status).toBe(200);
  expect(preview.body.impact.byCategory.find((c) => c.category === 'Canned').received).toBeGreaterThanOrEqual(12);
  expect(preview.body.impact.households).toBeGreaterThan(0);
  expect(preview.body.impact.weekly.length).toBeGreaterThanOrEqual(4);

  expect((await request(app).post('/api/reports/impact').set(as('Volunteer')).send({ month })).status).toBe(403);
  expect((await request(app).post('/api/reports/impact').set(as('Board')).send({ month: 'soon' })).status).toBe(400);

  const rep = await request(app).post('/api/reports/impact').set(as('Board')).send({ month });
  expect(rep.status).toBe(201);
  expect(rep.body.report).toMatchObject({ resource: 'stock-lots', filters: { month } });
  expect(rep.body.report.title).toMatch(/^Impact — /);

  const listed = await request(app).get('/api/reports').set(as('Board'));
  expect(listed.body.items.map((r) => r._id)).toContain(rep.body.report._id);

  const pdf = await request(app).get(`/api/reports/${rep.body.report._id}/download`).set(as('Coordinator')).buffer(true).parse(binary);
  expect(pdf.status).toBe(200);
  expect(pdf.body.subarray(0, 4).toString()).toBe('%PDF');
  const text = pdfText(pdf.body);
  expect(text).toMatch(/Units received/);
  expect(text).toMatch(/DISTRIBUTIONS PER WEEK/);
  expect(text).not.toMatch(HOUSEHOLD_CODE);
});

test('dashboard panels for Board: Use first + This month, no household records', async () => {
  const dash = await request(app).get('/api/dashboard').set(as('Board'));
  expect(dash.status).toBe(200);
  expect(dash.body.resources.map((r) => r.key)).toEqual(['stock-lots']);
  const panels = Object.fromEntries(dash.body.panels.map((p) => [p.key, p]));
  expect(panels.useFirst.data.items.length).toBeGreaterThan(0);
  const days = panels.useFirst.data.items.map((i) => i.expiresOn);
  expect([...days].sort()).toEqual(days);
  expect(panels.thisMonth.data).toMatchObject({ month: expect.any(String), unitsIn: expect.any(Number), households: expect.any(Number) });
  expect(JSON.stringify(dash.body)).not.toMatch(HOUSEHOLD_CODE);
});

test('expiry job on seeded data: a week later more lots expire and every change is logged (Req 3.2)', async () => {
  const later = new Date(now.getTime() + 7 * 86400000);
  const logged = await ActivityLog.countDocuments({ resource: 'stock-lots', action: 'status', actor: 'system' });
  const result = await reclassifyAll(db.registry, later);
  expect(result.changed).toBeGreaterThan(0);
  expect(result.to.Expired).toBeGreaterThan(0);
  expect(await ActivityLog.countDocuments({ resource: 'stock-lots', action: 'status', actor: 'system' })).toBe(logged + result.changed);
  void donors;
});
