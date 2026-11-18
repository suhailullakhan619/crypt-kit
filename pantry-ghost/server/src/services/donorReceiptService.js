import mongoose from 'mongoose';
import * as reportService from './reportService.js';
import { modelOf } from './pantryResources.js';
import { OBJECT_ID_RE } from '../core/fieldTypes.js';
import { httpError } from '../utils/httpError.js';

const DAY = 86400000;
const fmt = (n) => new Intl.NumberFormat('en-GB').format(n);
const ymd = (d) => d.toISOString().slice(0, 10);

/** Parses an inclusive YYYY-MM-DD range into [start, end) in UTC. */
export function parseRange(from, to) {
  const ok = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(s).getTime());
  if (!ok(from) || !ok(to)) throw httpError(400, 'from and to must look like 2026-01-31');
  const start = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(new Date(`${to}T00:00:00.000Z`).getTime() + DAY);
  if (end <= start) throw httpError(400, '"to" must not be before "from"');
  if (end - start > 366 * DAY) throw httpError(400, 'A receipt can cover at most one year');
  return { start, end };
}

/**
 * What one donor gave in a period: every lot received in the window, with the quantity originally
 * received (not what is left). Donor contact details are organisations' own, never recipients'.
 */
export async function donations(donorId, from, to) {
  if (typeof donorId !== 'string' || !OBJECT_ID_RE.test(donorId)) throw httpError(404, 'Donor not found');
  const donor = await modelOf('donors').findById(donorId).lean();
  if (!donor) throw httpError(404, 'Donor not found');
  const { start, end } = parseRange(from, to);

  const lots = await modelOf('stock-lots')
    .find({ donor: new mongoose.Types.ObjectId(donorId), receivedAt: { $gte: start, $lt: end } })
    .sort({ receivedAt: 1, _id: 1 })
    .lean();
  const rows = lots.map((l) => ({
    date: ymd(new Date(l.receivedAt)),
    item: l.itemName,
    category: l.category,
    quantity: l.receivedQuantity ?? l.quantity,
    unit: l.unit ?? 'item',
  }));
  const byCategory = {};
  for (const r of rows) byCategory[r.category] = (byCategory[r.category] ?? 0) + r.quantity;
  return {
    donor: { name: donor.name, type: donor.type },
    from, to, rows,
    totalUnits: rows.reduce((s, r) => s + r.quantity, 0),
    byCategory: Object.entries(byCategory).map(([category, units]) => ({ category, units })),
  };
}

/** Draws the receipt with the skeleton PDF helpers. Exported for tests. */
export function renderReceipt(d, organization) {
  return (_doc, h) => {
    h.heading('Thank you');
    h.text(
      `${organization ?? 'The food bank'} gratefully acknowledges the donations below from ${d.donor.name}, ` +
        `received between ${d.from} and ${d.to}. No goods or services were provided in return.`
    );
    h.heading('Summary');
    h.kv([
      ['Donor', `${d.donor.name} (${d.donor.type})`],
      ['Period', `${d.from} to ${d.to}`],
      ['Donations', fmt(d.rows.length)],
      ['Total units', fmt(d.totalUnits)],
    ]);
    h.heading('By category');
    h.table([{ key: 'category', label: 'Category', width: 3 }, { key: 'units', label: 'Units' }], d.byCategory, { serial: false, emptyText: 'Nothing received in this period.' });
    h.heading('Donations');
    h.table(
      [
        { key: 'date', label: 'Received' },
        { key: 'item', label: 'Item', width: 3 },
        { key: 'category', label: 'Category' },
        { key: 'quantity', label: 'Quantity' },
        { key: 'unit', label: 'Unit' },
      ],
      d.rows,
      { emptyText: 'Nothing received in this period.' }
    );
    h.text('Quantities are as counted at intake. This receipt is not a tax document unless your organisation says so.');
  };
}

/**
 * Generates the donor receipt PDF and stores it with the other reports.
 * @returns {Promise<object>} the Report record
 */
export async function generate(donorId, { from, to } = {}, user, { organization } = {}) {
  const d = await donations(donorId, from, to);
  return reportService.createReport({
    title: `Donor receipt: ${d.donor.name}`,
    resource: 'donors',
    filters: { donor: donorId, from, to },
    user,
    count: d.rows.length,
    render: renderReceipt(d, organization),
  });
}
