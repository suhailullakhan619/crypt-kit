/**
 * Pure helpers for spoken voice answers.
 */
import { longDate, shortDate } from './dates.js';

const UNIT_SPOKEN = { item: ['item', 'items'], can: ['can', 'cans'], box: ['box', 'boxes'], kg: ['kilo', 'kilos'], lb: ['pound', 'pounds'], L: ['litre', 'litres'] };

/** 12, 'can' → "12 cans" */
export function amount(quantity, unit) {
  const [one, many] = UNIT_SPOKEN[unit] ?? [unit, unit];
  return `${quantity} ${quantity === 1 ? one : many}`;
}

/** ['a', 'b', 'c'] → "a, b and c" */
export function listOf(parts) {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

const FIELD_SPOKEN = { quantity: 'how many', unit: 'the unit', itemName: 'what the item is', category: 'the category', expiresOn: 'the expiry date' };

/** "I heard 12 cans of black beans, expiring 3 March 2027, from Fresh Mart" */
export function describeDraft(d) {
  const qty = d.quantity ? amount(d.quantity, d.unit) : 'some';
  const what = d.itemName ? d.itemName.toLowerCase() : 'something';
  const parts = [`${qty} of ${what}`];
  if (d.expiresOn) parts.push(`expiring ${longDate(d.expiresOn)}`);
  if (d.donorName) parts.push(`from ${d.donorName}`);
  return parts.join(', ');
}

export function missingSentence(missing) {
  if (!missing?.length) return '';
  return ` I didn't catch ${listOf(missing.map((m) => FIELD_SPOKEN[m] ?? m))}.`;
}

export { shortDate, longDate };

