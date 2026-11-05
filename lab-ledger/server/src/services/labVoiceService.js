import equipment, { normaliseTag } from '../resources/equipment.js';
import checkouts, { OUT_STATUSES } from '../resources/checkouts.js';
import { fuzzyMatch } from '../utils/fuzzyMatch.js';
import { endOfMonthUtc, shortDate } from '../utils/dates.js';
import { isStaff } from './checkoutService.js';

/** Up to this many items are named when several match (lab-ledger Req 6.2). */
export const MAX_LISTED = 3;
const TAG_RE = /^[A-Z]{1,5}-?\d{1,6}$/;

const slim = (e) => ({ _id: e._id, name: e.name, assetTag: e.assetTag, status: e.status, lab: e.lab?.name ?? null });

/** "Physics B-12" or "its lab" when unknown. */
export const labName = (item) => item.lab ?? 'its lab';

/** 'CalibrationDue' → 'calibration due' */
export const spoken = (status) => String(status).replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();

/** "LL-0042, LL-0043 and LL-0051" */
export function listTags(items) {
  const tags = items.slice(0, MAX_LISTED).map((i) => i.assetTag);
  return tags.length <= 1 ? tags.join('') : `${tags.slice(0, -1).join(', ')} and ${tags[tags.length - 1]}`;
}

/**
 * Finds equipment by spoken name (fuzzy, Req 6.2) or by asset tag (exact). Retired items are ignored.
 * @param {string} query
 * @returns {Promise<Array<{ _id: any, name: string, assetTag: string, status: string, lab: string|null }>>} best first
 */
export async function findEquipment(query) {
  const asTag = normaliseTag(query).replace(/\s+/g, '-');
  if (TAG_RE.test(asTag)) {
    const exact = await equipment.model.findOne({ assetTag: asTag, status: { $ne: 'Retired' } }).populate({ path: 'lab', select: 'name' }).lean();
    if (exact) return [slim(exact)];
  }
  const all = await equipment.model.find({ status: { $ne: 'Retired' } }).select('name assetTag status lab').populate({ path: 'lab', select: 'name' }).lean();
  return fuzzyMatch(query, all, { key: (e) => e.name }).map(slim);
}

/**
 * WHO_HAS / IS_AVAILABLE data: matches plus, for a single match, its out-on-loan checkout.
 * @param {string} query
 * @param {{ timeZone?: string }} [opts]
 */
export async function lookup(query, { timeZone = 'UTC' } = {}) {
  const matches = await findEquipment(query);
  let checkout = null;
  if (matches.length === 1) {
    const co = await checkouts.model.findOne({ equipment: matches[0]._id, status: { $in: OUT_STATUSES } })
      .select('status dueBack borrower').populate({ path: 'borrower', select: 'name' }).lean();
    if (co) checkout = { status: co.status, dueBack: co.dueBack, due: shortDate(co.dueBack, timeZone), borrower: co.borrower?.name ?? 'Someone' };
  }
  return { query, matches: matches.slice(0, 10), total: matches.length, checkout };
}

/**
 * CALIBRATION_DUE data: items needing calibration by the end of this month, or already flagged.
 * @param {Date} now
 * @param {{ timeZone?: string }} [opts]
 */
export async function calibrationDue(now, { timeZone = 'UTC' } = {}) {
  const end = endOfMonthUtc(now);
  const filter = {
    status: { $ne: 'Retired' },
    $or: [{ status: 'CalibrationDue' }, { requiresCalibration: true, nextCalibration: { $ne: null, $lte: end } }],
  };
  const [count, items] = await Promise.all([
    equipment.model.countDocuments(filter),
    equipment.model.find(filter).sort({ nextCalibration: 1, assetTag: 1 }).limit(10).select('name assetTag status nextCalibration lab').populate({ path: 'lab', select: 'name' }).lean(),
  ]);
  return {
    count,
    by: shortDate(end, timeZone),
    items: items.map((e) => ({
      ...slim(e),
      nextCalibration: e.nextCalibration ?? null,
      due: e.nextCalibration ? shortDate(e.nextCalibration, timeZone) : null,
      late: e.status === 'CalibrationDue' || (e.nextCalibration && e.nextCalibration < now),
    })),
  };
}

/**
 * OVERDUE_RETURNS data. Borrower names only for staff; Students get the count (design § Voice Intents).
 * @param {{ role: string }} user
 * @param {{ timeZone?: string }} [opts]
 */
export async function overdueReturns(user, { timeZone = 'UTC' } = {}) {
  const filter = { status: 'Overdue' };
  const [count, rows] = await Promise.all([
    checkouts.model.countDocuments(filter),
    checkouts.model.find(filter).sort({ dueBack: 1 }).limit(10)
      .populate({ path: 'equipment', select: 'name assetTag' }).populate({ path: 'borrower', select: 'name' }).lean(),
  ]);
  const staff = isStaff(user);
  return {
    count,
    detailed: staff,
    items: staff
      ? rows.map((c) => ({ _id: c._id, name: c.equipment?.name, assetTag: c.equipment?.assetTag, borrower: c.borrower?.name ?? 'Someone', due: shortDate(c.dueBack, timeZone), dueBack: c.dueBack }))
      : [],
  };
}
