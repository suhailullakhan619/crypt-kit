import * as activity from './activityService.js';
import { now as clockNow, getContext } from '../context.js';
import { notifyDueChange } from './notificationService.js';

/**
 * Applies every resource's Due Rule (Req 8.2–8.5): records whose due date is before `now`
 * and whose status is in `due.from` move to `due.to`. Nothing else changes.
 *
 * @param {{ withDue: () => Array<{ key: string, def: object, model: import('mongoose').Model }> }} registry
 * @param {Date} [now] - injectable for deterministic tests
 * @returns {Promise<Record<string, number>>} records changed per resource key
 */
export async function sweep(registry, now = clockNow()) {
  const results = {};
  for (const r of registry.withDue()) {
    const { field, status, from, to } = r.def.due;
    const filter = { [field]: { $ne: null, $lt: now }, [status]: { $in: from } };

    const docs = await r.model.find(filter).lean();
    if (docs.length) {
      const ids = docs.map((d) => d._id);
      // Re-apply the filter so a record changed concurrently is not overwritten.
      await r.model.updateMany({ _id: { $in: ids }, ...filter }, { $set: { [status]: to } });
      await activity.recordMany(
        docs.map((d) => ({ actor: 'system', resource: r.key, recordId: d._id, action: 'status', diff: { [status]: [d[status], to] } }))
      );
      const cfg = getContext().config;
      if (!cfg?.routineDueRules?.includes(r.key)) await notifyDueChange(r, docs, to, { roles: [cfg?.roles?.[0], ...(cfg?.notifyRoles?.[r.key] ?? [])].filter(Boolean) });
    }
    results[r.key] = docs.length;
  }
  return results;
}
