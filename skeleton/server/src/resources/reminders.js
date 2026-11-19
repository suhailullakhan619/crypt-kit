import { defineResource } from '../core/defineResource.js';

/**
 * Reminders: something to do at a set date and time. When the time passes and the reminder is still
 * Pending, the sweeper marks it Missed and notifies the owner (bell, plus email when mail is set up).
 * To snooze, edit the time and move it back to Pending.
 */
export default defineResource({
  key: 'reminders',
  label: 'Reminders',
  icon: 'bell-ring',
  titleField: 'title',
  description: 'Never lose track of a date: you are notified when a reminder is missed.',
  fields: {
    title:    { type: 'string', label: 'Reminder', required: true, max: 120, list: true, search: true },
    remindAt: { type: 'date', time: true, label: 'Remind me at', required: true, list: true },
    status:   { type: 'enum', label: 'Status', values: ['Pending', 'Done', 'Missed', 'Archived'], default: 'Pending', list: true, filter: true },
    owner:    { type: 'ref', label: 'Owner', ref: 'User', list: true, filter: true },
    details:  { type: 'text', label: 'Details', search: true },
    note:     { type: 'ref', label: 'Related note', ref: 'notes', filter: true },
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
      Pending: ['Done', 'Archived'],
      Missed: ['Pending', 'Done', 'Archived'],
      Done: ['Pending', 'Archived'],
      Archived: ['Pending'],
    },
  },
  due: { field: 'remindAt', status: 'status', from: ['Pending'], to: 'Missed' },
  softDelete: { field: 'status', value: 'Archived', at: 'archivedAt' },
  report: { columns: ['title', 'remindAt', 'status', 'owner'] },
  voice: { synonyms: ['reminders', 'alarms'] },
  defaultSort: 'remindAt',
  hooks: {
    beforeCreate: (d, ctx) => ({ ...d, owner: d.owner ?? ctx.user?.userId }),
  },
});
