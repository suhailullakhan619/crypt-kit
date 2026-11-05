import { daysBetween } from '../domain/dates.js';

/**
 * "Use first" board (Req 3.3): ExpiringSoon lots, soonest expiry first, with quantity and location.
 * Client renderer: client/src/dashboard/useFirst.jsx.
 */
export default {
  key: 'useFirst',
  title: 'Use first',
  roles: ['Volunteer', 'Board'],
  async load({ registry, now }) {
    const model = registry.get('stock-lots').model;
    const filter = { status: 'ExpiringSoon', quantity: { $gt: 0 } };
    const [total, lots] = await Promise.all([
      model.countDocuments(filter),
      model.find(filter).sort({ expiresOn: 1, _id: 1 }).limit(12)
        .select({ itemName: 1, category: 1, quantity: 1, unit: 1, location: 1, expiresOn: 1 }).lean(),
    ]);
    return {
      total,
      items: lots.map((l) => ({ ...l, daysLeft: l.expiresOn ? daysBetween(now, l.expiresOn) : null })),
    };
  },
};
