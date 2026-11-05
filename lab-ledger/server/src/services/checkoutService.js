import mongoose from 'mongoose';
import equipment, { CONDITIONS } from '../resources/equipment.js';
import checkouts, { OUT_STATUSES } from '../resources/checkouts.js';
import * as activity from './activityService.js';
import { changeEntries } from './labActivity.js';
import { httpError } from '../utils/httpError.js';
import { withTransaction } from '../utils/transaction.js';
import { paginate, envelope } from '../utils/pagination.js';
import { DAY } from '../utils/dates.js';
import { OBJECT_ID_RE } from '../core/fieldTypes.js';

export const MAX_LOAN_DAYS = 30;
/** Roles that approve, reject and receive returns (LabManager is also the superuser). */
export const STAFF_ROLES = Object.freeze(['LabManager', 'Technician']);
export const isStaff = (user) => STAFF_ROLES.includes(user?.role);

const Equipment = () => equipment.model;
const Checkout = () => checkouts.model;

// ── Pure ──────────────────────────────────────────────────────────────────────

/**
 * Pure due-back rule (lab-ledger Req 3.2): accepted iff `now < dueBack ≤ now + 30 days`.
 * @param {Date|string|number} dueBack
 * @param {Date} now
 * @returns {Date} the parsed due-back date
 * @throws {Error} 400 when missing, unparseable, not in the future or more than 30 days ahead
 */
