import { defineResource } from '../core/defineResource.js';

/**
 * Projects group related notes (a note's `project` field points here). Planning and Active projects
 * become Overdue once their due date passes; archiving hides a project but keeps its history.
 */
export default defineResource({
  key: 'projects',
  label: 'Projects',
  icon: 'folder-kanban',
  titleField: 'name',
  description: 'Group related notes and track the milestones that finish a project.',
  fields: {
    name:        { type: 'string', label: 'Name', required: true, max: 80, list: true, search: true },
    description: { type: 'text', label: 'Description', search: true },
    status:      { type: 'enum', label: 'Status', values: ['Planning', 'Active', 'OnHold', 'Completed', 'Overdue', 'Archived'], default: 'Planning', list: true, filter: true },
    owner:       { type: 'ref', label: 'Owner', ref: 'User', list: true, filter: true },
    startDate:   { type: 'date', label: 'Start date' },
    dueDate:     { type: 'date', label: 'Due date', list: true },
    milestones:  { type: 'checklist', label: 'Milestones', list: true, max: 30 },
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
      Planning: ['Active', 'OnHold', 'Archived'],
      Active: ['OnHold', 'Completed', 'Archived'],
      OnHold: ['Active', 'Archived'],
      Overdue: ['Active', 'Completed', 'Archived'],
      Completed: ['Active', 'Archived'],
      Archived: ['Planning'],
    },
  },
  due: { field: 'dueDate', status: 'status', from: ['Planning', 'Active'], to: 'Overdue' },
  softDelete: { field: 'status', value: 'Archived', at: 'archivedAt' },
  report: { columns: ['name', 'status', 'owner', 'startDate', 'dueDate', 'milestones'] },
  voice: { synonyms: ['projects'] },
  defaultSort: '-createdAt',
  hooks: {
    // The person who creates a project owns it unless they pick someone else.
    beforeCreate: (d, ctx) => ({ ...d, owner: d.owner ?? ctx.user?.userId }),
  },
});
