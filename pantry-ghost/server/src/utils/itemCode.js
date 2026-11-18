/**
 * Short, human-readable item IDs such as `SL-0001` or `N-0042`: easy to type into "Scan or find",
 * printed under QR codes, and stable for the life of the record.
 */

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const formatCode = (prefix, n) => `${prefix}-${String(n).padStart(4, '0')}`;

/** Highest number already used for `prefix` (numeric, so SL-10000 sorts after SL-9999). */
export async function maxCodeNumber(model, field, prefix, session) {
  const [row] = await model.aggregate([
    { $match: { [field]: { $regex: `^${esc(prefix)}-\\d{4,}$` } } },
    { $project: { n: { $toInt: { $substrCP: [`$${field}`, prefix.length + 1, 20] } } } },
    { $sort: { n: -1 } },
    { $limit: 1 },
  ]).session(session ?? null);
  return row?.n ?? 0;
}

/** Next free ID for a new record. Call inside the create transaction (pass its session). */
export async function nextCode(model, field, prefix, session) {
  return formatCode(prefix, (await maxCodeNumber(model, field, prefix, session)) + 1);
}

/**
 * Gives an ID to every record that has none yet (oldest first), e.g. data created before IDs existed
 * or inserted directly by the seed. Never changes an existing ID.
 * @returns {Promise<number>} how many records got an ID
 */
export async function backfillCodes(model, field, prefix) {
  const missing = await model.find({ $or: [{ [field]: { $exists: false } }, { [field]: null }, { [field]: '' }] })
    .sort({ createdAt: 1, _id: 1 }).select({ _id: 1 }).lean();
  if (!missing.length) return 0;
  let n = await maxCodeNumber(model, field, prefix);
  const ops = missing.map((d) => {
    n += 1;
    return { updateOne: { filter: { _id: d._id, $or: [{ [field]: { $exists: false } }, { [field]: null }, { [field]: '' }] }, update: { $set: { [field]: formatCode(prefix, n) } } } };
  });
  const res = await model.bulkWrite(ops, { ordered: true });
  return res.modifiedCount;
}
