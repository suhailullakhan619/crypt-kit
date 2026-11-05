import { defineResource } from '../../src/core/defineResource.js';

/** Test-only resource covering every field type, a secret field, status flow, due rule and soft delete. */
export const STATUS = ['Fresh', 'Pickled', 'Lost', 'Gone'];
export const TRANSITIONS = { Fresh: ['Pickled', 'Lost'], Pickled: ['Lost'], Lost: ['Fresh'], Gone: [] };

export default defineResource({
  key: 'specimens',
  label: 'Specimens',
  titleField: 'name',
  fields: {
    name:       { type: 'string', required: true, max: 60, list: true, search: true },
    notes:      { type: 'text', search: true },
    weight:     { type: 'number', min: 0, max: 1000, filter: true },
    alive:      { type: 'boolean', filter: true },
    foundOn:    { type: 'date', filter: true },
    kind:       { type: 'enum', values: ['Bat', 'Toad', 'Newt'], filter: true },
    status:     { type: 'enum', values: STATUS, default: 'Fresh', filter: true },
    tags:       { type: 'enum', multiple: true, values: ['A', 'B', 'C'], filter: true },
    keeper:     { type: 'ref', ref: 'User', filter: true },
    dueAt:      { type: 'date' },
    secretCode: { type: 'string', secret: true },
  },
  permissions: { read: ['Member', 'Viewer'], create: ['Member'], update: ['Member'], delete: ['Member'] },
  statusFlow: { field: 'status', transitions: TRANSITIONS, workflowOnly: ['Gone'] },
  due: { field: 'dueAt', status: 'status', from: ['Fresh'], to: 'Lost' },
  softDelete: { field: 'status', value: 'Gone', at: 'goneAt' },
});
