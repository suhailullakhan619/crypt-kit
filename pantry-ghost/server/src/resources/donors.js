import { defineResource } from '../core/defineResource.js';

/**
 * Donors: people and organisations that give food (Req 2.1).
 * Coordinator (superuser) and Volunteer read and create; only the Coordinator edits or deletes.
 */
export default defineResource({
  key: 'donors',
  label: 'Donors',
  icon: 'handshake',
  titleField: 'name',
  description: 'People and organisations who give food.',
  fields: {
    name:    { type: 'string', label: 'Name', required: true, max: 80, list: true, search: true },
    type:    { type: 'enum', label: 'Type', values: ['Individual', 'Grocery', 'Farm', 'Business', 'FoodDrive'], default: 'Individual', list: true, filter: true },
    contact: { type: 'string', label: 'Contact', max: 120, list: true, help: 'Phone or email of the donor (organisations only — never recipients).' },
    notes:   { type: 'text', label: 'Notes', max: 1000 },
  },
  permissions: {
    read:   ['Volunteer'],
    create: ['Volunteer'],
    update: [],
    delete: [],
  },
  report: { columns: ['name', 'type', 'contact'] },
  voice: { synonyms: ['donors', 'donor', 'suppliers'] },
  defaultSort: 'name',
});
