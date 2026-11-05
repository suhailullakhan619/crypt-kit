import { CATEGORIES } from '../domain/expiryWindows.js';
import { monthWindow } from '../domain/dates.js';
import * as reportService from './reportService.js';
import { modelOf } from './pantryResources.js';
import { httpError } from '../utils/httpError.js';

const fmt = (n) => new Intl.NumberFormat('en-GB').format(n);
const pct = (r) => `${(r * 100).toFixed(1)}%`;

/** Day ranges of the weekly buckets: 1–7, 8–14, 15–21, 22–28, 29–end. */
function weekBuckets(start, end) {
  const days = Math.round((end - start) / 86400000);
  const month = new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' }).format(start);
  return Array.from({ length: Math.ceil(days / 7) }, (_, i) => {
    const from = i * 7 + 1;
    const to = Math.min(from + 6, days);
    return { week: i + 1, label: from === to ? `${from} ${month}` : `${from}–${to} ${month}` };
  });
}

/**
 * Aggregates for one month window (Req 7.2). Aggregates only: no household codes leave this
 * function, so every caller (impact PDF, dashboard panel, preview, voice) is privacy-safe (Req 7.3).
 *
 * Waste = units still on lots that became Expired (expiry date in the window) or were Discarded
 * (discarded in the window), divided by units received in the window.
 *
 * @param {{ start: Date, end: Date, label?: string }} window
 * @returns {Promise<object>}
 */
export async function aggregate({ start, end, label }) {
  const Lots = modelOf('stock-lots');
  const Dist = modelOf('distributions');
  const Households = modelOf('households');
  const Donors = modelOf('donors');
  const inWindow = { $gte: start, $lt: end };

  const [received, distributed, householdIds, count, weekly, waste, donors] = await Promise.all([
    Lots.aggregate([
      { $match: { receivedAt: inWindow } },
      { $group: { _id: '$category', units: { $sum: { $ifNull: ['$receivedQuantity', '$quantity'] } }, lots: { $sum: 1 } } },
    ]),
    Dist.aggregate([
      { $match: { at: inWindow } },
      { $unwind: '$lines' },
      { $group: { _id: '$lines.category', units: { $sum: '$lines.quantity' } } },
    ]),
    Dist.distinct('household', { at: inWindow }),
    Dist.countDocuments({ at: inWindow }),
    Dist.aggregate([
      { $match: { at: inWindow } },
      { $group: { _id: { $ceil: { $divide: [{ $dayOfMonth: '$at' }, 7] } }, count: { $sum: 1 }, units: { $sum: '$totalUnits' } } },
    ]),
    Lots.aggregate([
      { $match: { $or: [{ status: 'Expired', expiresOn: inWindow }, { status: 'Discarded', discardedAt: inWindow }] } },
      { $group: { _id: null, units: { $sum: '$quantity' }, lots: { $sum: 1 } } },
    ]),
    Lots.aggregate([
      { $match: { receivedAt: inWindow, donor: { $ne: null } } },
      { $group: { _id: '$donor', units: { $sum: { $ifNull: ['$receivedQuantity', '$quantity'] } }, lots: { $sum: 1 } } },
      { $sort: { units: -1, _id: 1 } },
      { $limit: 5 },
      { $lookup: { from: Donors.collection.name, localField: '_id', foreignField: '_id', as: 'donor' } },
    ]),
  ]);

  const people = householdIds.length
    ? (await Households.aggregate([{ $match: { _id: { $in: householdIds } } }, { $group: { _id: null, people: { $sum: '$size' } } }]))[0]?.people ?? 0
    : 0;

  const rec = Object.fromEntries(received.map((r) => [r._id, r.units]));
  const dis = Object.fromEntries(distributed.map((r) => [r._id, r.units]));
  const byCategory = CATEGORIES.map((c) => ({ category: c, received: rec[c] ?? 0, distributed: dis[c] ?? 0 }));
  const unitsIn = byCategory.reduce((s, r) => s + r.received, 0);
  const unitsOut = byCategory.reduce((s, r) => s + r.distributed, 0);
  const wasteUnits = waste[0]?.units ?? 0;
  const wk = Object.fromEntries(weekly.map((w) => [w._id, w]));

  return {
    month: label ?? null,
    unitsIn,
    unitsOut,
    byCategory,
    households: householdIds.length,
    people,
    distributions: count,
    wasteUnits,
    wasteRate: unitsIn > 0 ? wasteUnits / unitsIn : 0,
    topDonors: donors.map((d) => ({ name: d.donor[0]?.name ?? 'Unknown donor', units: d.units, lots: d.lots })),
    weekly: weekBuckets(start, end).map((b) => ({ ...b, distributions: wk[b.week]?.count ?? 0, units: wk[b.week]?.units ?? 0 })),
  };
}

/**
 * Parses and validates `YYYY-MM`.
 * @throws {Error} 400 for anything else
 */
export function windowFor(month) {
  const w = monthWindow(month);
  if (!w) throw httpError(400, 'month must look like 2026-11');
  return w;
}

/** JSON preview of a month's impact (Coordinator, Board). */
export async function preview(month) {
  return aggregate(windowFor(month));
}

/**
 * Draws the impact report with the skeleton PDF helpers (Req 7.2). Exported for tests (Property P6).
 * @param {object} a - result of aggregate()
 * @returns {(doc: PDFKit.PDFDocument, h: object) => void}
 */
export function renderImpact(a) {
  return (_doc, h) => {
    h.heading('At a glance');
    h.kv([
      ['Units received', fmt(a.unitsIn)],
      ['Units distributed', fmt(a.unitsOut)],
      ['Households served', fmt(a.households)],
      ['People reached', fmt(a.people)],
      ['Distributions', fmt(a.distributions)],
      ['Waste rate', `${pct(a.wasteRate)} (${fmt(a.wasteUnits)} of ${fmt(a.unitsIn)} units expired or discarded)`],
    ]);
    h.heading('Received and distributed by category');
    h.table(
      [
        { key: 'category', label: 'Category' },
        { key: 'received', label: 'Units received' },
        { key: 'distributed', label: 'Units distributed' },
      ],
      a.byCategory,
      { serial: false }
    );
    h.heading('Top donors by units');
    h.table(
      [
        { key: 'name', label: 'Donor', width: 3 },
        { key: 'lots', label: 'Lots' },
        { key: 'units', label: 'Units' },
      ],
      a.topDonors,
      { emptyText: 'No donations recorded this month.' }
    );
    h.barChart(a.weekly.map((w) => ({ label: w.label, value: w.distributions })), { title: 'Distributions per week' });
    h.text(
      'Households are identified only by an anonymous code inside Pantry Ghost; this report contains aggregates only. ' +
        'Units mix cans, boxes, kilograms and other counting units as recorded at intake.'
    );
  };
}

/**
 * Generates the monthly impact PDF through the skeleton report service and persists a Report
 * record listed with the other reports (Req 7.1–7.3).
 * @param {string} month - 'YYYY-MM'
 * @param {{ userId: string, role: string, name?: string }} user
 * @returns {Promise<object>} the Report record
 * @throws {Error} 400 bad month
 */
export async function generate(month, user) {
  const w = windowFor(month);
  const a = await aggregate(w);
  return reportService.createReport({
    title: `Impact — ${w.label}`,
    resource: 'stock-lots',
    filters: { month },
    user,
    count: a.distributions,
    render: renderImpact(a),
  });
}
