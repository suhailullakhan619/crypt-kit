import { parseIntake } from '../domain/parseIntake.js';
import { defaultLocation } from '../domain/expiryWindows.js';
import { OBJECT_ID_RE } from '../core/fieldTypes.js';
import * as resourceService from './resourceService.js';
import { resourceOf, modelOf } from './pantryResources.js';
import { httpError } from '../utils/httpError.js';

export const MAX_TEXT = 500;
export const MAX_LOTS = 50;

/**
 * Turns a spoken or typed sentence into an Intake Draft (Req 4.1, 4.5). Never writes anything.
 * @param {string} text
 * @param {{ now?: Date }} [opts]
 * @returns {Promise<{ draft: object }>}
 * @throws {Error} 400 when the text is empty or too long
 */
export async function parse(text, { now = new Date() } = {}) {
  if (typeof text !== 'string' || !text.trim()) throw httpError(400, 'Say or type what arrived, e.g. "12 cans of beans expiring March 3rd"');
  if (text.length > MAX_TEXT) throw httpError(400, `That is too long to parse (max ${MAX_TEXT} characters)`);
  const donors = await modelOf('donors').find().select({ name: 1 }).lean();
  return { draft: parseIntake(text, { donors, now }) };
}

/** Draft (or edited draft) → stock-lots body. Unknown keys are dropped by the resource service. */
export function toLot(d) {
  const donor = d?.donor ?? d?.donorId ?? null;
  return {
    itemName: typeof d?.itemName === 'string' ? d.itemName.trim() : d?.itemName,
    category: d?.category,
    quantity: d?.quantity === '' || d?.quantity === null || d?.quantity === undefined ? undefined : Number(d.quantity),
    unit: d?.unit || undefined,
    expiresOn: d?.expiresOn || null,
    donor: donor && OBJECT_ID_RE.test(String(donor)) ? String(donor) : null,
    location: d?.location || defaultLocation(d?.category),
  };
}

/**
 * Saves confirmed drafts as stock lots (Req 4.5). Every lot is validated before any is written, then
 * each is created through the generic resource service, so the stock-lots hooks (status
 * classification, receivedAt) and the Activity Log run exactly as for a hand-entered lot.
 *
 * @param {{ lots: object[] }} body
 * @param {{ userId: string, role: string, name?: string }} user
 * @returns {Promise<object[]>} the created lots
 * @throws {Error} 400 when `lots` is empty, too long or any lot is invalid (`index` + `fields`)
 */
export async function save({ lots } = {}, user) {
  if (!Array.isArray(lots) || lots.length === 0) throw httpError(400, 'Nothing to save — add at least one lot');
  if (lots.length > MAX_LOTS) throw httpError(400, `Save at most ${MAX_LOTS} lots at a time`);

  const resource = resourceOf('stock-lots');
  const bodies = lots.map(toLot);

  // Validate everything first so a bad row never leaves half a delivery saved.
  for (const [i, body] of bodies.entries()) {
    const data = resourceService.sanitize(resource.def, body);
    const doc = new resource.model({ ...data, status: 'Fresh' });
    const err = doc.validateSync();
    if (err) {
      const fields = Object.fromEntries(Object.entries(err.errors).map(([k, v]) => [k, v.message]));
      throw httpError(400, `Lot ${i + 1}: ${Object.values(fields).join('; ')}`, { index: i, fields });
    }
  }

  const items = [];
  for (const body of bodies) items.push(await resourceService.create(resource, body, user));
  return items;
}
