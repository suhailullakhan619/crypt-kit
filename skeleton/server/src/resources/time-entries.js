import { defineResource } from '../core/defineResource.js';

/**
 * Time log: minutes spent, optionally against a note. The Calendar view shows the log by day.
 * Entries default to today and to the person logging them; anyone with write access can correct one.
 */
export default defineResource({
  key: 'time-entries',
  label: 'Time log',
  icon: 'timer',
  titleField: 'what',
  description: 'Log the minutes you spend, against a note if you like.',
  fields: {
    what:    { type: 'string', label: 'What did you work on?', required: true, max: 120, list: true, search: true },
    minutes: { type: 'number', label: 'Minutes', required: true, min: 1, max: 1440, list: true },
    day:     { type: 'date', label: 'Day', list: true, help: 'Defaults to today.' },
    task:    { type: 'ref', label: 'Note', ref: 'notes', list: true, filter: true },
    person:  { type: 'ref', label: 'Logged by', ref: 'User', list: true, filter: true },
  },
  permissions: {
    read:   ['Member', 'Viewer'],
    create: ['Member'],
    update: ['Member'],
    delete: ['Member'],
  },
  report: { columns: ['what', 'minutes', 'day', 'task', 'person'] },
  voice: { synonyms: ['time log', 'time entries', 'hours'] },
  defaultSort: '-day',
  hooks: {
    beforeCreate: (d, ctx) => ({ ...d, person: d.person ?? ctx.user?.userId, day: d.day ?? ctx.now }),
  },
});
