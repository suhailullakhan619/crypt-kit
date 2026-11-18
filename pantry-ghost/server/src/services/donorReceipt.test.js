// Donor receipts: only that donor's lots in the period, original quantities, staff-only access
import request from 'supertest';
import os from 'node:os';
import path from 'node:path';
import { startPantry, userWithToken, donors, stockLots, pdfText } from '../../test/pantry.js';
import { setReportDir } from './reportService.js';
import { renderReceipt, donations, parseRange } from './donorReceiptService.js';
import fs from 'node:fs';

let db;
let app;
let coordinator;
let board;
let fresh;
let other;

beforeAll(async () => {
  ({ db, app } = await startPantry());
  setReportDir(fs.mkdtempSync(path.join(os.tmpdir(), 'receipts-')));
  coordinator = await userWithToken('Coordinator', 'Rosa');
  board = await userWithToken('Board', 'Ada');
});
afterAll(() => db.stop());

beforeEach(async () => {
  await stockLots.model.deleteMany({});
  await donors.model.deleteMany({});
  [fresh, other] = await donors.model.insertMany([{ name: 'Fresh Mart', type: 'Grocery' }, { name: 'Corner Farm', type: 'Farm' }]);
  await stockLots.model.insertMany([
    { itemName: 'Black beans', category: 'Canned', quantity: 3, receivedQuantity: 12, unit: 'can', donor: fresh._id, receivedAt: new Date('2026-03-10') },
    { itemName: 'Rice', category: 'Dry', quantity: 5, unit: 'kg', donor: fresh._id, receivedAt: new Date('2026-03-31T18:00:00Z') },
    { itemName: 'Old soup', category: 'Canned', quantity: 4, unit: 'can', donor: fresh._id, receivedAt: new Date('2026-01-02') },
    { itemName: 'Carrots', category: 'Produce', quantity: 9, unit: 'kg', donor: other._id, receivedAt: new Date('2026-03-12') },
  ]);
});

const auth = (u) => ({ Authorization: `Bearer ${u.token}` });

describe('donations()', () => {
  test('lists only this donor, inside the inclusive period, with the originally received quantity', async () => {
    const d = await donations(String(fresh._id), '2026-03-01', '2026-03-31');
    expect(d.rows.map((r) => r.item)).toEqual(['Black beans', 'Rice']);
    expect(d.rows[0].quantity).toBe(12);
    expect(d.totalUnits).toBe(17);
    expect(d.byCategory).toEqual([{ category: 'Canned', units: 12 }, { category: 'Dry', units: 5 }]);
  });

  test('rejects bad ranges and unknown donors', async () => {
    expect(() => parseRange('2026-03-31', '2026-03-01')).toThrow(/before/);
    expect(() => parseRange('nope', '2026-03-01')).toThrow(/from and to/);
    expect(() => parseRange('2020-01-01', '2026-01-01')).toThrow(/one year/);
    await expect(donations('0123456789abcdef01234567', '2026-03-01', '2026-03-31')).rejects.toMatchObject({ status: 404 });
    await expect(donations('bad', '2026-03-01', '2026-03-31')).rejects.toMatchObject({ status: 404 });
  });
});

describe('receipt PDF and routes', () => {
  test('the PDF names the donor and lists the donations, not other donors', async () => {
    const d = await donations(String(fresh._id), '2026-03-01', '2026-03-31');
    const calls = [];
    const h = new Proxy({}, { get: (_t, name) => (...args) => calls.push([name, ...args]) });
    renderReceipt(d, 'Test Food Bank')(null, h);
    const text = JSON.stringify(calls);
    expect(text).toMatch(/Fresh Mart/);
    expect(text).toMatch(/Black beans/);
    expect(text).not.toMatch(/Carrots|Old soup/);
  });

  test('POST creates a stored PDF report for staff and previews the same data', async () => {
    const prev = await request(app).get(`/api/donors/${fresh._id}/receipt/preview?from=2026-03-01&to=2026-03-31`).set(auth(coordinator));
    expect(prev.status).toBe(200);
    expect(prev.body.receipt.rows).toHaveLength(2);

    const res = await request(app).post(`/api/donors/${fresh._id}/receipt`).set(auth(coordinator)).send({ from: '2026-03-01', to: '2026-03-31' });
    expect(res.status).toBe(201);
    expect(res.body.report).toMatchObject({ title: 'Donor receipt: Fresh Mart', count: 2 });
    const pdf = await request(app).get(`/api/reports/${res.body.report._id}/download`).set(auth(coordinator)).buffer().parse((r, cb) => {
      const chunks = []; r.on('data', (c) => chunks.push(c)); r.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(pdf.status).toBe(200);
    expect(pdfText(pdf.body)).toMatch(/Fresh Mart/);
  });

  test('the Board is refused, and a bad range is a 400', async () => {
    expect((await request(app).post(`/api/donors/${fresh._id}/receipt`).set(auth(board)).send({ from: '2026-03-01', to: '2026-03-31' })).status).toBe(403);
    expect((await request(app).post(`/api/donors/${fresh._id}/receipt`).set(auth(coordinator)).send({ from: 'x', to: 'y' })).status).toBe(400);
    expect((await request(app).get(`/api/donors/${fresh._id}/receipt/preview?from=2026-03-01&to=2026-03-31`)).status).toBe(401);
  });
});
