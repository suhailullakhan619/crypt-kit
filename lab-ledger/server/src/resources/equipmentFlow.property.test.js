// Property L6: Workflow-Only Status Cannot Be Forged
// Validates: Requirements 2.3, 3.8
import fc from 'fast-check';
import * as resourceService from '../services/resourceService.js';
import ActivityLog from '../models/ActivityLog.js';
import { startLabDb, makeActor, makeEquipment, equipment, checkouts } from '../../test/lab.js';
import { EQUIPMENT_STATUS, CONDITIONS } from './equipment.js';
import { CHECKOUT_STATUS } from './checkouts.js';

let db;
let manager;
let tech;
beforeAll(async () => {
  db = await startLabDb();
  manager = await makeActor('LabManager', 'Marie');
  tech = await makeActor('Technician', 'Tomas');
});
afterAll(() => db.stop());

const snapshot = async (model, id) => JSON.stringify(await model.findById(id).lean());

const forgery = fc
  .record({
    from: fc.constantFrom(...EQUIPMENT_STATUS.filter((s) => s !== 'Retired')),
    to: fc.constantFrom(...EQUIPMENT_STATUS),
    extra: fc.record({ condition: fc.constantFrom(...CONDITIONS), notes: fc.string({ maxLength: 20 }) }, { requiredKeys: [] }),
    asManager: fc.boolean(),
  })
  .filter(({ from, to }) => from !== to && (from === 'CheckedOut' || to === 'CheckedOut'));

test('L6: generic PATCH into or out of CheckedOut → 409, item and log unchanged', async () => {
  await fc.assert(
    fc.asyncProperty(forgery, async ({ from, to, extra, asManager }) => {
      const item = await makeEquipment({ status: from });
      const before = await snapshot(equipment.model, item._id);
      const logBefore = await ActivityLog.countDocuments();

      await expect(resourceService.update(equipment, String(item._id), { ...extra, status: to }, asManager ? manager : tech))
        .rejects.toMatchObject({ status: 409 });

      expect(await snapshot(equipment.model, item._id)).toBe(before);
      expect(await ActivityLog.countDocuments()).toBe(logBefore);
    }),
    { numRuns: 60 }
  );
});

test('L6: generic create with status CheckedOut → 409', async () => {
  await fc.assert(
    fc.asyncProperty(fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim()), async (name) => {
      const count = await equipment.model.countDocuments();
      await expect(resourceService.create(equipment, { name, assetTag: `F-${Date.now()}-${Math.random()}`, status: 'CheckedOut' }, manager))
        .rejects.toMatchObject({ status: 409 });
      expect(await equipment.model.countDocuments()).toBe(count);
    }),
    { numRuns: 25 }
  );
});

test('L6: soft-deleting (retiring) a CheckedOut item → 409, unchanged', async () => {
  const item = await makeEquipment({ status: 'CheckedOut' });
  const before = await snapshot(equipment.model, item._id);
  await expect(resourceService.remove(equipment, String(item._id), manager)).rejects.toMatchObject({ status: 409 });
  expect(await snapshot(equipment.model, item._id)).toBe(before);
});

test('L6 / Req 3.8: no checkout status can be set through the generic path, even by LabManager', async () => {
  const borrower = await makeActor('Student', 'Priya');
  await fc.assert(
    fc.asyncProperty(fc.constantFrom(...CHECKOUT_STATUS), fc.constantFrom(...CHECKOUT_STATUS), async (from, to) => {
      fc.pre(from !== to);
      const item = await makeEquipment({ status: from === 'Active' || from === 'Overdue' ? 'CheckedOut' : 'Available' });
      const [co] = await checkouts.model.create([{ equipment: item._id, borrower: borrower.userId, status: from, dueBack: new Date(Date.now() + 86400000) }]);
      const before = await snapshot(checkouts.model, co._id);
      await expect(resourceService.update(checkouts, String(co._id), { status: to }, manager)).rejects.toMatchObject({ status: 409 });
      expect(await snapshot(checkouts.model, co._id)).toBe(before);
    }),
    { numRuns: 30 }
  );
});

test('Req 3.8: generic PATCH cannot re-point a checkout and DELETE cannot remove one that is out', async () => {
  const borrower = await makeActor('Student', 'Sam');
  const item = await makeEquipment({ status: 'CheckedOut' });
  const other = await makeEquipment();
  const [co] = await checkouts.model.create([{ equipment: item._id, borrower: borrower.userId, status: 'Active', dueBack: new Date(Date.now() + 86400000) }]);
  await expect(resourceService.update(checkouts, String(co._id), { equipment: String(other._id) }, manager)).rejects.toMatchObject({ status: 409 });
  await expect(resourceService.remove(checkouts, String(co._id), manager)).rejects.toMatchObject({ status: 409 });
  expect(await checkouts.model.exists({ _id: co._id })).toBeTruthy();
  // the purpose may still be corrected
  const fixed = await resourceService.update(checkouts, String(co._id), { purpose: 'Optics practical' }, manager);
  expect(fixed.purpose).toBe('Optics practical');
});
