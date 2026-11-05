import { defineResource } from '../core/defineResource.js';

/**
 * Physical rooms where equipment is kept (lab-ledger Req 2.1).
 * Everyone may read; only the LabManager (superuser) may create, update or delete.
 */
export default defineResource({
  key: 'labs',
  label: 'Labs',
  icon: 'building-2',
  titleField: 'name',
  description: 'Teaching labs and the rooms where equipment lives.',
  fields: {
    name:     { type: 'string', label: 'Name', required: true, unique: true, max: 80, list: true, search: true },
    building: { type: 'string', label: 'Building', max: 80, list: true, search: true },
    room:     { type: 'string', label: 'Room', max: 40, list: true },
    manager:  { type: 'ref', label: 'Manager', ref: 'User', list: true, filter: true },
  },
  permissions: { read: ['Technician', 'Student'], create: [], update: [], delete: [] },
  report: { columns: ['name', 'building', 'room', 'manager'] },
  voice: { synonyms: ['labs', 'laboratories', 'rooms'] },
  defaultSort: 'name',
});
