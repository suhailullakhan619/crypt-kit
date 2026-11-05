import { UNPICKABLE } from './expiryWindows.js';

/**
 * First-expiry-first-out pick plan (Req 5.1, 5.2). Pure.
 *
 * Eligible lots: quantity > 0 and status not Expired, Discarded or Depleted. They are used in order
 * of `expiresOn` (lots without expiry last), then `receivedAt`, then id. Capacity is shared across
 * request items, so two items matching the same lot never over-draw it (Property P3).
 *
 * @param {Array<{ category?: string, itemName?: string, quantity: number }>} request
 * @param {Array<{ _id: any, category: string, itemName: string, quantity: number, status?: string,
 *                 expiresOn?: Date|string|null, receivedAt?: Date|string|null }>} lots
 * @returns {{ lines: Array<{ lotId: string, quantity: number, ask: number }>,
 *             shortfalls: Array<{ ask: object, missing: number }> }}
 */
export function planFefo(request, lots) {
  const time = (d) => {
    const t = d ? new Date(d).getTime() : NaN;
    return Number.isNaN(t) ? Infinity : t;
  };
  // Compare with </> rather than subtraction: Infinity - Infinity is NaN for two undated lots.
  const cmp = (x, y) => (x === y ? 0 : x < y ? -1 : 1);
  const sorted = (lots ?? [])
    .filter((l) => Number(l.quantity) > 0 && !UNPICKABLE.includes(l.status))
    .sort((a, b) =>
      cmp(time(a.expiresOn), time(b.expiresOn)) ||
      cmp(time(a.receivedAt), time(b.receivedAt)) ||
      cmp(String(a._id), String(b._id))
    );

  const remaining = new Map(sorted.map((l) => [String(l._id), Number(l.quantity)]));
  const lines = [];
  const shortfalls = [];

  (request ?? []).forEach((item, ask) => {
    let need = Number(item?.quantity);
    if (!Number.isFinite(need) || need <= 0) return;
    for (const lot of sorted) {
      if (need <= 0) break;
      if (!matches(item, lot)) continue;
      const id = String(lot._id);
      const left = remaining.get(id);
      if (left <= 0) continue;
      const take = Math.min(need, left);
      lines.push({ lotId: id, quantity: take, ask });
      remaining.set(id, left - take);
      need -= take;
    }
    if (need > 0) shortfalls.push({ ask: item, missing: need });
  });

  return { lines, shortfalls };
}

/** A request item matches a lot by category and/or item name (case-insensitive). */
export function matches(item, lot) {
  if (item?.category && lot.category !== item.category) return false;
  if (item?.itemName && String(lot.itemName ?? '').trim().toLowerCase() !== String(item.itemName).trim().toLowerCase()) return false;
  return !!(item?.category || item?.itemName);
}

export default planFefo;
