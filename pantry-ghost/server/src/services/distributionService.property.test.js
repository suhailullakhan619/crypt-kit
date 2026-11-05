// Property P1: Stock Never Goes Negative
// Validates: Requirements 5.4, 5.5
// Property P2: Failed Distributions Change Nothing
// Validates: Requirements 5.4
import fc from 'fast-check';
import { startDb, makeActor } from '../../test/db.js';
import ActivityLog from '../models/ActivityLog.js';
import * as distributionService from './distributionService.js';
import donors from '../resources/donors.js';
import stockLots from '../resources/stock-lots.js';
import households from '../resources/households.js';
import distributions from '../resources/distributions.js';

const NOW = new Date('2026-11-05T12:00:00Z');
let db;
let volunteer;

beforeAll(async () => {
  db = await startDb([donors, stockLots, households, distributions]);
  volunteer = await makeActor('Volunteer', 'Sam');
});
afterAll(() => db.stop());

async function setup(quantities) {
  await db.clear();
  const [hh] = await households.model.create([{ code: 'H-0001', size: 3, dietary: [] }]);
  const lots = await stockLots.model.insertMany(
    quantities.map((q, i) => ({
      itemName: `Lot ${i}`, category: 'Canned', unit: 'can', quantity: q, receivedQuantity: q,
      status: q > 0 ? 'Fresh' : 'Depleted', expiresOn: new Date('2027-06-01'), receivedAt: new Date('2026-10-01'),
    }))
  );
  return { hh, lots };
}

const snapshot = async () =>
  (await stockLots.model.find().sort({ _id: 1 }).select({ quantity: 1, status: 1 }).lean()).map((l) => ({ id: String(l._id), quantity: l.quantity, status: l.status }));

describe('Property P1: stock never goes negative under concurrent commits', () => {
  test('quantities stay ≥ 0 and initial − final = distributed, per lot', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.integer({ min: 0, max: 12 }), { minLength: 1, maxLength: 4 }),
        fc.array(fc.array(fc.tuple(fc.nat(), fc.integer({ min: 1, max: 8 })), { minLength: 1, maxLength: 3 }), { minLength: 2, maxLength: 6 }),
        async (quantities, commits) => {
          const { hh, lots } = await setup(quantities);
          const bodies = commits.map((lines) => ({
            householdId: String(hh._id),
            lines: lines.map(([i, q]) => ({ lotId: String(lots[i % lots.length]._id), quantity: q })),
          }));

          const results = await Promise.allSettled(bodies.map((b) => distributionService.commit(b, volunteer, { now: NOW })));
          for (const r of results) if (r.status === 'rejected') expect(r.reason.status).toBe(409);

          const final = await stockLots.model.find().lean();
          const dists = await distributions.model.find().lean();
          expect(dists.length).toBe(results.filter((r) => r.status === 'fulfilled').length);
          for (const lot of final) {
            const initial = quantities[lots.findIndex((l) => String(l._id) === String(lot._id))];
            const out = dists.flatMap((d) => d.lines).filter((l) => String(l.lot) === String(lot._id)).reduce((s, l) => s + l.quantity, 0);
            expect(lot.quantity).toBeGreaterThanOrEqual(0);
            expect(initial - lot.quantity).toBe(out);
            if (out > 0) expect(lot.status === 'Depleted').toBe(lot.quantity === 0);
          }
        }
      ),
      { numRuns: 25 }
    );
  });
});