export function validateDueBack(dueBack, now) {
  const valid = (typeof dueBack === 'string' && dueBack.trim() !== '') || typeof dueBack === 'number' || dueBack instanceof Date;
  const d = valid ? new Date(dueBack) : null;
  if (!d || Number.isNaN(d.getTime())) {
    throw httpError(400, 'dueBack must be a date', { fields: { dueBack: 'Pick a due-back date' } });
  }
  if (d.getTime() <= now.getTime()) {
    throw httpError(400, 'dueBack must be in the future', { fields: { dueBack: 'Must be in the future' } });
  }
  if (d.getTime() > now.getTime() + MAX_LOAN_DAYS * DAY) {
    throw httpError(400, `dueBack must be within ${MAX_LOAN_DAYS} days`, { fields: { dueBack: `At most ${MAX_LOAN_DAYS} days ahead` } });
  }
  return d;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function assertId(id, what = 'Checkout') {
  if (typeof id !== 'string' || !OBJECT_ID_RE.test(id)) throw httpError(404, `${what} not found`);
}

const POPULATE = [
  { path: 'equipment', select: 'name assetTag status lab', populate: { path: 'lab', select: 'name' } },
  { path: 'borrower', select: 'name' },
  { path: 'approvedBy', select: 'name' },
  { path: 'receivedBy', select: 'name' },
];

/** One checkout with refs populated (borrower and staff by name only). */
export async function getCheckout(id) {
  const doc = await Checkout().findById(id).populate(POPULATE).lean();
  if (!doc) throw httpError(404, 'Checkout not found');
  return doc;
}

/** Equipment-side Activity Log entry for a checkout event that does not change the item's status. */
const equipmentNote = (actor, equipmentId, from, to) => ({
  actor, resource: equipment.key, recordId: equipmentId, action: 'update', diff: { checkout: [from, to] },
});

/** Mongo duplicate key on the partial unique index → the item is already out (Req 3.4). */
async function guarded(fn) {
  try {
    return await withTransaction(fn);
  } catch (err) {
    if (err?.code === 11000) throw httpError(409, 'Equipment already has an active checkout');
    throw err;
  }
}

/** Loads a checkout inside the transaction and checks its status. */
async function loadFor(id, session, allowed, verb) {
  const co = await Checkout().findById(id).session(session);
  if (!co) throw httpError(404, 'Checkout not found');
  if (!allowed.includes(co.status)) throw httpError(409, `Cannot ${verb} a checkout that is ${co.status}`);
  return co;
}

// ── Workflow ──────────────────────────────────────────────────────────────────

/**
 * A user asks to borrow an item (Req 3.1). The borrower is always the current user.
 * @param {{ equipmentId: string, dueBack: string|Date, purpose?: string }} body
 * @param {{ userId: string, role: string, name?: string }} user
 * @param {Date} [now]
 * @returns {Promise<object>} the new checkout (status Requested), populated
 * @throws {Error} 400 bad dueBack/purpose, 404 unknown equipment, 409 equipment not Available or already requested
 */
export async function request({ equipmentId, dueBack, purpose } = {}, user, now = new Date()) {
  const due = validateDueBack(dueBack, now);
  if (purpose !== undefined && purpose !== null && typeof purpose !== 'string') throw httpError(400, 'purpose must be text');
  const why = typeof purpose === 'string' ? purpose.trim().slice(0, 200) : undefined;
  if (equipmentId === undefined || equipmentId === null || equipmentId === '') {
    throw httpError(400, 'equipmentId is required', { fields: { equipmentId: 'Required' } });
  }
  assertId(equipmentId, 'Equipment');

  const id = await guarded(async (session) => {
    const item = await Equipment().findById(equipmentId).session(session).lean();
    if (!item) throw httpError(404, 'Equipment not found');
    if (item.status !== 'Available') throw httpError(409, `Equipment is not available (status: ${item.status})`);
    const pending = await Checkout().exists({ equipment: item._id, borrower: user.userId, status: 'Requested' }).session(session);
    if (pending) throw httpError(409, 'You already have a pending request for this item');

    const [co] = await Checkout().create(
      [{ equipment: item._id, borrower: user.userId, status: 'Requested', dueBack: due, purpose: why, createdBy: user.userId }],
      { session }
    );
    await activity.recordMany([
      ...changeEntries({ actor: user, resource: checkouts, before: null, after: co, action: 'create' }),
      equipmentNote(user, item._id, null, `Requested by ${user.name ?? 'a user'}`),
    ], session);
    return co._id;
  });
  return getCheckout(id);
}

/**
 * Approves a request: checkout → Active and equipment → CheckedOut in one transaction (Req 3.3, 3.4).
 * The equipment update is conditional on `status: 'Available'`, so of two concurrent approvals for the
 * same item exactly one wins; the partial unique index is a second guard.
 * @param {string} id
 * @param {{ userId: string, role: string, name?: string }} user - Technician or LabManager
 * @param {Date} [now]
 * @returns {Promise<object>} the checkout, populated
 * @throws {Error} 404 unknown checkout, 409 not Requested / equipment no longer available / due date passed
 */
export async function approve(id, user, now = new Date()) {
  assertId(id);
  await guarded(async (session) => {
    const co = await loadFor(id, session, ['Requested'], 'approve');
    if (co.dueBack.getTime() <= now.getTime()) throw httpError(409, 'The requested due-back date has passed — reject this request instead');
    const before = await Equipment().findOneAndUpdate(
      { _id: co.equipment, status: 'Available' },
      { $set: { status: 'CheckedOut' } },
      { session, new: false }
    ).lean();
    if (!before) throw httpError(409, 'Equipment is no longer available');

    const coBefore = co.toObject();
    co.set({ status: 'Active', approvedBy: user.userId, checkedOutAt: now });
    await co.save({ session });
    await activity.recordMany([
      ...changeEntries({ actor: user, resource: checkouts, before: coBefore, after: co }),
      ...changeEntries({ actor: user, resource: equipment, before, after: { ...before, status: 'CheckedOut' } }),
    ], session);
  });
  return getCheckout(id);
}

/**
 * Rejects a pending request with a reason (Req 3.6).
 * @param {string} id
 * @param {string} reason - required, ≤ 300 characters
 * @param {{ userId: string, role: string, name?: string }} user - Technician or LabManager
 * @returns {Promise<object>} the checkout, populated
 * @throws {Error} 400 missing reason, 404 unknown checkout, 409 not Requested
 */
export async function reject(id, reason, user) {
  assertId(id);
  const why = typeof reason === 'string' ? reason.trim() : '';
  if (!why) throw httpError(400, 'A reason is required to reject a request', { fields: { reason: 'Required' } });
  await guarded(async (session) => {
    const co = await loadFor(id, session, ['Requested'], 'reject');
    const coBefore = co.toObject();
    co.set({ status: 'Rejected', rejectReason: why.slice(0, 300) });
    await co.save({ session });
    await activity.recordMany([
      ...changeEntries({ actor: user, resource: checkouts, before: coBefore, after: co }),
      equipmentNote(user, co.equipment, 'Requested', 'Rejected'),
    ], session);
  });
  return getCheckout(id);
}

/**
 * Cancels a pending request (Req 3.6). Students may cancel only their own; staff may cancel any.
 * @param {string} id
 * @param {{ userId: string, role: string, name?: string }} user
 * @returns {Promise<object>} the checkout, populated
 * @throws {Error} 403 another user's request, 404 unknown checkout, 409 not Requested
 */
export async function cancel(id, user) {
  assertId(id);
  await guarded(async (session) => {
    const co = await Checkout().findById(id).session(session);
    if (!co) throw httpError(404, 'Checkout not found');
    if (!isStaff(user) && String(co.borrower) !== String(user.userId)) {
      throw httpError(403, 'You can only cancel your own requests');
    }
    if (co.status !== 'Requested') throw httpError(409, `Cannot cancel a checkout that is ${co.status}`);
    const coBefore = co.toObject();
    co.set({ status: 'Cancelled' });
    await co.save({ session });
    await activity.recordMany([
      ...changeEntries({ actor: user, resource: checkouts, before: coBefore, after: co }),
      equipmentNote(user, co.equipment, 'Requested', 'Cancelled'),
    ], session);
  });
  return getCheckout(id);
}

/**
 * Records a return (Req 3.5): checkout → Returned; equipment condition set and status →
 * Maintenance when Damaged, otherwise Available — in one transaction.
 * @param {string} id
 * @param {{ condition: 'Good'|'Fair'|'Damaged', notes?: string }} body
 * @param {{ userId: string, role: string, name?: string }} user - Technician or LabManager
 * @param {Date} [now]
 * @returns {Promise<object>} the checkout, populated
 * @throws {Error} 400 bad condition, 404 unknown checkout, 409 not Active/Overdue
 */
export async function returnItem(id, { condition, notes } = {}, user, now = new Date()) {
  assertId(id);
  if (!CONDITIONS.includes(condition)) {
    throw httpError(400, `condition must be one of: ${CONDITIONS.join(', ')}`, { fields: { condition: 'Pick a condition' } });
  }
  if (notes !== undefined && notes !== null && typeof notes !== 'string') throw httpError(400, 'notes must be text');
  const status = condition === 'Damaged' ? 'Maintenance' : 'Available';

  await guarded(async (session) => {
    const co = await loadFor(id, session, OUT_STATUSES, 'return');
    const before = await Equipment().findOneAndUpdate(
      { _id: co.equipment, status: 'CheckedOut' },
      { $set: { status, condition } },
      { session, new: false }
    ).lean();
    if (!before) throw httpError(409, 'Equipment is not checked out');

    const coBefore = co.toObject();
    co.set({ status: 'Returned', returnedAt: now, receivedBy: user.userId, returnCondition: condition, returnNotes: notes?.trim().slice(0, 1000) || undefined });
    await co.save({ session });
    await activity.recordMany([
      ...changeEntries({ actor: user, resource: checkouts, before: coBefore, after: co }),
      ...changeEntries({ actor: user, resource: equipment, before, after: { ...before, status, condition } }),
    ], session);
  });
  return getCheckout(id);
}

/**
 * The current user's checkouts, newest first.
 * @param {{ userId: string }} user
 * @param {{ status?: string, page?: any, limit?: any }} [query]
 * @returns {Promise<{ items: object[], total: number, page: number, pages: number }>}
 * @throws {Error} 400 unknown status filter
 */
export async function mine(user, query = {}) {
  const filter = { borrower: new mongoose.Types.ObjectId(user.userId) };
  if (query.status !== undefined && query.status !== '') {
    const wanted = String(query.status).split(',');
    if (!wanted.every((s) => checkouts.def.fields.status.values.includes(s))) throw httpError(400, 'Unknown status filter');
    filter.status = { $in: wanted };
  }
  const pg = paginate(query);
  const [items, total] = await Promise.all([
    Checkout().find(filter).sort({ createdAt: -1, _id: -1 }).skip(pg.skip).limit(pg.limit).populate(POPULATE).lean(),
    Checkout().countDocuments(filter),
  ]);
  return envelope(items, total, pg);
}
