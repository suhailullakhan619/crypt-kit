import * as reportService from './reportService.js';
import { modelOf } from './pantryResources.js';
import { notify } from './notificationService.js';
import { assessStock, USABLE } from '../domain/lowStock.js';
import { now as clockNow } from '../context.js';
import { httpError } from '../utils/httpError.js';

const DAY = 86400000;
export const MAX_DAYS = 730;

export function parseDays(value, fallback = 90) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > MAX_DAYS) throw httpError(400, `days must be a whole number from 1 to ${MAX_DAYS}`);
  return n;
}

/** Usable units per category compared with the configured minimum. */
export async function lowStock() {
  const rows = await modelOf('stock-lots').aggregate([
    { $match: { status: { $in: USABLE } } },
    { $group: { _id: '$category', units: { $sum: '$quantity' } } },
  ]);
  return assessStock(Object.fromEntries(rows.map((r) => [r._id, r.units])));
}

/**
 * Per donor, over lots received in the last `days` days: units received, units that were later
 * wasted (still on a lot that Expired or was Discarded) and the waste rate. Donors with no waste
 * are included so the list is a fair comparison; sorted by wasted units.
 */
export async function wasteByDonor(days = 90, now = clockNow()) {
  const since = new Date(now.getTime() - days * DAY);
  const rows = await modelOf('stock-lots').aggregate([
    { $match: { receivedAt: { $gte: since, $lte: now }, donor: { $ne: null } } },
    {
      $group: {
        _id: '$donor',
        lots: { $sum: 1 },
        received: { $sum: { $ifNull: ['$receivedQuantity', '$quantity'] } },
        wasted: { $sum: { $cond: [{ $in: ['$status', ['Expired', 'Discarded']] }, '$quantity', 0] } },
      },
    },
    { $sort: { wasted: -1, received: -1, _id: 1 } },
    { $limit: 25 },
    { $lookup: { from: modelOf('donors').collection.name, localField: '_id', foreignField: '_id', as: 'donor' } },
  ]);
  return {
    days,
    donors: rows.map((r) => ({
      donorId: String(r._id),
      name: r.donor[0]?.name ?? 'Unknown donor',
      lots: r.lots,
      received: r.received,
      wasted: r.wasted,
      wasteRate: r.received > 0 ? Math.round((r.wasted / r.received) * 100) : 0,
    })),
  };
}

const isoWeek = (d) => {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return `${t.getUTCFullYear()}-W${String(Math.ceil(((t - yearStart) / DAY + 1) / 7)).padStart(2, '0')}`;
};

/**
 * Tells the Coordinator and Volunteers about each category that is below its minimum. At most one
 * notification per category per week, however often the job runs. Never throws.
 * @returns {Promise<{ low: string[] }>}
 */
export async function notifyLowStock(now = clockNow()) {
  try {
    const low = (await lowStock()).filter((r) => r.low);
    const week = isoWeek(now);
    for (const r of low) {
      await notify({
        roles: ['Coordinator', 'Volunteer'],
        title: `${r.category} is running low: ${r.units} on hand, aim for ${r.min}`,
        body: `About ${r.short} more units are needed. Open Insights to see every category.`,
        link: '/insights',
        kind: 'warning',
        dedupeKey: `lowstock:${week}:${r.category}`,
      });
    }
    return { low: low.map((r) => r.category) };
  } catch (err) {
    console.error('notifyLowStock failed:', err.message);
    return { low: [] };
  }
}

const fmt = (n) => new Intl.NumberFormat('en-GB').format(n);

/** Draws the insights PDF. Exported for tests. */
export function renderInsights(stock, waste) {
  return (_doc, h) => {
    h.heading('Stock against minimum');
    h.table(
      [{ key: 'category', label: 'Category', width: 2 }, { key: 'units', label: 'On hand' }, { key: 'min', label: 'Minimum' }, { key: 'short', label: 'Short by' }],
      stock,
      { serial: false }
    );
    h.heading(`Waste by donor in the last ${waste.days} days`);
    h.table(
      [{ key: 'name', label: 'Donor', width: 3 }, { key: 'lots', label: 'Lots' }, { key: 'received', label: 'Received' }, { key: 'wasted', label: 'Wasted' }, { key: 'wasteRate', label: 'Waste %' }],
      waste.donors,
      { emptyText: 'No donations in this period.' }
    );
    h.text(`Waste is the quantity still on lots that expired or were discarded. ${fmt(stock.filter((s) => s.low).length)} categor${stock.filter((s) => s.low).length === 1 ? 'y is' : 'ies are'} below the minimum.`);
  };
}

export async function generateReport({ days } = {}, user) {
  const [stock, waste] = await Promise.all([lowStock(), wasteByDonor(parseDays(days, 90))]);
  return reportService.createReport({
    title: 'Stock insights',
    resource: 'stock-lots',
    filters: { days: waste.days },
    user,
    count: waste.donors.length,
    render: renderInsights(stock, waste),
  });
}
