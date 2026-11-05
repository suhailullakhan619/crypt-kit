import { planFefo } from '../domain/planFefo.js';
import { classifyExpiry } from '../domain/classifyExpiry.js';
import { CATEGORIES, LOCATIONS, UNPICKABLE, EXPIRY_WINDOWS } from '../domain/expiryWindows.js';
import { startOfDay } from '../domain/dates.js';
import { OBJECT_ID_RE } from '../core/fieldTypes.js';
import * as activity from './activityService.js';
import * as resourceService from './resourceService.js';
import { resourceOf, modelOf } from './pantryResources.js';
import { withTransaction } from '../utils/transaction.js';
import { httpError } from '../utils/httpError.js';

export const MAX_ITEMS = 30;
export const MAX_LINES = 100;
export const MAX_QTY = 1000;

const wholeQty = (v) => Number.isInteger(Number(v)) && Number(v) >= 1 && Number(v) <= MAX_QTY;

function assertHouseholdId(id) {
  if (typeof id !== 'string' || !OBJECT_ID_RE.test(id)) throw httpError(400, 'Pick a household first');
}

async function findHousehold(id, session) {
  const hh = await modelOf('households').findById(id).session(session ?? null).lean();
  if (!hh) throw httpError(404, 'Household not found');
  return hh;
}

/** Validates `[{ category | itemName, quantity }]`. */
export function cleanItems(items) {
  if (!Array.isArray(items) || items.length === 0) throw httpError(400, 'Choose at least one item');
  if (items.length > MAX_ITEMS) throw httpError(400, `Choose at most ${MAX_ITEMS} items`);
  return items.map((it, i) => {
    const category = it?.category || undefined;
    const itemName = typeof it?.itemName === 'string' && it.itemName.trim() ? it.itemName.trim().slice(0, 80) : undefined;
    if (category !== undefined && !CATEGORIES.includes(category)) throw httpError(400, `Item ${i + 1}: unknown category "${category}"`);
    if (!category && !itemName) throw httpError(400, `Item ${i + 1}: choose a category or an item name`);
    if (!wholeQty(it?.quantity)) throw httpError(400, `Item ${i + 1}: quantity must be a whole number from 1 to ${MAX_QTY}`);
    return { ...(category ? { category } : {}), ...(itemName ? { itemName } : {}), quantity: Number(it.quantity) };
  });
}

/** Validates `[{ lotId, quantity }]` (also accepts `lot`). */
export function cleanLines(lines) {
  if (!Array.isArray(lines) || lines.length === 0) throw httpError(400, 'The pick list is empty');
  if (lines.length > MAX_LINES) throw httpError(400, `At most ${MAX_LINES} lines per distribution`);
  return lines.map((l, i) => {
    const lotId = String(l?.lotId ?? l?.lot ?? '');
    if (!OBJECT_ID_RE.test(lotId)) throw httpError(400, `Line ${i + 1}: unknown lot`);
    if (!wholeQty(l?.quantity)) throw httpError(400, `Line ${i + 1}: quantity must be a whole number from 1 to ${MAX_QTY}`);
    return { lotId, quantity: Number(l.quantity) };
  });
}

const publicHousehold = (h) => ({ _id: h._id, code: h.code, size: h.size, dietary: h.dietary ?? [] });

/**
 * FEFO pick plan for a household (Req 5.1–5.3). Read-only.
 * Lots are re-classified against `now` first, so a lot that expired since the last job run is never planned.
 *
 * @param {{ householdId: string, items: Array<{ category?: string, itemName?: string, quantity: number }> }} body
 * @param {{ now?: Date }} [opts]
 * @returns {Promise<{ household: object, lines: object[], shortfalls: object[] }>}
 * @throws {Error} 400 invalid body, 404 unknown household
 */
export async function plan({ householdId, items } = {}, { now = new Date() } = {}) {
  assertHouseholdId(householdId);
  const request = cleanItems(items);
  const household = await findHousehold(householdId);

  const lots = await modelOf('stock-lots')
    .find({ quantity: { $gt: 0 }, status: { $nin: UNPICKABLE } })
    .select({ itemName: 1, category: 1, quantity: 1, unit: 1, location: 1, expiresOn: 1, receivedAt: 1, status: 1 })
    .lean();
  const current = lots.map((l) => ({ ...l, status: classifyExpiry(l, now, EXPIRY_WINDOWS) }));
  const byId = new Map(current.map((l) => [String(l._id), l]));

  const result = planFefo(request, current);
  const lines = result.lines.map((line) => {
    const lot = byId.get(line.lotId);
    return {
      lotId: line.lotId,
      quantity: line.quantity,
      ask: line.ask,
      itemName: lot.itemName,
      category: lot.category,
      unit: lot.unit,
      location: lot.location ?? 'Shelf',
      expiresOn: lot.expiresOn ?? null,
      status: lot.status,
    };
  });
  lines.sort((a, b) => LOCATIONS.indexOf(a.location) - LOCATIONS.indexOf(b.location));
  return { household: publicHousehold(household), lines, shortfalls: result.shortfalls };
}

