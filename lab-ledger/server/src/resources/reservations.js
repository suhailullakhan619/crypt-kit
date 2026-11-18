import { defineResource } from '../core/defineResource.js';
import { httpError } from '../utils/httpError.js';

export const RESERVATION_STATUS = ['Booked', 'Completed', 'Cancelled'];
const STAFF = ['LabManager', 'Technician'];
const HOUR = 3600000;
const DAY = 24 * HOUR;
export const MAX_LENGTH_DAYS = 14;
export const MAX_AHEAD_DAYS = 90;
const BOOKABLE = ['Available', 'CheckedOut'];

const toDate = (v, label) => {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw httpError(400, `${label} must be a valid date and time`);
  return d;
};

/**
 * Advance bookings of equipment for a time window.
 *
 * - Anyone can book for themselves; the hook sets `user` and `status` (they cannot be forged).
 * - No two Booked windows for the same item may overlap (HTTP 409). The hook also touches the
 *   equipment document inside the transaction, so two concurrent bookings of the same item
 *   conflict on that write and one is retried (and then refused) instead of both succeeding.
 * - The owner (or staff) may cancel; nothing else about a reservation can be edited.
 * - The skeleton sweeper marks reservations Completed once `endAt` has passed.
 */
export default defineResource({
  key: 'reservations',
  label: 'Reservations',
  icon: 'calendar-check',
  titleField: 'equipment',
  description: 'Book an instrument ahead of time so nobody else takes it.',
  fields: {
    equipment: { type: 'ref', label: 'Equipment', ref: 'equipment', required: true, list: true, filter: true },
    user:      { type: 'ref', label: 'Booked by', ref: 'User', list: true, filter: true, formHidden: true },
    startAt:   { type: 'date', time: true, label: 'From', required: true, list: true },
    endAt:     { type: 'date', time: true, label: 'Until', required: true, list: true },
    status:    { type: 'enum', label: 'Status', values: RESERVATION_STATUS, default: 'Booked', list: true, filter: true, formHidden: true },
    purpose:   { type: 'string', label: 'Purpose', max: 200, search: true },
  },
  permissions: { read: ['Technician', 'Student'], create: ['Technician', 'Student'], update: ['Technician', 'Student'], delete: [] },
  statusFlow: {
    field: 'status',
    workflowOnly: ['Completed'],
    transitions: { Booked: ['Cancelled'], Completed: [], Cancelled: [] },
  },
  due: { field: 'endAt', status: 'status', from: ['Booked'], to: 'Completed' },
  report: { columns: ['equipment', 'user', 'startAt', 'endAt', 'status'] },
  voice: { synonyms: ['reservations', 'bookings'] },
  defaultSort: 'startAt',
  hooks: {
    async beforeCreate(data, ctx) {
      const start = toDate(data.startAt, 'Start');
      const end = toDate(data.endAt, 'End');
      const now = ctx.now;
      if (end <= start) throw httpError(400, 'The end must be after the start', { fields: { endAt: 'Must be after the start' } });
      if (start.getTime() < now.getTime() - 5 * 60000) throw httpError(400, 'A reservation cannot start in the past', { fields: { startAt: 'Cannot be in the past' } });
      if (end - start > MAX_LENGTH_DAYS * DAY) throw httpError(400, `A reservation can last at most ${MAX_LENGTH_DAYS} days`, { fields: { endAt: `At most ${MAX_LENGTH_DAYS} days` } });
      if (start - now > MAX_AHEAD_DAYS * DAY) throw httpError(400, `Reservations open ${MAX_AHEAD_DAYS} days ahead at most`, { fields: { startAt: `At most ${MAX_AHEAD_DAYS} days ahead` } });

      const equipment = ctx.registry.get('equipment');
      const item = await equipment.model.findById(data.equipment).session(ctx.session);
      if (!item) throw httpError(404, 'Equipment not found');
      if (!BOOKABLE.includes(item.status)) throw httpError(409, `${item.name} is ${item.status} and cannot be reserved right now`);

      // Serialise concurrent bookings of the same item: both transactions write this document.
      await equipment.model.updateOne({ _id: item._id }, { $currentDate: { updatedAt: true } }, { session: ctx.session });

      const clash = await ctx.registry.get('reservations').model
        .findOne({ equipment: item._id, status: 'Booked', startAt: { $lt: end }, endAt: { $gt: start } })
        .session(ctx.session).lean();
      if (clash) {
        throw httpError(409, `${item.name} is already reserved from ${clash.startAt.toISOString().slice(0, 16).replace('T', ' ')} to ${clash.endAt.toISOString().slice(0, 16).replace('T', ' ')} (UTC)`);
      }
      return { ...data, startAt: start, endAt: end, user: ctx.user.userId, status: 'Booked' };
    },

    // Only the owner or staff may change a reservation, and the only change allowed is cancelling it.
    beforeUpdate(doc, changes, ctx) {
      if (!STAFF.includes(ctx.user.role) && String(doc.user) !== String(ctx.user.userId)) {
        throw httpError(403, 'You can only cancel your own reservations');
      }
      const keys = Object.keys(changes);
      if (keys.some((k) => k !== 'status') || changes.status !== 'Cancelled') {
        throw httpError(409, 'A reservation can only be cancelled, not edited. Cancel it and book again.');
      }
      return changes;
    },
  },
  extendSchema(schema) {
    schema.index({ equipment: 1, status: 1, startAt: 1 });
    schema.index({ user: 1, startAt: -1 });
  },
});
