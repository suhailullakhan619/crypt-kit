// Property P5: Intake Parser Round Trip
// Validates: Requirements 4.1, 4.2, 4.3, 4.4
import fc from 'fast-check';
import { parseIntake } from './parseIntake.js';
import { intakeSentenceArb, nowArb, DONORS } from '../../test/generators/intake.js';

describe('Property P5: intake parser round trip', () => {
  test('quantity, unit, category, expiry date and donor survive any sentence template', () => {
    fc.assert(
      fc.property(intakeSentenceArb, nowArb, ({ text, expected }, now) => {
        const draft = parseIntake(text, { donors: DONORS, now });
        expect({
          quantity: draft.quantity,
          unit: draft.unit,
          category: draft.category,
          expiresOn: draft.expiresOn?.toISOString().slice(0, 10),
          donorId: draft.donorId,
        }).toEqual({
          quantity: expected.quantity,
          unit: expected.unit,
          category: expected.category,
          expiresOn: expected.expiresOn(now).toISOString().slice(0, 10),
          donorId: expected.donorId,
        });
        expect(draft.missing).toEqual([]);
        expect(draft.confidence).toBe(1);
      }),
      { numRuns: 300 }
    );
  });
});
