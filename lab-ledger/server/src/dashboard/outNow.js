import checkouts, { OUT_STATUSES } from '../resources/checkouts.js';
import equipment from '../resources/equipment.js';
import User from '../models/User.js';

export const MAX_ROWS = 25;

/**
 * "Out right now" dashboard panel (lab-ledger Req 7.1): Active and Overdue checkouts with the
 * borrower, item and due-back date. Overdue rows come first and carry `overdue: true` so the client
 * can highlight them. Rendered by client/src/dashboard/outNow.jsx.
 */
export default {
  key: 'outNow',
  title: 'Out right now',
  async load({ now }) {
    const filter = { status: { $in: OUT_STATUSES } };
    const [total, overdue, rows] = await Promise.all([
      checkouts.model.countDocuments(filter),
      checkouts.model.countDocuments({ status: 'Overdue' }),
      checkouts.model.aggregate([
        { $match: filter },
        { $addFields: { late: { $cond: [{ $eq: ['$status', 'Overdue'] }, 0, 1] } } },
        { $sort: { late: 1, dueBack: 1, _id: 1 } },
        { $limit: MAX_ROWS },
        { $lookup: { from: equipment.model.collection.name, localField: 'equipment', foreignField: '_id', as: 'eq', pipeline: [{ $project: { name: 1, assetTag: 1 } }] } },
        { $lookup: { from: User.collection.name, localField: 'borrower', foreignField: '_id', as: 'who', pipeline: [{ $project: { name: 1 } }] } },
      ]),
    ]);
    return {
      total,
      overdue,
      rows: rows.map((c) => ({
        _id: c._id,
        equipmentId: c.equipment,
        item: c.eq[0]?.name ?? 'Unknown item',
        assetTag: c.eq[0]?.assetTag ?? null,
        borrower: c.who[0]?.name ?? 'Unknown',
        dueBack: c.dueBack,
        status: c.status,
        overdue: c.status === 'Overdue' || (c.dueBack && new Date(c.dueBack) < now),
      })),
    };
  },
};
