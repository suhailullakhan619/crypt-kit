import { defineResource } from '../core/defineResource.js';
import { nextCode } from '../utils/itemCode.js';

/**
 * Example resource shipped with the skeleton. Delete or replace it in your app.
 * Exercises every feature: search, filters, ref, status flow, due rule, soft delete, report, voice.
 */
export default defineResource({
  key: 'notes',
  label: 'Notes',
  icon: 'scroll-text',
  titleField: 'title',
  fields: {
    code:    { type: 'string', label: 'ID', unique: true, max: 16, list: true, search: true, formHidden: true, help: 'Generated automatically (N-0001). Printed under the QR code.' },
    title:   { type: 'string', label: 'Title', required: true, max: 120, list: true, search: true },
    body:    { type: 'text', label: 'Body', search: true },
    status:  { type: 'enum', label: 'Status', values: ['Open', 'Done', 'Overdue', 'Archived'], default: 'Open', list: true, filter: true },
    priority:{ type: 'enum', label: 'Priority', values: ['Low', 'Medium', 'High'], default: 'Medium', list: true, filter: true },
    owner:   { type: 'ref', label: 'Owner', ref: 'User', list: true, filter: true },
    dueDate: { type: 'date', label: 'Due date', list: true },
    pinned:  { type: 'boolean', label: 'Pinned', default: false, filter: true },
    tags:    { type: 'enum', label: 'Tags', multiple: true, values: ['Ritual', 'Potion', 'Haunting', 'Admin'] },
    subtasks:{ type: 'checklist', label: 'Subtasks', list: true },
  },
  permissions: {
    read:   ['Member', 'Viewer'],
    create: ['Member'],
    update: ['Member'],
    delete: [],
  },
  statusFlow: {
    field: 'status',
    transitions: {
      Open: ['Done', 'Archived'],
      Overdue: ['Done', 'Archived'],
      Done: ['Open', 'Archived'],
      Archived: ['Open'],
    },
  },
  due: { field: 'dueDate', status: 'status', from: ['Open'], to: 'Overdue' },
  softDelete: { field: 'status', value: 'Archived', at: 'archivedAt' },
  report: { columns: ['title', 'status', 'priority', 'owner', 'dueDate'] },
  voice: { synonyms: ['notes', 'tasks', 'to-dos'] },
  defaultSort: '-createdAt',
  hooks: {
    // Short ID for "Scan or find" and QR labels; always generated here and never changed.
    beforeCreate: async (d, ctx) => ({ ...d, code: await nextCode(ctx.registry.get('notes').model, 'code', 'N', ctx.session) }),
    beforeUpdate: (_doc, { code: _permanent, ...changes }) => changes,
  },
});
