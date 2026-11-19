import { defineResource } from '../core/defineResource.js';

/** Percentage of milestones that are done (0 when there are none). */
export function milestoneProgress(milestones) {
  const items = Array.isArray(milestones) ? milestones : [];
  return items.length ? Math.round((items.filter((m) => m?.done).length / items.length) * 100) : 0;
}

/**
 * Goals: something bigger than a note, broken into milestones. Progress is worked out from the
 * milestones (never typed), so it cannot drift from what is actually ticked. Active goals become
 * Overdue once the target date passes.
 */
export default defineResource({
  key: 'goals',
  label: 'Goals',
  icon: 'target',
  titleField: 'title',
  description: 'Bigger aims split into milestones. Progress follows the ticked milestones.',
  fields: {
    title:      { type: 'string', label: 'Goal', required: true, max: 120, list: true, search: true },
    why:        { type: 'text', label: 'Why it matters', search: true },
    status:     { type: 'enum', label: 'Status', values: ['Active', 'Achieved', 'Overdue', 'Archived'], default: 'Active', list: true, filter: true },
    progress:   { type: 'number', label: 'Progress (%)', min: 0, max: 100, default: 0, list: true, formHidden: true, help: 'Worked out from the milestones.' },
    owner:      { type: 'ref', label: 'Owner', ref: 'User', list: true, filter: true },
    targetDate: { type: 'date', label: 'Target date', list: true },
    milestones: { type: 'checklist', label: 'Milestones', max: 30 },
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
      Active: ['Achieved', 'Archived'],
      Overdue: ['Active', 'Achieved', 'Archived'],
      Achieved: ['Active', 'Archived'],
      Archived: ['Active'],
    },
  },
  due: { field: 'targetDate', status: 'status', from: ['Active'], to: 'Overdue' },
  softDelete: { field: 'status', value: 'Archived', at: 'archivedAt' },
  report: { columns: ['title', 'status', 'progress', 'owner', 'targetDate'] },
  voice: { synonyms: ['goals', 'objectives'] },
  defaultSort: '-createdAt',
  hooks: {
    beforeCreate: (d, ctx) => ({ ...d, owner: d.owner ?? ctx.user?.userId, progress: milestoneProgress(d.milestones) }),
    // Always derived: a direct API write cannot make progress disagree with the ticked milestones.
    beforeUpdate: (doc, changes) => ({ ...changes, progress: milestoneProgress('milestones' in changes ? changes.milestones : doc.milestones) }),
  },
});
