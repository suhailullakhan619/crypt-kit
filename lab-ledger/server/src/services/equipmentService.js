import equipment, { normaliseTag } from '../resources/equipment.js';
import checkouts, { OUT_STATUSES } from '../resources/checkouts.js';
import { getContext } from '../context.js';
import { renderLabels } from './labelService.js';
import { isStaff } from './checkoutService.js';
import { httpError } from '../utils/httpError.js';
import { OBJECT_ID_RE } from '../core/fieldTypes.js';

export const MAX_LABELS = 60;

/**
 * Scan lookup (lab-ledger Req 5.3, 5.4): the item for an asset tag, the active checkout (borrower by
 * name only) and pending requests — all of them for staff, only the caller's own for Students.
 * @param {string} tag - case-insensitive asset tag
 * @param {{ userId: string, role: string }} user
 * @returns {Promise<{ item: object, activeCheckout: object|null, pendingRequests: object[] }>}
 * @throws {Error} 404 "No equipment haunts this tag"
 */
export async function byTag(tag, user) {
  const assetTag = normaliseTag(tag);
  if (!assetTag || assetTag.length > 32) throw httpError(404, 'No equipment haunts this tag');
  const item = await equipment.model.findOne({ assetTag }).populate({ path: 'lab', select: 'name building room' }).lean();
  if (!item) throw httpError(404, 'No equipment haunts this tag');

  const pendingFilter = { equipment: item._id, status: 'Requested', ...(isStaff(user) ? {} : { borrower: user.userId }) };
  const [active, pending] = await Promise.all([
    checkouts.model.findOne({ equipment: item._id, status: { $in: OUT_STATUSES } })
      .select('status dueBack checkedOutAt borrower').populate({ path: 'borrower', select: 'name' }).lean(),
    checkouts.model.find(pendingFilter).sort({ createdAt: 1 }).limit(10)
      .select('status dueBack purpose borrower createdAt').populate({ path: 'borrower', select: 'name' }).lean(),
  ]);
  return { item, activeCheckout: active, pendingRequests: pending };
}

/**
 * Printable QR label sheets for up to 60 items, in the order given (lab-ledger Req 5.1).
 * @param {unknown} ids
 * @returns {Promise<{ buffer: Buffer, count: number }>}
 * @throws {Error} 400 bad ids (empty, > 60, malformed), 404 unknown items
 */
export async function labels(ids) {
  if (!Array.isArray(ids) || ids.length === 0) throw httpError(400, 'ids must be a non-empty array');
  if (ids.length > MAX_LABELS) throw httpError(400, `At most ${MAX_LABELS} labels per sheet run`);
  if (!ids.every((id) => typeof id === 'string' && OBJECT_ID_RE.test(id))) throw httpError(400, 'ids must be equipment ids');
  const unique = [...new Set(ids)];
  const docs = await equipment.model.find({ _id: { $in: unique } }).select('name assetTag lab').populate({ path: 'lab', select: 'name' }).lean();
  if (docs.length !== unique.length) throw httpError(404, `${unique.length - docs.length} equipment item(s) not found`);
  const byId = new Map(docs.map((d) => [String(d._id), d]));
  const { env, config } = getContext();
  const buffer = await renderLabels(unique.map((id) => byId.get(id)), { baseUrl: env.CLIENT_URL, appName: config.appName });
  return { buffer, count: unique.length };
}
