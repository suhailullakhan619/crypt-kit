// Property P3: FEFO Plan Is Valid and Earliest-First
// Validates: Requirements 5.1, 5.2
import fc from 'fast-check';
import { planFefo, matches } from './planFefo.js';
import { LOT_STATUSES, UNPICKABLE } from './expiryWindows.js';

const CATS = ['Canned', 'Dairy', 'Dry'];
const ITEMS = ['Beans', 'Milk', 'Rice'];

const lotsArb = fc.uniqueArray(
  fc.record({
    _id: fc.hexaString({ minLength: 6, maxLength: 6 }),
    category: fc.constantFrom(...CATS),
    itemName: fc.constantFrom(...ITEMS),
    quantity: fc.integer({ min: 0, max: 30 }),
    status: fc.constantFrom(...LOT_STATUSES),
    expiresOn: fc.option(fc.date({ min: new Date('2026-01-01'), max: new Date('2026-03-01') }), { nil: null }),
    receivedAt: fc.option(fc.date({ min: new Date('2025-10-01'), max: new Date('2026-01-01') }), { nil: null }),
  }),
  { selector: (l) => l._id, maxLength: 25 }
);
const requestArb = fc.array(
  fc.oneof(
    fc.record({ category: fc.constantFrom(...CATS), quantity: fc.integer({ min: 1, max: 60 }) }),
    fc.record({ itemName: fc.constantFrom(...ITEMS, 'beans', 'MILK'), quantity: fc.integer({ min: 1, max: 60 }) })
  ),
  { maxLength: 6 }
);

const eligible = (l) => l.quantity > 0 && !UNPICKABLE.includes(l.status);
const t = (d) => (d ? new Date(d).getTime() : Infinity);
const expiresBefore = (a, b) => t(a.expiresOn) < t(b.expiresOn);

describe('Property P3: FEFO plan is valid and earliest-first', () => {
  test('never over-draws, never uses ineligible lots, plans min(requested, available), earliest first', () => {
    fc.assert(fc.property(lotsArb, requestArb, (lots, request) => {
      const byId = new Map(lots.map((l) => [l._id, l]));
      const { lines, shortfalls } = planFefo(request, lots);

      // 1. capacity, eligibility and matching
      const taken = new Map();
      for (const line of lines) {
        const lot = byId.get(line.lotId);
        expect(lot).toBeDefined();
        expect(eligible(lot)).toBe(true);
        expect(matches(request[line.ask], lot)).toBe(true);
        expect(line.quantity).toBeGreaterThan(0);
        taken.set(line.lotId, (taken.get(line.lotId) ?? 0) + line.quantity);
      }
      for (const [id, q] of taken) expect(q).toBeLessThanOrEqual(byId.get(id).quantity);

      // 2. per item: planned = min(requested, available at its turn); shortfall = the rest
      const left = new Map(lots.map((l) => [l._id, eligible(l) ? l.quantity : 0]));
      request.forEach((item, ask) => {
        const available = lots.filter((l) => matches(item, l)).reduce((s, l) => s + left.get(l._id), 0);
        const mine = lines.filter((l) => l.ask === ask);
        const planned = mine.reduce((s, l) => s + l.quantity, 0);
        expect(planned).toBe(Math.min(item.quantity, available));
        const sf = shortfalls.find((s) => s.ask === item);
        expect(sf?.missing ?? 0).toBe(item.quantity - planned);

        // 3. earliest first: no matching lot with an earlier expiry still holds stock
        //    while a later-expiring lot was used for this item
        for (const line of mine) left.set(line.lotId, left.get(line.lotId) - line.quantity);
        for (const used of mine.map((l) => byId.get(l.lotId))) {
          for (const other of lots) {
            if (other._id === used._id || !matches(item, other) || left.get(other._id) <= 0) continue;
            expect(expiresBefore(other, used)).toBe(false);
          }
        }
      });
    }), { numRuns: 200 });
  });
});

describe('planFefo examples', () => {
  const lots = [
    { _id: 'late', category: 'Dairy', itemName: 'Milk', quantity: 10, status: 'Fresh', expiresOn: '2026-11-20' },
    { _id: 'soon', category: 'Dairy', itemName: 'Milk', quantity: 3, status: 'ExpiringSoon', expiresOn: '2026-11-06' },
    { _id: 'gone', category: 'Dairy', itemName: 'Milk', quantity: 9, status: 'Expired', expiresOn: '2026-11-01' },
    { _id: 'none', category: 'Dairy', itemName: 'Milk', quantity: 9, status: 'Fresh', expiresOn: null },
  ];

  test('uses the soonest non-expired lot first and lots without expiry last', () => {
    expect(planFefo([{ category: 'Dairy', quantity: 20 }], lots)).toEqual({
      lines: [{ lotId: 'soon', quantity: 3, ask: 0 }, { lotId: 'late', quantity: 10, ask: 0 }, { lotId: 'none', quantity: 7, ask: 0 }],
      shortfalls: [],
    });
  });

  test('two items sharing a lot never over-draw it; the rest is a shortfall', () => {
    const plan = planFefo([{ category: 'Dairy', quantity: 15 }, { itemName: 'milk', quantity: 10 }], lots);
    expect(plan.lines.reduce((s, l) => s + l.quantity, 0)).toBe(22);
    expect(plan.shortfalls).toEqual([{ ask: { itemName: 'milk', quantity: 10 }, missing: 3 }]);
  });
});
