import { classifyExpiry } from '../domain/classifyExpiry.js';
import { EXPIRY_WINDOWS } from '../domain/expiryWindows.js';
import * as activity from './activityService.js';
import { notify } from './notificationService.js';

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
  await notifyExpiry(to, now);
  return { checked: docs.length, changed: changes.length, to };
}

const plural = (n, one, many) => (n === 1 ? one : many);
const EXPIRY_NOTICES = {
  ExpiringSoon: {
    kind: 'warning',
    text: (n) => `${n} ${plural(n, 'lot is', 'lots are')} expiring soon. Use ${plural(n, 'it', 'them')} first.`,
  },
  Expired: {
    kind: 'danger',
    text: (n) => `${n} ${plural(n, 'lot has', 'lots have')} expired. Check and discard ${plural(n, 'it', 'them')}.`,
  },
};

/** One summary notification per new status per day (never one per lot). Never throws. */
export async function notifyExpiry(to, now) {
  try {
    const day = now.toISOString().slice(0, 10);
    for (const [status, notice] of Object.entries(EXPIRY_NOTICES)) {
      const n = to[status];
      if (!n) continue;
      await notify({
        roles: ['Coordinator', 'Volunteer'],
        title: notice.text(n),
        body: 'Open the stock list to review them.',
        link: `/r/stock-lots?status=${status}`,
        kind: notice.kind,
        dedupeKey: `expiry:${day}:${status}`,
      });
    }
  } catch (err) {
    console.error('notifyExpiry failed:', err.message);
  }
}
