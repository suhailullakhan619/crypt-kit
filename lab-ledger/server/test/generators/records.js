import fc from 'fast-check';

const DAY = 86400000;
const BASE = Date.UTC(2026, 0, 1);

/** Arbitrary for one field value according to its Field Spec (always valid). */
export function valueArb(spec, { refIds = [] } = {}) {
  switch (spec.type) {
    case 'string':
      return fc.stringMatching(/^[A-Za-z][A-Za-z0-9 ]{0,20}[A-Za-z0-9]$/).filter((s) => s.length <= (spec.max ?? 60));
    case 'text':
      return fc.string({ maxLength: 80 });
    case 'number':
      return fc.integer({ min: spec.min ?? -1000, max: spec.max ?? 1000 });
    case 'boolean':
      return fc.boolean();
    case 'date':
      return fc.integer({ min: 0, max: 365 }).map((d) => new Date(BASE + d * DAY));
    case 'enum':
      return spec.multiple ? fc.subarray(spec.values) : fc.constantFrom(...spec.values);
    case 'ref':
      return refIds.length ? fc.constantFrom(...refIds) : fc.constant(null);
    default:
      return fc.constant(null);
  }
}

/**
 * Arbitrary for a full valid record of a definition. Required fields are always present,
 * optional fields sometimes. `exclude` drops fields (e.g. status when the test sets it).
 */
export function recordArb(def, { refIds = [], exclude = [] } = {}) {
  const shape = {};
  const required = [];
  for (const [name, spec] of Object.entries(def.fields)) {
    if (exclude.includes(name)) continue;
    shape[name] = valueArb(spec, { refIds });
    if (spec.required) required.push(name);
  }
  return fc.record(shape, { requiredKeys: required });
}
