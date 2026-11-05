/**
 * fast-check generators for Resource Definitions, shared by property tests.
 */
import fc from 'fast-check';
import config from '../../crypt.config.js';
import { RESERVED_FIELDS } from '../../src/core/fieldTypes.js';

export const ROLES = config.roles;

const fieldName = fc
  .stringMatching(/^[a-z][a-zA-Z0-9]{1,10}$/)
  .filter((n) => !RESERVED_FIELDS.includes(n) && !['status', 'dueAt', 'deletedAt'].includes(n));

const enumValues = fc.uniqueArray(fc.stringMatching(/^[A-Z][a-z]{1,8}$/), { minLength: 2, maxLength: 5 });

const scalarSpec = fc.oneof(
  fc.record({ type: fc.constant('string'), list: fc.boolean(), filter: fc.boolean(), search: fc.boolean() }),
  fc.record({ type: fc.constant('text'), search: fc.boolean() }),
  fc.record({ type: fc.constant('number'), list: fc.boolean(), filter: fc.boolean() }),
  fc.record({ type: fc.constant('boolean'), filter: fc.boolean() }),
  fc.record({ type: fc.constant('date'), list: fc.boolean() }),
  enumValues.chain((values) => fc.record({ type: fc.constant('enum'), values: fc.constant(values), filter: fc.boolean(), list: fc.boolean() })),
  fc.record({ type: fc.constant('ref'), ref: fc.constant('User'), filter: fc.boolean() }),
);

const rolesSubset = fc.subarray(ROLES);

/** A valid definition with a `status` enum, a `dueAt` date, status flow, due rule and soft delete. */
export const validDefinition = fc
  .record({
    key: fc.stringMatching(/^[a-z]{2,8}(-[a-z]{2,6})?$/),
    label: fc.stringMatching(/^[A-Z][a-z]{2,10}$/),
    extra: fc.dictionary(fieldName, scalarSpec, { minKeys: 1, maxKeys: 5 }),
    statusValues: fc.uniqueArray(fc.stringMatching(/^[A-Z][a-z]{2,8}$/), { minLength: 3, maxLength: 6 }),
    perms: fc.record({ read: rolesSubset, create: rolesSubset, update: rolesSubset, delete: rolesSubset }),
    secretField: fc.boolean(),
  })
  .chain(({ statusValues, ...rest }) =>
    fc
      .record({
        transitions: fc.constant(statusValues).chain((vals) =>
          fc.tuple(...vals.map(() => fc.subarray(vals))).map((targets) =>
            Object.fromEntries(vals.map((v, i) => [v, targets[i].filter((t) => t !== v)]))
          )
        ),
        workflowOnly: fc.subarray(statusValues.slice(1), { maxLength: 1 }),
      })
      .map(({ transitions, workflowOnly }) => {
        const [first, ...others] = statusValues;
        const deletedValue = others[others.length - 1];
        const overdueValue = others[0];
        const fields = {
          ...rest.extra,
          status: { type: 'enum', values: statusValues, default: first, list: true, filter: true },
          dueAt: { type: 'date' },
        };
        if (rest.secretField) fields.secretCode = { type: 'string', secret: true };
        return {
          key: rest.key,
          label: rest.label,
          fields,
          permissions: rest.perms,
          statusFlow: { field: 'status', transitions, workflowOnly },
          due: { field: 'dueAt', status: 'status', from: [first], to: overdueValue },
          softDelete: { field: 'status', value: deletedValue, at: 'deletedAt' },
        };
      })
  );

/**
 * Exactly-one-mutation generator for Property 2: yields [label, mutatedDef].
 */
export const invalidDefinition = fc.tuple(validDefinition, fc.integer({ min: 0, max: 9 })).map(([d, n]) => {
  const def = structuredClone(d);
  const anyField = Object.keys(def.fields)[0];
  switch (n) {
    case 0: return ['bad key', { ...def, key: 'Bad Key!' }];
    case 1: def.fields[anyField] = { type: 'spectral' }; return ['unknown type', def];
    case 2: def.fields.mood = { type: 'enum' }; return ['enum without values', def];
    case 3: def.fields.haunt = { type: 'ref' }; return ['ref without target', def];
    case 4: def.permissions.read = [...def.permissions.read, 'Vampire']; return ['unknown role', def];
    case 5: def.statusFlow.field = 'missingField'; return ['statusFlow missing field', def];
    case 6: def.statusFlow.transitions[def.fields.status.values[0]] = ['NotAValue']; return ['statusFlow unknown value', def];
    case 7: def.due.to = 'NotAValue'; return ['due unknown value', def];
    case 8: def.due.field = 'status'; return ['due field not a date', def];
    default: def.statusFlow.workflowOnly = ['Phantom']; return ['workflowOnly unknown value', def];
  }
});