function summaryOf(code, lines) {
  const total = lines.reduce((s, l) => s + l.quantity, 0);
  const byCat = {};
  for (const l of lines) byCat[l.category] = (byCat[l.category] ?? 0) + l.quantity;
  const parts = Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c} ${n}`);
  return `${total} units for ${code} — ${parts.join(', ')}`.slice(0, 200);
}

/**
 * Commits a distribution atomically (Req 5.4, 5.5). In one transaction:
 *  - decrements each lot with a conditional update (quantity ≥ requested, pickable, not past expiry);
 *  - if ANY line cannot be fulfilled, throws 409 `{ short }` — the transaction aborts, so no lot changes;
 *  - marks lots that reached 0 as Depleted, creates the Distribution and records activity.
 * Concurrent commits on the same lots are serialised by MongoDB write conflicts; the driver retries
 * the losing transaction, which then sees the reduced quantity (Property P1).
 *
 * @param {{ householdId: string, lines: Array<{ lotId: string, quantity: number }> }} body
 * @param {{ userId: string, role: string, name?: string }} user
 * @param {{ now?: Date }} [opts]
 * @returns {Promise<object>} the Distribution (household populated)
 * @throws {Error} 400 invalid body, 404 unknown household, 409 insufficient stock (`short`)
 */
export async function commit({ householdId, lines } = {}, user, { now = new Date() } = {}) {
  assertHouseholdId(householdId);
  const clean = cleanLines(lines);
  const StockLots = modelOf('stock-lots');
  const dayStart = startOfDay(now);

  const id = await withTransaction(async (session) => {
    const household = await findHousehold(householdId, session);
    const short = [];
    const firstSeen = new Map(); // lotId → lot before this distribution
    const snapshot = [];

    for (const line of clean) {
      const before = await StockLots.findOneAndUpdate(
        {
          _id: line.lotId,
          quantity: { $gte: line.quantity },
          status: { $nin: UNPICKABLE },
          $or: [{ expiresOn: null }, { expiresOn: { $gte: dayStart } }],
        },
        { $inc: { quantity: -line.quantity } },
        { session, new: false, lean: true }
      );
      if (!before) {
        const lot = await StockLots.findById(line.lotId).session(session).select({ quantity: 1, itemName: 1, status: 1 }).lean();
        short.push({ lotId: line.lotId, quantity: line.quantity, available: lot && !UNPICKABLE.includes(lot.status) ? lot.quantity : 0, itemName: lot?.itemName ?? null });
        continue;
      }
      if (!firstSeen.has(line.lotId)) firstSeen.set(line.lotId, before);
      snapshot.push({
        lot: before._id, itemName: before.itemName, category: before.category, unit: before.unit,
        location: before.location, expiresOn: before.expiresOn, quantity: line.quantity,
      });
    }
    if (short.length) throw httpError(409, `Not enough stock for ${short.length} line${short.length === 1 ? '' : 's'} — nothing was changed`, { short });

    const lotIds = [...firstSeen.keys()];
    const after = await StockLots.find({ _id: { $in: lotIds } }).session(session).select({ quantity: 1, status: 1 }).lean();
    const depleted = after.filter((l) => l.quantity === 0).map((l) => l._id);
    if (depleted.length) await StockLots.updateMany({ _id: { $in: depleted } }, { $set: { status: 'Depleted' } }, { session });

    const totalUnits = snapshot.reduce((s, l) => s + l.quantity, 0);
    const [dist] = await modelOf('distributions').create(
      [{ household: household._id, lines: snapshot, totalUnits, volunteer: user.userId, at: now, summary: summaryOf(household.code, snapshot), createdBy: user.userId }],
      { session }
    );

    const entries = [{ actor: user, resource: 'distributions', recordId: dist._id, action: 'create', diff: { household: [null, String(household._id)], totalUnits: [null, totalUnits] } }];
    for (const lot of after) {
      const before = firstSeen.get(String(lot._id));
      entries.push({ actor: user, resource: 'stock-lots', recordId: lot._id, action: 'update', diff: { quantity: [before.quantity, lot.quantity] } });
      if (lot.quantity === 0) entries.push({ actor: user, resource: 'stock-lots', recordId: lot._id, action: 'status', diff: { status: [before.status, 'Depleted'] } });
    }
    await activity.recordMany(entries, session);
    return dist._id;
  });

  return resourceService.get(resourceOf('distributions'), String(id));
}