describe('Property P2: failed distributions change nothing', () => {
  test('a commit with any over-asking line leaves lots, distributions and activity untouched (409)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.integer({ min: 1, max: 15 }), { minLength: 1, maxLength: 4 }),
        fc.array(fc.tuple(fc.nat(), fc.integer({ min: 1, max: 5 })), { maxLength: 4 }),
        fc.nat(),
        fc.integer({ min: 1, max: 10 }),
        fc.nat(),
        async (quantities, okLines, badIndex, excess, position) => {
          const { hh, lots } = await setup(quantities);
          const bad = lots[badIndex % lots.length];
          const lines = okLines.map(([i, q]) => ({ lotId: String(lots[i % lots.length]._id), quantity: q }));
          lines.splice(position % (lines.length + 1), 0, { lotId: String(bad._id), quantity: bad.quantity + excess });

          const before = await snapshot();
          const activityBefore = await ActivityLog.countDocuments();
          const err = await distributionService.commit({ householdId: String(hh._id), lines }, volunteer, { now: NOW }).catch((e) => e);

          expect(err.status).toBe(409);
          expect(err.extra.short.some((s) => s.lotId === String(bad._id))).toBe(true);
          expect(await snapshot()).toEqual(before);
          expect(await distributions.model.countDocuments()).toBe(0);
          expect(await ActivityLog.countDocuments()).toBe(activityBefore);
        }
      ),
      { numRuns: 25 }
    );
  });
});

describe('commit examples', () => {
  test('a lot drawn to zero becomes Depleted and the distribution snapshots its lines', async () => {
    const { hh, lots } = await setup([5, 9]);
    const dist = await distributionService.commit(
      { householdId: String(hh._id), lines: [{ lotId: String(lots[0]._id), quantity: 5 }, { lotId: String(lots[1]._id), quantity: 2 }] },
      volunteer,
      { now: NOW }
    );
    expect(dist.totalUnits).toBe(7);
    expect(dist.household.code).toBe('H-0001');
    expect(dist.summary).toBe('7 units for H-0001 — Canned 7');
    expect(await snapshot()).toEqual([
      { id: String(lots[0]._id), quantity: 0, status: 'Depleted' },
      { id: String(lots[1]._id), quantity: 7, status: 'Fresh' },
    ]);
  });

  test('expired lots cannot be distributed even if the job has not re-classified them yet', async () => {
    const { hh, lots } = await setup([5]);
    await stockLots.model.updateOne({ _id: lots[0]._id }, { $set: { expiresOn: new Date('2026-11-01') } });
    const err = await distributionService.commit({ householdId: String(hh._id), lines: [{ lotId: String(lots[0]._id), quantity: 1 }] }, volunteer, { now: NOW }).catch((e) => e);
    expect(err.status).toBe(409);
  });

  test('bad input → 400, unknown household → 404', async () => {
    const { lots } = await setup([5]);
    await expect(distributionService.commit({ householdId: 'nope', lines: [] }, volunteer)).rejects.toMatchObject({ status: 400 });
    await expect(distributionService.commit({ householdId: String(lots[0]._id), lines: [{ lotId: String(lots[0]._id), quantity: 0 }] }, volunteer)).rejects.toMatchObject({ status: 400 });
    await expect(distributionService.commit({ householdId: String(lots[0]._id), lines: [{ lotId: String(lots[0]._id), quantity: 1 }] }, volunteer)).rejects.toMatchObject({ status: 404 });
  });

  test('plan: FEFO lines enriched with location, grouped cold-first; shortfalls reported', async () => {
    const { hh } = await setup([]);
    await stockLots.model.insertMany([
      { itemName: 'Milk', category: 'Dairy', unit: 'L', quantity: 4, status: 'Fresh', location: 'Fridge', expiresOn: new Date('2026-11-20') },
      { itemName: 'Beans', category: 'Canned', unit: 'can', quantity: 10, status: 'Fresh', location: 'Shelf', expiresOn: new Date('2027-11-20') },
      { itemName: 'Old milk', category: 'Dairy', unit: 'L', quantity: 9, status: 'ExpiringSoon', location: 'Fridge', expiresOn: new Date('2026-11-04') },
    ]);
    const p = await distributionService.plan({ householdId: String(hh._id), items: [{ category: 'Canned', quantity: 3 }, { category: 'Dairy', quantity: 6 }] }, { now: NOW });
    expect(p.household).toMatchObject({ code: 'H-0001', size: 3 });
    expect(p.lines.map((l) => [l.itemName, l.quantity, l.location])).toEqual([['Milk', 4, 'Fridge'], ['Beans', 3, 'Shelf']]);
    expect(p.shortfalls).toEqual([{ ask: { category: 'Dairy', quantity: 6 }, missing: 2 }]);
  });
});
