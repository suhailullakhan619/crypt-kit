/**
 * Field Spec types and the flags each accepts (design § Field Spec Types).
 */
const COMMON = ['type', 'label', 'help', 'placeholder', 'required', 'list', 'filter', 'hidden', 'secret', 'default', 'formHidden'];

export const FIELD_TYPES = Object.freeze({
  string:  [...COMMON, 'min', 'max', 'unique', 'search'],
  text:    [...COMMON, 'max', 'search'],
  number:  [...COMMON, 'min', 'max'],
  boolean: [...COMMON],
  date:    [...COMMON, 'time'],
  enum:    [...COMMON, 'values', 'multiple'],
  ref:     [...COMMON, 'ref'],
});

/** Field names that the skeleton manages itself and apps may not declare. */
export const RESERVED_FIELDS = Object.freeze(['_id', '__v', 'id', 'createdBy', 'createdAt', 'updatedAt']);

export const KEY_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
export const FIELD_NAME_RE = /^[a-zA-Z][a-zA-Z0-9]*$/;
export const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/;

/** 'stock-lots' → 'StockLots' */
export function pascalCase(key) {
  return key
    .split('-')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join('');
}

/**
 * Resolves a ref target to a Mongoose model name.
 * Lowercase kebab targets are resource keys ('labs' → 'Labs'); anything else is a model name ('User').
 */
export function refModelName(ref) {
  return KEY_RE.test(ref) ? pascalCase(ref) : ref;
}

/** True when a ref target names another resource (vs. a core model like 'User'). */
export function isResourceRef(ref) {
  return KEY_RE.test(ref);
}
