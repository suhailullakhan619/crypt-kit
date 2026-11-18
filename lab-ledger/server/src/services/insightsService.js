import mongoose from 'mongoose';
import * as reportService from './reportService.js';
import { getContext, now as clockNow } from '../context.js';
import { httpError } from '../utils/httpError.js';

const DAY = 86400000;
export const MAX_DAYS = 730;

const model = (key) => getContext().registry.get(key).model;

/** Parses the look-back window, e.g. "90" days. */
export function parseDays(value, fallback = 90) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > MAX_DAYS) throw httpError(400, `days must be a whole number from 1 to ${MAX_DAYS}`);
  return n;
}

/**
 * How much each (non-retired) equipment item was used in the last `days` days: loans started and
 * days spent out. Items never borrowed are included with zero, so "least used" is meaningful.
 */
export async function utilization(days = 90, now = clockNow()) {
  const since = new Date(now.getTime() - days * DAY);
  const [items, loans] = await Promise.all([
    model('equipment').find({ status: { $ne: 'Retired' } }).select('name assetTag category').lean(),
    model('checkouts').aggregate([
      { $match: { status: { $in: ['Active', 'Overdue', 'Returned'] }, checkedOutAt: { $gte: since, $lte: now } } },
      {
        $group: {
          _id: '$equipment',
          loans: { $sum: 1 },
          msOut: { $sum: { $subtract: [{ $min: [{ $ifNull: ['$returnedAt', now] }, now] }, '$checkedOutAt'] } },
        },
      },
    ]),
  ]);
  const byId = new Map(loans.map((l) => [String(l._id), l]));
  const rows = items.map((e) => {
    const l = byId.get(String(e._id));
    return {
      equipmentId: String(e._id),
      name: e.name,
      assetTag: e.assetTag,
      category: e.category,
      loans: l?.loans ?? 0,
      daysOut: l ? Math.round((l.msOut / DAY) * 10) / 10 : 0,
    };
  });
  rows.sort((a, b) => b.loans - a.loans || b.daysOut - a.daysOut || a.assetTag.localeCompare(b.assetTag));
  const unused = rows.filter((r) => r.loans === 0);
  return {
    days,
    totalLoans: rows.reduce((s, r) => s + r.loans, 0),
    mostUsed: rows.filter((r) => r.loans > 0).slice(0, 5),
    leastUsed: [...rows].reverse().slice(0, 5),
    neverBorrowed: unused.length,
    items: rows,
  };
}

/**
 * Borrowers who returned late or are overdue now, among loans due in the last `days` days.
 * Only borrowers with at least one late loan are listed.
 */
export async function lateBorrowers(days = 180, now = clockNow()) {
  const since = new Date(now.getTime() - days * DAY);
  const rows = await model('checkouts').aggregate([
    { $match: { status: { $in: ['Active', 'Overdue', 'Returned'] }, dueBack: { $gte: since, $lte: now } } },
    {
      $group: {
        _id: '$borrower',
        loans: { $sum: 1 },
        late: {
          $sum: {
            $cond: [{ $or: [{ $eq: ['$status', 'Overdue'] }, { $and: [{ $eq: ['$status', 'Returned'] }, { $gt: ['$returnedAt', '$dueBack'] }] }] }, 1, 0],
          },
        },
        stillOut: { $sum: { $cond: [{ $eq: ['$status', 'Overdue'] }, 1, 0] } },
      },
    },
    { $match: { late: { $gt: 0 } } },
    { $sort: { late: -1, loans: 1, _id: 1 } },
    { $limit: 50 },
    { $lookup: { from: mongoose.model('User').collection.name, localField: '_id', foreignField: '_id', as: 'user' } },
  ]);
  return {
    days,
    borrowers: rows.map((r) => ({
      borrowerId: String(r._id),
      name: r.user[0]?.name ?? 'Unknown user',
      loans: r.loans,
      late: r.late,
      stillOut: r.stillOut,
      lateRate: Math.round((r.late / r.loans) * 100),
    })),
  };
}

/** Draws both sections with the skeleton PDF helpers. Exported for tests. */
export function renderInsights(u, l) {
  return (_doc, h) => {
    h.heading(`Equipment use in the last ${u.days} days`);
    h.kv([
      ['Loans started', String(u.totalLoans)],
      ['Items never borrowed', String(u.neverBorrowed)],
    ]);
    h.heading('Most used');
    h.table(
      [{ key: 'name', label: 'Equipment', width: 3 }, { key: 'assetTag', label: 'Tag' }, { key: 'loans', label: 'Loans' }, { key: 'daysOut', label: 'Days out' }],
      u.mostUsed,
      { emptyText: 'No loans in this period.' }
    );
    h.heading('Least used');
    h.table(
      [{ key: 'name', label: 'Equipment', width: 3 }, { key: 'assetTag', label: 'Tag' }, { key: 'loans', label: 'Loans' }, { key: 'daysOut', label: 'Days out' }],
      u.leastUsed,
      { serial: false }
    );
    h.heading(`Late returns in the last ${l.days} days`);
    h.table(
      [{ key: 'name', label: 'Borrower', width: 3 }, { key: 'loans', label: 'Loans' }, { key: 'late', label: 'Late' }, { key: 'lateRate', label: 'Late %' }, { key: 'stillOut', label: 'Still out' }],
      l.borrowers,
      { emptyText: 'Nobody returned late in this period.' }
    );
  };
}

/** Generates the insights PDF and stores it with the other reports. */
export async function generateReport({ usageDays, lateDays } = {}, user) {
  const u = await utilization(parseDays(usageDays, 90));
  const l = await lateBorrowers(parseDays(lateDays, 180));
  return reportService.createReport({
    title: 'Lab insights',
    resource: 'equipment',
    filters: { usageDays: u.days, lateDays: l.days },
    user,
    count: u.items.length,
    render: renderInsights(u, l),
  });
}
