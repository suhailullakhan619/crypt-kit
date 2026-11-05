// Property P4: Expiry Classification Is Total and Monotonic
// Validates: Requirements 3.1
import fc from 'fast-check';
import { classifyExpiry } from './classifyExpiry.js';
import { CATEGORIES, EXPIRY_WINDOWS, LOT_STATUSES } from './expiryWindows.js';

const DAY = 86400000;
const RANK = { Fresh: 0, ExpiringSoon: 1, Expired: 2 };

const lotArb = fc.record({
  category: fc.oneof(fc.constantFrom(...CATEGORIES), fc.string()),
  quantity: fc.oneof(fc.integer({ min: -5, max: 500 }), fc.double({ noNaN: false }), fc.constant(undefined)),
  expiresOn: fc.oneof(fc.date({ min: new Date('2020-01-01'), max: new Date('2035-12-31') }), fc.constant(null), fc.constant('not a date')),
  status: fc.oneof(fc.constantFrom(...LOT_STATUSES), fc.constant(undefined)),
}, { requiredKeys: [] });

const nowArb = fc.date({ min: new Date('2024-01-01'), max: new Date('2032-12-31') });

describe('Property P4: expiry classification is total and monotonic', () => {
  test('any lot and any now → exactly one known status', () => {
    fc.assert(fc.property(lotArb, nowArb, (lot, now) => {
      expect(LOT_STATUSES).toContain(classifyExpiry(lot, now));
    }), { numRuns: 100 });
  });

  test('as now advances (quantity fixed) the status never moves backwards Fresh → ExpiringSoon → Expired', () => {
    fc.assert(fc.property(
      fc.constantFrom(...CATEGORIES),
      fc.integer({ min: 1, max: 500 }),
      fc.date({ min: new Date('2025-01-01'), max: new Date('2030-12-31') }),
      nowArb,
      fc.array(fc.integer({ min: 0, max: 40 * DAY }), { minLength: 1, maxLength: 12 }),
      (category, quantity, expiresOn, start, steps) => {
        const lot = { category, quantity, expiresOn, status: 'Fresh' };
        let t = start.getTime();
        let prev = RANK[classifyExpiry(lot, new Date(t))];
        for (const s of steps) {
          t += s;
          const cur = RANK[classifyExpiry(lot, new Date(t))];
          expect(cur).toBeGreaterThanOrEqual(prev);
          prev = cur;
        }
      }
    ), { numRuns: 100 });
  });

  test('ExpiringSoon exactly within the category window (inclusive), Expired from the next day', () => {
    fc.assert(fc.property(fc.constantFrom(...CATEGORIES), fc.integer({ min: -3, max: 40 }), nowArb, (category, offset, now) => {
      const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
      const lot = { category, quantity: 3, expiresOn: new Date(today + offset * DAY + 15 * 3600000) };
      const expected = offset < 0 ? 'Expired' : offset <= EXPIRY_WINDOWS[category] ? 'ExpiringSoon' : 'Fresh';
      expect(classifyExpiry(lot, now)).toBe(expected);
    }), { numRuns: 100 });
  });
});

describe('classifyExpiry examples', () => {
  const now = new Date('2026-11-05T21:30:00Z');
  test.each([
    [{ status: 'Discarded', quantity: 0, category: 'Dairy' }, 'Discarded'],
    [{ quantity: 0, category: 'Dairy', expiresOn: '2020-01-01' }, 'Depleted'],
    [{ quantity: 4, category: 'Hygiene' }, 'Fresh'],
    [{ quantity: 4, category: 'Hygiene', expiresOn: '2026-11-05' }, 'ExpiringSoon'],
    [{ quantity: 4, category: 'Dairy', expiresOn: '2026-11-04' }, 'Expired'],
    [{ quantity: 4, category: 'Dairy', expiresOn: '2026-11-08' }, 'ExpiringSoon'],
    [{ quantity: 4, category: 'Dairy', expiresOn: '2026-11-09' }, 'Fresh'],
    [{ quantity: 4, category: 'Canned', expiresOn: '2026-12-05' }, 'ExpiringSoon'],
  ])('%j → %s', (lot, status) => {
    expect(classifyExpiry(lot, now)).toBe(status);
  });
});
