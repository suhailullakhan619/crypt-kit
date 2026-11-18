// Pantry insights: low stock, waste by donor, weekly low-stock notification
import request from 'supertest';
import { startPantry, userWithToken, donors, stockLots } from '../../test/pantry.js';
import { makeActor } from '../../test/db.js';
import { assessStock } from '../domain/lowStock.js';
import { lowStock, wasteByDonor, notifyLowStock, parseDays } from './insightsService.js';
import { listFor } from './notificationService.js';
import Notification from '../models/Notification.js';
import job from '../jobs/app/lowStock.job.js';

const DAY = 86400000;
const NOW = new Date('2026-11-05T09:00:00Z');
const ago = (d) => new Date(NOW.getTime() - d * DAY);
let db;
let app;
let coordinator;
let board;

beforeAll(async () => {
  ({ db, app } = await startPantry());
  await Notification.createCollection().catch(() => {});
  await Notification.syncIndexes();
  coordinator = await userWithToken('Coordinator', 'Rosa');
  board = await userWithToken('Board', 'Ada');
});
afterAll(() => db.stop());
beforeEach(async () => {
  await stockLots.model.deleteMany({});
  await donors.model.deleteMany({});
  await Notification.deleteMany({});
});

const lot = (o) => stockLots.model.create({ unit: 'item', status: 'Fresh', receivedAt: ago(5), ...o });

describe('assessStock', () => {
  test('flags categories below their minimum and reports how short they are', () => {
    const r = assessStock({ Canned: 40, Dry: 10 }, { Canned: 40, Dry: 40, Dairy: 5 });
    expect(r).toEqual([
      { category: 'Canned', units: 40, min: 40, short: 0, low: false },
      { category: 'Dry', units: 10, min: 40, short: 30, low: true },
      { category: 'Dairy', units: 0, min: 5, short: 5, low: true },
    ]);
  });
});

describe('lowStock', () => {
  test('counts only usable lots (Fresh and ExpiringSoon)', async () => {
    await lot({ itemName: 'Beans', category: 'Canned', quantity: 30 });
    await lot({ itemName: 'Soup', category: 'Canned', quantity: 15, status: 'ExpiringSoon' });
    await lot({ itemName: 'Old', category: 'Canned', quantity: 99, status: 'Expired' });
    await lot({ itemName: 'Gone', category: 'Canned', quantity: 0, status: 'Depleted' });
    await lot({ itemName: 'Binned', category: 'Canned', quantity: 50, status: 'Discarded' });
    const canned = (await lowStock()).find((r) => r.category === 'Canned');
    expect(canned).toMatchObject({ units: 45, min: 40, low: false });
  });
});

describe('wasteByDonor', () => {
  test('received vs wasted per donor inside the window, worst first, with the original quantity', async () => {
    const [fresh, farm] = await donors.model.insertMany([{ name: 'Fresh Mart' }, { name: 'Corner Farm' }]);
    await lot({ itemName: 'Milk', category: 'Dairy', quantity: 8, receivedQuantity: 10, donor: fresh._id, status: 'Expired' });
    await lot({ itemName: 'Rice', category: 'Dry', quantity: 40, receivedQuantity: 40, donor: fresh._id });
    await lot({ itemName: 'Kale', category: 'Produce', quantity: 5, donor: farm._id, status: 'Discarded' });
    await lot({ itemName: 'Old stock', category: 'Dry', quantity: 9, donor: farm._id, status: 'Expired', receivedAt: ago(200) });
    await lot({ itemName: 'No donor', category: 'Dry', quantity: 9, status: 'Expired' });

    const w = await wasteByDonor(90, NOW);
    expect(w.donors.map((d) => d.name)).toEqual(['Fresh Mart', 'Corner Farm']);
    expect(w.donors[0]).toMatchObject({ lots: 2, received: 50, wasted: 8, wasteRate: 16 });
    expect(w.donors[1]).toMatchObject({ lots: 1, received: 5, wasted: 5, wasteRate: 100 });
  });
});

describe('notifyLowStock', () => {
  test('tells coordinator and volunteers once per category per week, never the board', async () => {
    const co = await makeActor('Coordinator', 'Co');
    const vol = await makeActor('Volunteer', 'Vol');
    const bd = await makeActor('Board', 'Bd');
    await lot({ itemName: 'Beans', category: 'Canned', quantity: 100 });
    await lot({ itemName: 'Pasta', category: 'Dry', quantity: 100 });

    const first = await notifyLowStock(NOW);
    expect(first.low).toEqual(expect.arrayContaining(['Produce', 'Dairy', 'Hygiene']));
    expect(first.low).not.toContain('Canned');
    const n = (await listFor(co.userId)).unread;
    expect(n).toBe(first.low.length);
    expect((await listFor(vol.userId)).unread).toBe(n);
    expect((await listFor(bd.userId)).unread).toBe(0);

    await notifyLowStock(new Date(NOW.getTime() + 2 * DAY)); // same ISO week
    expect((await listFor(co.userId)).unread).toBe(n);
    await notifyLowStock(new Date(NOW.getTime() + 8 * DAY)); // next week
    expect((await listFor(co.userId)).unread).toBe(n * 2);
  });

  test('the daily job runs at boot and calls the same function', async () => {
    expect(job).toMatchObject({ name: 'low-stock', runAtBoot: true });
    expect(await job.run({ now: NOW })).toHaveProperty('low');
  });
});

describe('routes', () => {
  test('staff see stock and waste, the board is refused, bad windows are 400', async () => {
    const res = await request(app).get('/api/insights?days=30').set({ Authorization: `Bearer ${coordinator.token}` });
    expect(res.status).toBe(200);
    expect(res.body.waste.days).toBe(30);
    expect(res.body.stock.length).toBeGreaterThan(0);
    expect((await request(app).get('/api/insights').set({ Authorization: `Bearer ${board.token}` })).status).toBe(403);
    expect((await request(app).get('/api/insights')).status).toBe(401);
    expect((await request(app).get('/api/insights?days=0').set({ Authorization: `Bearer ${coordinator.token}` })).status).toBe(400);
    expect(() => parseDays('5000')).toThrow(/days must be/);
  });

  test('POST /insights/report stores a PDF report', async () => {
    const res = await request(app).post('/api/insights/report').set({ Authorization: `Bearer ${coordinator.token}` }).send({});
    expect(res.status).toBe(201);
    expect(res.body.report.title).toBe('Stock insights');
    expect((await request(app).post('/api/insights/report').set({ Authorization: `Bearer ${board.token}` }).send({})).status).toBe(403);
  });
});
