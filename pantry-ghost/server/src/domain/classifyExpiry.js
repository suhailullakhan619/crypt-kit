import { EXPIRY_WINDOWS } from './expiryWindows.js';
import { daysBetween } from './dates.js';

/**
 * Derives a lot's status from its quantity and expiry date (Req 3.1). Pure and total: any input
 * yields exactly one of Fresh, ExpiringSoon, Expired, Depleted, Discarded (Property P4).
 *
 *   Discarded stays Discarded · quantity ≤ 0 → Depleted · no expiry → Fresh
 *   expiry before today → Expired · within the category window → ExpiringSoon · else Fresh
 *
 * @param {{ status?: string, quantity?: number, expiresOn?: Date|string|null, category?: string }} lot
 * @param {Date} now
 * @param {Record<string, number>} [windows] - days per category (unknown category → 0)
 * @returns {'Fresh'|'ExpiringSoon'|'Expired'|'Depleted'|'Discarded'}
 */
export function classifyExpiry(lot, now, windows = EXPIRY_WINDOWS) {
  if (lot?.status === 'Discarded') return 'Discarded';
  if (!(Number(lot?.quantity) > 0)) return 'Depleted';
  if (!lot.expiresOn) return 'Fresh';
  const expires = new Date(lot.expiresOn);
  if (Number.isNaN(expires.getTime())) return 'Fresh';
  const days = daysBetween(now, expires);
  if (days < 0) return 'Expired';
  const window = Number(windows?.[lot.category]);
  if (days <= (Number.isFinite(window) ? window : 0)) return 'ExpiringSoon';
  return 'Fresh';
}

export default classifyExpiry;
