import ActivityLog from '../models/ActivityLog.js';

/**
 * @typedef {{ userId?: string, name?: string } | 'system'} Actor
 */

function actorFields(actor) {
  if (actor === 'system' || !actor) return { actor: 'system', actorName: 'System' };
  return { actor: actor.userId, actorName: actor.name ?? null };
}

/**
 * Appends one Activity Log entry.
 * @param {{ actor: Actor, resource: string, recordId: any, action: 'create'|'update'|'delete'|'status'|'comment', diff?: object }} entry
 * @param {import('mongoose').ClientSession} [session]
 */
export async function record({ actor, resource, recordId, action, diff = {} }, session) {
  const [doc] = await ActivityLog.create(
    [{ ...actorFields(actor), resource, recordId, action, diff, at: new Date() }],
    session ? { session } : undefined
  );
  return doc;
}

/**
 * Appends many entries in one write.
 * @param {Array<Parameters<typeof record>[0]>} entries
 * @param {import('mongoose').ClientSession} [session]
 */
export async function recordMany(entries, session) {
  if (!entries.length) return [];
  const now = new Date();
  return ActivityLog.insertMany(
    entries.map((e) => ({ ...actorFields(e.actor), resource: e.resource, recordId: e.recordId, action: e.action, diff: e.diff ?? {}, at: now })),
    session ? { session } : undefined
  );
}

/** Entries for one record, newest first (Req 6.2). */
export function forRecord(resource, recordId, limit = 100) {
  return ActivityLog.find({ resource, recordId }).sort({ at: -1, _id: -1 }).limit(limit).lean();
}

/**
 * Latest entries, optionally restricted to a set of resource keys (Req 6.3, 9.2).
 * @param {{ resources?: string[], limit?: number }} opts
 */
export function latest({ resources, limit = 50 } = {}) {
  const filter = resources ? { resource: { $in: resources } } : {};
  return ActivityLog.find(filter).sort({ at: -1, _id: -1 }).limit(limit).lean();
}
