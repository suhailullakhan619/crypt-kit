// Property 5: Sanitize Never Stores Undeclared or System Fields
// Validates: Requirements 5.4
import fc from 'fast-check';
import { sanitize, buildFilter } from './resourceService.js';
import { validDefinition } from '../../test/generators/definition.js';

const SYSTEM = ['_id', 'createdBy', 'createdAt', 'updatedAt', '__v', 'id', '__proto__', 'constructor'];

const inputArb = (def) =>
  fc.dictionary(
    fc.oneof(fc.constantFrom(...Object.keys(def.fields), ...SYSTEM, 'deletedAt', 'role'), fc.string()),
    fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.constant(null), fc.object())
  );

describe('Property 5: sanitize', () => {
  test('output keys ⊆ declared fields and never include system fields', () => {
    fc.assert(
      fc.property(validDefinition.chain((def) => fc.tuple(fc.constant(def), inputArb(def))), ([def, input]) => {
        const out = sanitize(def, input);
        const declared = Object.keys(def.fields);
        for (const k of Object.keys(out)) {
          expect(declared).toContain(k);
          expect(SYSTEM).not.toContain(k);
        }
      }),
      { numRuns: 300 }
    );
  });

  test('non-object input yields {}', () => {
    fc.assert(
      fc.property(validDefinition, fc.oneof(fc.string(), fc.integer(), fc.constant(null), fc.array(fc.anything())), (def, input) => {
        expect(sanitize(def, input)).toEqual({});
      })
    );
  });

  test('filter values that are objects (operator injection) are rejected with 400', () => {
    const def = { fields: { name: { type: 'string', filter: true } } };
    expect(() => buildFilter(def, { name: { $gt: '' } })).toThrow(expect.objectContaining({ status: 400 }));
    expect(() => buildFilter(def, { name: ['a', 'b'] })).toThrow(expect.objectContaining({ status: 400 }));
  });

  test('search input is regex-escaped', () => {
    const def = { fields: { name: { type: 'string', search: true } } };
    const f = buildFilter(def, { q: '(a+)+$' });
    expect(f.$or[0].name.$regex).toBe('\\(a\\+\\)\\+\\$');
  });
});
