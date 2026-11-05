/**
 * Normalises a value for comparison/serialisation: Dates → ISO, ObjectIds/populated refs → id string.
 */
export function normalise(v) {
  if (v === undefined || v === null || v === '') return null;
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.map(normalise);
  if (typeof v === 'object') {
    if (v._bsontype === 'ObjectId' || v._bsontype === 'ObjectID') return String(v);
    if (v._id !== undefined) return String(v._id);
    return JSON.parse(JSON.stringify(v));
  }
  return v;
}

/**
 * Field-level diff over DECLARED, NON-SECRET fields only (Req 6.1).
 * @param {object|null} before
 * @param {object|null} after
 * @param {{ fields: Record<string, { secret?: boolean }> }} def
 * @returns {Record<string, [any, any]>} { field: [old, new] } for changed fields
 */
export function diff(before, after, def) {
  const out = {};
  for (const [name, spec] of Object.entries(def.fields)) {
    if (spec.secret) continue;
    const a = normalise(before?.[name]);
    const b = normalise(after?.[name]);
    if (JSON.stringify(a) !== JSON.stringify(b)) out[name] = [a, b];
  }
  return out;
}
