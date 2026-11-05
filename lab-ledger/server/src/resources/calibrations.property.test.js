// Property L4: Calibration Schedules the Next Due Date
// Validates: Requirements 4.1, 4.2
import fc from 'fast-check';
import * as resourceService from '../services/resourceService.js';
import ActivityLog from '../models/ActivityLog.js';
import { startLabDb, makeActor, makeEquipment, equipment, calibrations } from '../../test/lab.js';
import { calibrationOutcome, RESULTS } from './calibrations.js';

const DAY = 86400000;
const SHELF = ['Available', 'Maintenance', 'CalibrationDue'];

let db;
let tech;
beforeAll(async () => {
  db = await startLabDb();
  tech = await makeActor('Technician', 'Tomas');
});
afterAll(() => db.stop());

test('L4 (pure): next date = performedAt + interval; Fail → Maintenance; pass clears CalibrationDue', () => {
  fc.assert(
    fc.property(
      fc.constantFrom(...SHELF), fc.boolean(), fc.integer({ min: 1, max: 3650 }),
      fc.integer({ min: Date.UTC(2000, 0, 1), max: Date.UTC(2030, 0, 1) }), fc.constantFrom(...RESULTS),
      (status, requiresCalibration, interval, at, result) => {
        const out = calibrationOutcome({ status, requiresCalibration, calibrationIntervalDays: interval }, { performedAt: new Date(at), result });
        if (requiresCalibration) expect(out.nextCalibration.getTime()).toBe(at + interval * DAY);
        else expect(out.nextCalibration).toBeUndefined();
        const finalStatus = out.status ?? status;
        if (result === 'Fail') expect(finalStatus).toBe('Maintenance');
        else expect(finalStatus).toBe(status === 'CalibrationDue' ? 'Available' : status);
      }
    ),
    { numRuns: 300 }
  );
});

test('L4: logging a calibration through the generic API schedules the item and applies the status rule', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.constantFrom(...SHELF), fc.boolean(), fc.integer({ min: 1, max: 3650 }),
      fc.integer({ min: 60_000, max: 5 * 365 * DAY }), fc.constantFrom(...RESULTS),
      async (status, requiresCalibration, interval, ago, result) => {
        const previous = new Date('2026-01-01T00:00:00Z');
        const item = await makeEquipment({ status, requiresCalibration, calibrationIntervalDays: interval, nextCalibration: previous });
        // Past relative to any clock the hook sees (the Core hook ctx uses the real clock).
        const performedAt = new Date(Date.now() - ago);

        const cal = await resourceService.create(calibrations, { equipment: String(item._id), performedAt: performedAt.toISOString(), result }, tech);
        expect(cal.performedBy.name).toBe('Tomas'); // defaults to the current user

        const after = await equipment.model.findById(item._id).lean();
        expect(after.nextCalibration.getTime()).toBe(requiresCalibration ? performedAt.getTime() + interval * DAY : previous.getTime());
        if (result === 'Fail') expect(after.status).toBe('Maintenance');
        else expect(after.status).toBe(status === 'CalibrationDue' ? 'Available' : status);
      }
    ),
    { numRuns: 40 }
  );
});

test('L4: the equipment change is logged in the same transaction', async () => {
  const item = await makeEquipment({ status: 'CalibrationDue', requiresCalibration: true, calibrationIntervalDays: 180 });
  await resourceService.create(calibrations, { equipment: String(item._id), performedAt: '2026-01-10', result: 'Adjusted' }, tech);
  const entries = await ActivityLog.find({ resource: 'equipment', recordId: item._id }).lean();
  expect(entries.find((e) => e.action === 'status').diff.status).toEqual(['CalibrationDue', 'Available']);
  expect(entries.find((e) => e.action === 'update').diff.nextCalibration[1]).toBe('2026-07-09T00:00:00.000Z');
});

test('Req 4.3: a future performedAt is a 400 and nothing is written', async () => {
  await fc.assert(
    fc.asyncProperty(fc.integer({ min: 60_000, max: 365 * DAY }), async (ahead) => {
      const item = await makeEquipment({ requiresCalibration: true, calibrationIntervalDays: 30 });
      const [cals, logs] = [await calibrations.model.countDocuments(), await ActivityLog.countDocuments()];
      await expect(resourceService.create(calibrations, { equipment: String(item._id), performedAt: new Date(Date.now() + ahead).toISOString() }, tech))
        .rejects.toMatchObject({ status: 400 });
      expect(await calibrations.model.countDocuments()).toBe(cals);
      expect(await ActivityLog.countDocuments()).toBe(logs);
      expect((await equipment.model.findById(item._id).lean()).nextCalibration).toBeUndefined();
    }),
    { numRuns: 25 }
  );
});

test('items out on loan or retired cannot be calibrated (409)', async () => {
  for (const status of ['CheckedOut', 'Retired']) {
    const item = await makeEquipment({ status, requiresCalibration: true, calibrationIntervalDays: 30 });
    await expect(resourceService.create(calibrations, { equipment: String(item._id), performedAt: '2026-01-01', result: 'Fail' }, tech))
      .rejects.toMatchObject({ status: 409 });
    expect((await equipment.model.findById(item._id).lean()).status).toBe(status);
  }
});
