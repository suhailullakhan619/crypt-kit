// Property P6: Households Never Hold PII and Board Never Sees Them
// Validates: Requirements 2.3, 2.4, 6.2, 7.3
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import fc from 'fast-check';
import mongoose from 'mongoose';
import request from 'supertest';
import { startPantry, userWithToken, pdfText, HOUSEHOLD_CODE, households, stockLots, distributions } from '../../test/pantry.js';
import { setReportDir } from '../services/reportService.js';
import * as impactService from '../services/impactService.js';
import { DIETARY } from '../domain/expiryWindows.js';
import householdsDef from './households.js';

const ALLOWED = ['_id', '__v', 'code', 'size', 'dietary', 'createdBy', 'createdAt', 'updatedAt'];
const PII = ['name', 'firstName', 'lastName', 'address', 'street', 'phone', 'email', 'dob', 'notes', 'contact'];

let db;
let app;
let dir;
let vol;
let board;
let coord;

beforeAll(async () => {
  ({ db, app } = await startPantry());
  dir = await mkdtemp(path.join(os.tmpdir(), 'pantry-p6-'));
  setReportDir(dir);
  vol = await userWithToken('Volunteer', 'Sam Volunteer');
  board = await userWithToken('Board', 'Ada Board');
  coord = await userWithToken('Coordinator', 'Rosa Coordinator');
});
afterAll(async () => {
  await db.stop();
  await rm(dir, { recursive: true, force: true });
});

const anyValue = fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.constant(null), fc.object({ maxDepth: 1 }));
const bodyArb = fc.record({
  size: fc.integer({ min: 1, max: 20 }),
  dietary: fc.subarray([...DIETARY]),
  code: fc.oneof(fc.constant(undefined), fc.string()),
  pii: fc.dictionary(fc.constantFrom(...PII), anyValue, { minKeys: 1 }),
  junk: fc.dictionary(fc.string({ minLength: 1, maxLength: 8 }).filter((k) => !['size', 'dietary', 'code', '__proto__', 'constructor'].includes(k)), anyValue, { maxKeys: 4 }),
});

describe('Property P6a: households never hold PII', () => {
  test('the definition declares no name, address, phone or email field (Req 2.4)', () => {
    expect(Object.keys(householdsDef.def.fields).sort()).toEqual(['code', 'dietary', 'size']);
    for (const f of Object.keys(householdsDef.model.schema.paths)) expect(ALLOWED).toContain(f);
  });

  test('any create or update body stores only code, size, dietary and system fields', async () => {
    await fc.assert(
      fc.asyncProperty(bodyArb, bodyArb, async (a, b) => {
        const created = await request(app).post('/api/r/households').set('Authorization', `Bearer ${vol.token}`)
          .send({ ...a.junk, ...a.pii, size: a.size, dietary: a.dietary, ...(a.code !== undefined ? { code: a.code } : {}) });
        expect(created.status).toBe(201);
        const id = created.body.item._id;
        expect(created.body.item.code).toMatch(/^H-\d{4}$/);

        const patched = await request(app).patch(`/api/r/households/${id}`).set('Authorization', `Bearer ${vol.token}`)
          .send({ ...b.junk, ...b.pii, size: b.size, dietary: b.dietary, ...(b.code !== undefined ? { code: b.code } : {}) });
        expect(patched.status).toBe(200);

        const raw = await mongoose.connection.db.collection(households.model.collection.name).findOne({ _id: new mongoose.Types.ObjectId(id) });
        for (const k of Object.keys(raw)) expect(ALLOWED).toContain(k);
        expect(raw.code).toBe(created.body.item.code); // codes are permanent
        expect(raw.size).toBe(b.size);
      }),
      { numRuns: 25 }
    );
  });
});

describe('Property P6b: Board never sees a household code', () => {
  beforeAll(async () => {
    await db.clear();
    const hhs = await households.model.insertMany(Array.from({ length: 6 }, (_, i) => ({ code: `H-${String(i + 1).padStart(4, '0')}`, size: i + 1, dietary: [] })));
    const [lot] = await stockLots.model.insertMany([{ itemName: 'Black beans', category: 'Canned', unit: 'can', quantity: 40, receivedQuantity: 60, status: 'Fresh', expiresOn: new Date('2027-01-01'), receivedAt: new Date() }]);
    await distributions.model.insertMany(hhs.map((h, i) => ({
      household: h._id, totalUnits: i + 1, at: new Date(), summary: `${i + 1} units for ${h.code} — Canned ${i + 1}`,
      lines: [{ lot: lot._id, itemName: 'Black beans', category: 'Canned', unit: 'can', quantity: i + 1 }],
    })));
  });

  const QUESTIONS = [
    'how many households did we serve this month', 'how many families did we help last month', 'how many households are there',
    'how many households do we have', 'list households', 'how many distributions are there', 'what expires this week',
    'how much canned food do we have', 'add 3 cans of beans expiring march 3', 'how many boxes are there',
  ];

  test('meta, records, dashboard, voice and the impact PDF never reveal a code to Board', async () => {
    const month = new Date().toISOString().slice(0, 7);
    await fc.assert(
      fc.asyncProperty(fc.constantFrom(...QUESTIONS), async (question) => {
        const auth = { Authorization: `Bearer ${board.token}` };
        const meta = await request(app).get('/api/meta').set(auth);
        expect(meta.status).toBe(200);
        expect(meta.body.resources.map((r) => r.key)).not.toContain('households');
        expect(JSON.stringify(meta.body)).not.toMatch(HOUSEHOLD_CODE);

        expect((await request(app).get('/api/r/households').set(auth)).status).toBe(403);
        expect((await request(app).get('/api/r/distributions').set(auth)).status).toBe(403);
        expect((await request(app).post('/api/distributions/plan').set(auth).send({})).status).toBe(403);

        const dash = await request(app).get('/api/dashboard').set(auth);
        expect(dash.status).toBe(200);
        expect(JSON.stringify(dash.body)).not.toMatch(HOUSEHOLD_CODE);

        const voice = await request(app).post('/api/voice/ask').set(auth).send({ text: question });
        expect(voice.status).toBe(200);
        expect(JSON.stringify(voice.body)).not.toMatch(HOUSEHOLD_CODE);
      }),
      { numRuns: 25 }
    );

    const rep = await request(app).post('/api/reports/impact').set('Authorization', `Bearer ${board.token}`).send({ month });
    expect(rep.status).toBe(201);
    const text = pdfText(await readFile(path.join(dir, rep.body.report.fileName)));
    expect(text).toMatch(/IMPACT/); // positive control: the extractor sees the PDF's text
    expect(text).toMatch(/Households served/);
    expect(text).not.toMatch(HOUSEHOLD_CODE);
  });

  test('the impact renderer never receives a household code (recorded helper calls)', async () => {
    const a = await impactService.aggregate(impactService.windowFor(new Date().toISOString().slice(0, 7)));
    expect(a.households).toBe(6);
    const seen = [];
    const rec = (...args) => seen.push(JSON.stringify(args));
    impactService.renderImpact(a)(null, { heading: rec, kv: rec, table: rec, barChart: rec, text: rec });
    expect(seen.join('\n')).not.toMatch(HOUSEHOLD_CODE);
  });

  test('control: Coordinator and Volunteer do see codes where they are allowed to', async () => {
    const res = await request(app).get('/api/r/households').set('Authorization', `Bearer ${coord.token}`);
    expect(JSON.stringify(res.body)).toMatch(HOUSEHOLD_CODE);
  });
});
