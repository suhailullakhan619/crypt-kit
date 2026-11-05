// Property 12: Overdue Sweeper Changes Exactly the Eligible Records
// Validates: Requirements 8.2, 8.3
import fc from 'fast-check';
import { sweep } from './sweeperService.js';
import ActivityLog from '../models/ActivityLog.js';
import { startDb } from '../../test/db.js';
import specimens, { STATUS } from '../../test/fixtures/specimens.js';

// specimens.due = { field: 'dueAt', status: 'status', from: ['Fresh'], to: 'Lost' }
const DAY = 86400000;
const NOW = new Date(Date.UTC(2026, 9, 31, 12));

let db;
beforeAll(async () => { db = await startDb([specimens]); });
afterAll(() => db.stop());

const rowArb = fc.record({
  name: fc.constantFrom('Bat', 'Toad', 'Newt'),
  status: fc.constantFrom(...STATUS),
  weight: fc.integer({ min: 0, max: 100 }),
  dueOffsetDays: fc.option(fc.integer({ min: -30, max: 30 }), { nil: null }),
});

describe('Property 12: overdue sweeper', () => {
  test('a record ends in due.to iff it already was, or it was past due and in due.from; nothing else changes', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(rowArb, { maxLength: 30 }), fc.integer({ min: -2, max: 2 }), async (rows, nowShiftDays) => {
        await db.clear();
        const now = new Date(NOW.getTime() + nowShiftDays * DAY);
        const docs = await specimens.model.insertMany(
          rows.map(({ dueOffsetDays, ...r }) => ({ ...r, dueAt: dueOffsetDays === null ? null : new Date(NOW.getTime() + dueOffsetDays * DAY) }))
        );
        const before = new Map(docs.map((d) => [String(d._id), d.toObject()]));

        const result = await sweep({ withDue: () => [specimens] }, now);

        const after = await specimens.model.find().lean();
        let changed = 0;
        for (const a of after) {
          const b = before.get(String(a._id));
          const eligible = b.dueAt !== null && b.dueAt < now && b.status === 'Fresh';
          expect(a.status).toBe(eligible ? 'Lost' : b.status);
          expect(a.weight).toBe(b.weight);
          expect(a.name).toBe(b.name);
          if (eligible) changed += 1;
        }
        expect(result.specimens).toBe(changed);
        expect(await ActivityLog.countDocuments({ action: 'status', actor: 'system' })).toBe(changed);
      }),
      { numRuns: 30 }
    );
  });

  test('running twice is idempotent', async () => {
    await db.clear();
    await specimens.model.insertMany([{ name: 'Old', status: 'Fresh', dueAt: new Date(NOW.getTime() - DAY) }]);
    const reg = { withDue: () => [specimens] };
    expect((await sweep(reg, NOW)).specimens).toBe(1);
    expect((await sweep(reg, NOW)).specimens).toBe(0);
  });
});
