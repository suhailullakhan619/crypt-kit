import { defineResource } from '../core/defineResource.js';
import { httpError } from '../utils/httpError.js';
import { addDays } from '../utils/dates.js';
import { recordChanges } from '../services/labActivity.js';
import equipment from './equipment.js';

export const RESULTS = ['Pass', 'Adjusted', 'Fail'];
/** Interval used when an item requires calibration but has no interval set. */
export const DEFAULT_INTERVAL_DAYS = 365;

/**
 * Pure calibration rule (lab-ledger Req 4.1, 4.2): the equipment changes caused by logging a
 * calibration.
 *
 * @param {{ status: string, requiresCalibration?: boolean, calibrationIntervalDays?: number|null }} item
 * @param {{ performedAt: Date|string, result?: string }} calibration
 * @returns {{ nextCalibration?: Date, status?: string }} only the fields that change
 */
export function calibrationOutcome(item, { performedAt, result = 'Pass' }) {
  const out = {};
  if (item.requiresCalibration) {
    out.nextCalibration = addDays(performedAt, item.calibrationIntervalDays || DEFAULT_INTERVAL_DAYS);
  }
  if (result === 'Fail') {
    if (item.status !== 'Maintenance') out.status = 'Maintenance';
  } else if (item.status === 'CalibrationDue') {
    out.status = 'Available';
  }
  return out;
}

/**
 * Calibration log (lab-ledger Req 2.5, 4). LabManager and Technician log calibrations; everyone
 * reads them. Logging one schedules the item's next calibration inside the same transaction.
 */
export default defineResource({
  key: 'calibrations',
  label: 'Calibrations',
  icon: 'gauge',
  titleField: 'equipment',
  description: 'Calibration certificates — each one schedules the next due date.',
  fields: {
    equipment:     { type: 'ref', label: 'Equipment', ref: 'equipment', required: true, list: true, filter: true },
    performedAt:   { type: 'date', label: 'Performed on', required: true, list: true },
    performedBy:   { type: 'ref', label: 'Performed by', ref: 'User', list: true, filter: true },
    result:        { type: 'enum', label: 'Result', values: RESULTS, default: 'Pass', list: true, filter: true },
    certificateNo: { type: 'string', label: 'Certificate no.', max: 60, list: true, search: true },
    notes:         { type: 'text', label: 'Notes', max: 2000 },
  },
  permissions: { read: ['Technician', 'Student'], create: ['Technician'], update: [], delete: [] },
  report: { columns: ['equipment', 'performedAt', 'performedBy', 'result', 'certificateNo'] },
  voice: { synonyms: ['calibrations', 'calibration records', 'certificates'] },
  defaultSort: '-performedAt',
  hooks: {
    /** Req 4.3: no calibrations from the future; the item must be on the shelf (not on loan, not retired). */
    async beforeCreate(data, ctx) {
      const at = data.performedAt == null ? null : new Date(data.performedAt);
      if (at && !Number.isNaN(at.getTime()) && at.getTime() > ctx.now.getTime()) {
        throw httpError(400, 'A calibration cannot be performed in the future', { fields: { performedAt: 'Must not be in the future' } });
      }
      if (data.equipment) {
        const item = await equipment.model.findById(data.equipment).session(ctx.session).select('status').lean().catch(() => null);
        if (!item) throw httpError(400, 'Equipment not found', { fields: { equipment: 'Unknown equipment' } });
        if (item.status === 'CheckedOut') throw httpError(409, 'Equipment is checked out — record the return before calibrating');
        if (item.status === 'Retired') throw httpError(409, 'Equipment is retired');
      }
      return { ...data, performedBy: data.performedBy || ctx.user?.userId };
    },

    /** Req 4.1, 4.2: schedule the next calibration and apply the status rule. */
    async afterCreate(doc, ctx) {
      const item = await equipment.model.findById(doc.equipment).session(ctx.session);
      const changes = calibrationOutcome(item, doc);
      if (!Object.keys(changes).length) return;
      const before = item.toObject();
      item.set(changes);
      await item.save({ session: ctx.session });
      await recordChanges([{ actor: ctx.user ?? 'system', resource: equipment, before, after: item }], ctx.session);
    },
  },
});
