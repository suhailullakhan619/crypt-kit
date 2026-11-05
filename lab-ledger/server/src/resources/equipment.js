import { defineResource } from '../core/defineResource.js';
import { httpError } from '../utils/httpError.js';

export const CATEGORIES = ['Measurement', 'Imaging', 'Biology', 'Chemistry', 'Electronics', 'Safety', 'Other'];
export const EQUIPMENT_STATUS = ['Available', 'CheckedOut', 'Maintenance', 'CalibrationDue', 'Retired'];
export const CONDITIONS = ['Good', 'Fair', 'Damaged'];

/** Asset tags are stored upper-case and trimmed so `/scan/ll-0042` finds `LL-0042`. */
export const normaliseTag = (tag) => String(tag ?? '').trim().toUpperCase();

const upperTag = (data) => (typeof data.assetTag === 'string' ? { ...data, assetTag: normaliseTag(data.assetTag) } : data);

/**
 * Unique, serial-numbered lab equipment (lab-ledger Req 2.2–2.4).
 *
 * - `CheckedOut` is workflow-only: only the checkout service may enter or leave it (Req 2.3).
 * - The skeleton sweeper flags `Available` items whose `nextCalibration` has passed as
 *   `CalibrationDue` (Req 2.4); DELETE retires the item (soft delete).
 */
export default defineResource({
  key: 'equipment',
  label: 'Equipment',
  icon: 'microscope',
  titleField: 'name',
  description: 'Every labelled instrument, its status and its next calibration.',
  fields: {
    name:         { type: 'string', label: 'Name', required: true, max: 120, list: true, search: true },
    assetTag:     { type: 'string', label: 'Asset tag', required: true, unique: true, max: 32, list: true, search: true, placeholder: 'LL-0042' },
    serialNumber: { type: 'string', label: 'Serial number', max: 80, search: true },
    category:     { type: 'enum', label: 'Category', values: CATEGORIES, default: 'Other', list: true, filter: true },
    lab:          { type: 'ref', label: 'Lab', ref: 'labs', list: true, filter: true },
    status:       { type: 'enum', label: 'Status', values: EQUIPMENT_STATUS, default: 'Available', list: true, filter: true },
    condition:    { type: 'enum', label: 'Condition', values: CONDITIONS, default: 'Good', filter: true },
    requiresCalibration:     { type: 'boolean', label: 'Requires calibration', default: false, filter: true },
    calibrationIntervalDays: { type: 'number', label: 'Calibration interval (days)', min: 1, max: 3650 },
    nextCalibration:         { type: 'date', label: 'Next calibration', list: true },
    notes:        { type: 'text', label: 'Notes', max: 2000 },
  },
  // LabManager is the superuser and may do everything; Technicians maintain records.
  permissions: { read: ['Technician', 'Student'], create: [], update: ['Technician'], delete: [] },
  statusFlow: {
    field: 'status',
    workflowOnly: ['CheckedOut'],
    transitions: {
      Available: ['Maintenance', 'Retired'],
      Maintenance: ['Available', 'Retired'],
      CalibrationDue: ['Maintenance', 'Available'],
      CheckedOut: [],
      Retired: [],
    },
  },
  due: { field: 'nextCalibration', status: 'status', from: ['Available'], to: 'CalibrationDue' },
  softDelete: { field: 'status', value: 'Retired', at: 'retiredAt' },
  // Exactly the Calibration Audit columns (Req 7.2); the skeleton adds "Overdue By" from the due rule.
  report: { columns: ['name', 'assetTag', 'lab', 'status', 'nextCalibration'] },
  voice: { synonyms: ['equipment', 'instruments', 'devices'] },
  defaultSort: 'assetTag',
  hooks: {
    beforeCreate: (data) => upperTag(data),
    beforeUpdate: (_doc, changes) => upperTag(changes),
  },
  extendSchema(schema) {
    // Soft delete (DELETE → Retired) does not go through the status-flow check, so guard it here:
    // an item out on loan leaves CheckedOut only through the return workflow (findOneAndUpdate,
    // which skips document middleware).
    schema.post('init', function rememberStatus() {
      this.$locals.loadedStatus = this.status;
    });
    schema.pre('save', async function guardCheckedOut() {
      if (!this.isNew && this.isModified('status') && this.$locals.loadedStatus === 'CheckedOut') {
        throw httpError(409, 'Equipment is checked out — record the return first');
      }
    });
  },
});
