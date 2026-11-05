import * as activity from './activityService.js';
import { diff } from '../utils/diff.js';

/**
 * Builds the Activity Log entries for one record change made by a workflow (not the generic
 * CRUD path): an `update` entry with the field diff, plus a `status` entry when `statusField`
 * changed — the same shape resourceService writes (lab-ledger Req 3.9).
 *
 * @param {{ actor: object|'system', resource: { key: string, def: object }, before: object|null, after: object, statusField?: string, action?: string }} p
 * @returns {object[]} entries for activityService.recordMany
 */
export function changeEntries({ actor, resource, before, after, statusField = 'status', action = 'update' }) {
  const d = diff(before, after, resource.def);
  const entries = [];
  if (action !== 'update' || Object.keys(d).length) {
    entries.push({ actor, resource: resource.key, recordId: after._id, action, diff: d });
  }
  if (before && statusField && before[statusField] !== after[statusField]) {
    entries.push({ actor, resource: resource.key, recordId: after._id, action: 'status', diff: { [statusField]: [before[statusField], after[statusField]] } });
  }
  return entries;
}

/**
 * Records the entries for several changes in one write inside `session`.
 * @param {Array<Parameters<typeof changeEntries>[0]>} changes
 * @param {import('mongoose').ClientSession} [session]
 */
export function recordChanges(changes, session) {
  return activity.recordMany(changes.flatMap(changeEntries), session);
}
