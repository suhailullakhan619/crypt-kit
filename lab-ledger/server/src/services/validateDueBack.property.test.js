// Property L2: Due-Back Validation
// Validates: Requirements 3.2
import fc from 'fast-check';
import { validateDueBack, MAX_LOAN_DAYS } from './checkoutService.js';

const DAY = 86400000;
const LIMIT = MAX_LOAN_DAYS * DAY;
// Dates 2000…2100, so `now ± 60 days` stays valid.
const instant = fc.integer({ min: Date.UTC(2000, 0, 1), max: Date.UTC(2100, 0, 1) });

const accepts = (dueBack, now) => {
  try {
    validateDueBack(dueBack, now);
    return true;
  } catch (err) {
    expect(err.status).toBe(400);
    return false;
  }
};

test('L2: accepted iff now < dueBack ≤ now + 30 days (any offset)', () => {
  fc.assert(
    fc.property(instant, fc.integer({ min: -60 * DAY, max: 60 * DAY }), (nowMs, offset) => {
      const now = new Date(nowMs);
      const due = new Date(nowMs + offset);
      expect(accepts(due, now)).toBe(offset > 0 && offset <= LIMIT);
    }),
    { numRuns: 500 }
  );
});

test('L2: boundaries — exactly now and exactly now + 30d + 1ms are rejected, now + 30d is accepted', () => {
  fc.assert(
    fc.property(instant, (nowMs) => {
      const now = new Date(nowMs);
      expect(accepts(new Date(nowMs), now)).toBe(false);
      expect(accepts(new Date(nowMs + 1), now)).toBe(true);
      expect(accepts(new Date(nowMs + LIMIT), now)).toBe(true);
      expect(accepts(new Date(nowMs + LIMIT + 1), now)).toBe(false);
    }),
    { numRuns: 100 }
  );
});

test('L2: ISO strings behave like the Date they encode', () => {
  fc.assert(
    fc.property(instant, fc.integer({ min: -40 * DAY, max: 40 * DAY }), (nowMs, offset) => {
      const now = new Date(nowMs);
      const iso = new Date(nowMs + offset).toISOString();
      expect(accepts(iso, now)).toBe(accepts(new Date(iso), now));
    }),
    { numRuns: 200 }
  );
});

test('L2: garbage is a 400, never accepted', () => {
  const now = new Date('2026-11-05T10:00:00Z');
  fc.assert(
    fc.property(
      fc.oneof(fc.constant(undefined), fc.constant(null), fc.constant(''), fc.boolean(), fc.object(), fc.string().filter((s) => Number.isNaN(new Date(s).getTime()))),
      (junk) => {
        expect(accepts(junk, now)).toBe(false);
      }
    ),
    { numRuns: 100 }
  );
});
