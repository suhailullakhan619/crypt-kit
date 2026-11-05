import { defineResource } from '../core/defineResource.js';

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
    title:   { type: 'string', label: 'Title', required: true, max: 120, list: true, search: true },
    body:    { type: 'text', label: 'Body', search: true },
    status:  { type: 'enum', label: 'Status', values: ['Open', 'Done', 'Overdue', 'Archived'], default: 'Open', list: true, filter: true },
    priority:{ type: 'enum', label: 'Priority', values: ['Low', 'Medium', 'High'], default: 'Medium', list: true, filter: true },
    owner:   { type: 'ref', label: 'Owner', ref: 'User', list: true, filter: true },
    dueDate: { type: 'date', label: 'Due date', list: true },
    pinned:  { type: 'boolean', label: 'Pinned', default: false, filter: true },
    tags:    { type: 'enum', label: 'Tags', multiple: true, values: ['Ritual', 'Potion', 'Haunting', 'Admin'] },
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
});
