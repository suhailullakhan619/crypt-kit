// Expiry job: re-classification + activity entries (Req 3.2)
import { startDb } from '../../test/db.js';
import ActivityLog from '../models/ActivityLog.js';
import { reclassifyAll } from './expiryService.js';
import job from '../jobs/app/classifyExpiry.job.js';
import { loadJobs } from '../jobs/index.js';
import donors from '../resources/donors.js';
import stockLots from '../resources/stock-lots.js';

let db;
beforeAll(async () => { db = await startDb([donors, stockLots]); });
afterAll(() => db.stop());
beforeEach(() => db.clear());

const NOW = new Date('2026-11-05T09:00:00Z');

test('moves lots forward, skips Depleted/Discarded and logs one system status entry per change', async () => {
  const lots = await stockLots.model.insertMany([
    { itemName: 'Milk', category: 'Dairy', quantity: 4, status: 'Fresh', expiresOn: new Date('2026-11-07') },          // → ExpiringSoon
    { itemName: 'Bread', category: 'Bakery', quantity: 2, status: 'ExpiringSoon', expiresOn: new Date('2026-11-04') }, // → Expired
    { itemName: 'Rice', category: 'Dry', quantity: 9, status: 'Fresh', expiresOn: new Date('2027-11-07') },           // unchanged
    { itemName: 'Soap', category: 'Hygiene', quantity: 9, status: 'Fresh' },                                           // unchanged
    { itemName: 'Old', category: 'Dairy', quantity: 0, status: 'Depleted', expiresOn: new Date('2026-01-01') },       // skipped
    { itemName: 'Gone', category: 'Dairy', quantity: 3, status: 'Discarded', expiresOn: new Date('2026-01-01') },     // skipped
  ]);
  const result = await reclassifyAll(db.registry, NOW);
  expect(result).toEqual({ checked: 4, changed: 2, to: { ExpiringSoon: 1, Expired: 1 } });

  const after = await stockLots.model.find().sort({ _id: 1 }).lean();
  expect(after.map((l) => l.status)).toEqual(['ExpiringSoon', 'Expired', 'Fresh', 'Fresh', 'Depleted', 'Discarded']);

  const log = await ActivityLog.find({ resource: 'stock-lots', action: 'status' }).lean();
  expect(log.map((e) => [String(e.recordId), e.diff.status, e.actor]).sort()).toEqual(
    [[String(lots[0]._id), ['Fresh', 'ExpiringSoon'], 'system'], [String(lots[1]._id), ['ExpiringSoon', 'Expired'], 'system']].sort()
  );

  // idempotent
  expect((await reclassifyAll(db.registry, NOW)).changed).toBe(0);
});

test('registered as an hourly app job that also runs at boot', async () => {
  expect(job).toMatchObject({ name: 'classify-expiry', schedule: '0 * * * *', runAtBoot: true });
  expect((await loadJobs()).map((j) => j.name)).toContain('classify-expiry');
});
