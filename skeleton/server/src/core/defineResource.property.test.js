// Property 2: Invalid Resource Definitions Are Always Rejected
// Validates: Requirements 4.3, 4.4
import fc from 'fast-check';
import { validateDefinition, defineResource } from './defineResource.js';
import { createRegistry } from './registry.js';
import { validDefinition, invalidDefinition, ROLES } from '../../test/generators/definition.js';
import notes from '../resources/notes.js';

describe('Property 2: definition validation', () => {
  test('every generated valid definition passes', () => {
    fc.assert(
      fc.property(validDefinition, (def) => {
        expect(validateDefinition(def, ROLES)).toEqual([]);
      }),
      { numRuns: 200 }
    );
  });

  test('every single mutation is rejected with an error naming the resource', () => {
    fc.assert(
      fc.property(invalidDefinition, ([label, def]) => {
        const errors = validateDefinition(def, ROLES);
        expect(errors.length).toBeGreaterThan(0);
        const name = typeof def.key === 'string' ? def.key : '<unknown>';
        for (const e of errors) expect(e).toContain(`Resource "${name}"`);
        return label.length > 0;
      }),
      { numRuns: 300 }
    );
  });

  test('defineResource throws listing problems', () => {
    expect(() => defineResource({ key: 'x', label: 'X', fields: { a: { type: 'nope' } }, permissions: {} }))
      .toThrow(/unknown type "nope"/);
  });

  test('typoed flags are caught', () => {
    const errs = validateDefinition({ key: 'x', label: 'X', fields: { a: { type: 'string', serach: true } }, permissions: {} }, ROLES);
    expect(errs.join()).toMatch(/does not support "serach"/);
  });

  test('the shipped notes example is valid and builds a model', () => {
    expect(notes.key).toBe('notes');
    expect(notes.model.modelName).toBe('Notes');
    expect(notes.model.schema.path('createdBy')).toBeDefined();
    expect(notes.model.schema.path('archivedAt')).toBeDefined();
  });

  test('registry rejects duplicate keys and dangling refs (Req 4.5)', () => {
    expect(() => createRegistry([notes, notes])).toThrow(/Duplicate resource key "notes"/);
    const dangling = { key: 'a', def: { fields: { b: { type: 'ref', ref: 'ghosts' } } } };
    expect(() => createRegistry([dangling])).toThrow(/unknown resource "ghosts"/);
  });
});
