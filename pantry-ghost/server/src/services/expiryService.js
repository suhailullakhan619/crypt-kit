import { classifyExpiry } from '../domain/classifyExpiry.js';
import { EXPIRY_WINDOWS } from '../domain/expiryWindows.js';
import * as activity from './activityService.js';

/**
 * Re-applies classifyExpiry to every lot that is not Depleted or Discarded (Req 3.2) and records a
 * `status` Activity entry (actor: system) for each lot whose status changed.
 *
 * @param {{ get: (key: string) => any }} registry
 * @param {Date} [now] - injectable for deterministic tests
 * @returns {Promise<{ checked: number, changed: number, to: Record<string, number> }>}
 */
export async function reclassifyAll(registry, now = new Date()) {
  const lots = registry?.get('stock-lots');
  if (!lots) return { checked: 0, changed: 0, to: {} };

  const docs = await lots.model
    .find({ status: { $nin: ['Depleted', 'Discarded'] } })
    .select({ status: 1, quantity: 1, expiresOn: 1, category: 1 })
    .lean();
  const changes = docs
    .map((d) => ({ d, next: classifyExpiry(d, now, EXPIRY_WINDOWS) }))
    .filter(({ d, next }) => next !== d.status);

  if (changes.length) {
    // Conditional on the old status so a lot changed concurrently (e.g. distributed) is not overwritten.
    await lots.model.bulkWrite(
      changes.map(({ d, next }) => ({ updateOne: { filter: { _id: d._id, status: d.status }, update: { $set: { status: next } } } })),
      { ordered: false }
    );
    await activity.recordMany(
      changes.map(({ d, next }) => ({ actor: 'system', resource: 'stock-lots', recordId: d._id, action: 'status', diff: { status: [d.status, next] } }))
    );
  }

  const to = {};
  for (const { next } of changes) to[next] = (to[next] ?? 0) + 1;
  return { checked: docs.length, changed: changes.length, to };
}
