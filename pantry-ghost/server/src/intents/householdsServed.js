import { monthKey, monthWindow } from '../domain/dates.js';

/**
 * HOUSEHOLDS_SERVED — "how many households did we serve this month" (Req 6.1, 6.2).
 *
 * Declared aggregate-only: Board may ask although it cannot read households or distributions,
 * because the answer is a count — never a household code or record.
 */
const RE = /^how many (?:households|families|people) (?:did we|have we|we|were) (?:serve|served|help|helped|feed|fed|reach|reached)(?: so far)?( this month| last month)?(?: so far)?$/;

export default {
  name: 'HOUSEHOLDS_SERVED',
  resource: 'distributions',
  aggregateOnly: true,
  requires: ['Coordinator', 'Volunteer', 'Board'],
  examples: ['how many households did we serve this month'],
  match(t) {
    const m = t.match(RE);
    return m ? { which: m[1]?.trim() === 'last month' ? 'last' : 'this' } : null;
  },
  async handle({ which }, { registry, now = new Date() }) {
    const d = new Date(now);
    const ref = which === 'last' ? new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)) : d;
    const { start, end, label } = monthWindow(monthKey(ref));
    const Dist = registry.get('distributions').model;
    const ids = await Dist.distinct('household', { at: { $gte: start, $lt: end } });
    const [people, distributions] = await Promise.all([
      ids.length
        ? registry.get('households').model.aggregate([{ $match: { _id: { $in: ids } } }, { $group: { _id: null, n: { $sum: '$size' } } }]).then((r) => r[0]?.n ?? 0)
        : 0,
      Dist.countDocuments({ at: { $gte: start, $lt: end } }),
    ]);
    // Aggregates only (Req 6.2): no ids or codes leave this handler.
    return { households: ids.length, people, distributions, month: label, which };
  },
  respond({ households, people, distributions, month, which }) {
    if (!households) return `We haven't served any households in ${month} yet.`;
    const hh = households === 1 ? '1 household' : `${households} households`;
    return `We served ${hh} — ${people} ${people === 1 ? 'person' : 'people'} — with ${distributions} ${distributions === 1 ? 'distribution' : 'distributions'} in ${month}${which === 'this' ? ' so far' : ''}.`;
  },
};
