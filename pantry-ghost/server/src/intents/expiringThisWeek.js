import { DAY, startOfDay, shortDate } from '../domain/dates.js';
import { UNPICKABLE } from '../domain/expiryWindows.js';
import { amount, listOf } from '../domain/spoken.js';

/**
 * EXPIRING_THIS_WEEK — "what expires this week" (Req 6.1).
 * Usable lots expiring from today through today + 7 days, soonest first; the top 5 are spoken.
 */
const RE = /^(?:what|which|whats|what s|is anything|is there anything|anything|show me|list|tell me)\b.*\b(?:expire|expires|expiring|go off|goes off|going off)\b(?: in)?(?: this week| in the next (?:7|seven) days| soon| before next week| next week)$/;

export default {
  name: 'EXPIRING_THIS_WEEK',
  resource: 'stock-lots',
  examples: ['what expires this week'],
  match: (t) => (RE.test(t) ? {} : null),
  async handle(_params, { registry, now = new Date() }) {
    const today = startOfDay(now);
    const filter = {
      status: { $nin: UNPICKABLE },
      quantity: { $gt: 0 },
      expiresOn: { $gte: today, $lt: new Date(today.getTime() + 8 * DAY) },
    };
    const model = registry.get('stock-lots').model;
    const [count, lots] = await Promise.all([
      model.countDocuments(filter),
      model.find(filter).sort({ expiresOn: 1, _id: 1 }).limit(5)
        .select({ itemName: 1, quantity: 1, unit: 1, expiresOn: 1, location: 1, category: 1 }).lean(),
    ]);
    return { count, lots };
  },
  respond({ count, lots }) {
    if (!count) return 'Nothing expires in the next 7 days. The pantry is in good shape.';
    const items = lots.map((l) => `${amount(l.quantity, l.unit)} of ${l.itemName.toLowerCase()} (${shortDate(l.expiresOn)}, ${String(l.location ?? 'shelf').toLowerCase()})`);
    const head = count === 1 ? '1 lot expires in the next 7 days' : `${count} lots expire in the next 7 days`;
    return `${head}. Use first: ${listOf(items)}${count > lots.length ? ', and more' : ''}.`;
  },
};
