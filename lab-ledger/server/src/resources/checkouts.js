import { defineResource } from '../core/defineResource.js';
import { httpError } from '../utils/httpError.js';

export const CHECKOUT_STATUS = ['Requested', 'Active', 'Overdue', 'Returned', 'Rejected', 'Cancelled'];
/** Statuses in which the borrower physically holds the item (Req 3.4). */
export const OUT_STATUSES = ['Active', 'Overdue'];

/**
 * Loans of one equipment item to one borrower (lab-ledger Req 3.7, 3.8).
 *
 * Every status is workflow-only and generic create/update/delete is LabManager-only: all state
 * changes go through /api/checkouts/* (checkoutService). The skeleton sweeper still moves
 * Active → Overdue once `dueBack` passes (Due Rule).
 */
export default defineResource({
  key: 'checkouts',
  label: 'Checkouts',
  icon: 'hand-helping',
  titleField: 'equipment',
  description: 'Who borrowed what, and when it is due back.',
  fields: {
    equipment:       { type: 'ref', label: 'Equipment', ref: 'equipment', required: true, list: true, filter: true },
    borrower:        { type: 'ref', label: 'Borrower', ref: 'User', required: true, list: true, filter: true },
    status:          { type: 'enum', label: 'Status', values: CHECKOUT_STATUS, default: 'Requested', list: true, filter: true },
    purpose:         { type: 'string', label: 'Purpose', max: 200, search: true },
    dueBack:         { type: 'date', label: 'Due back', required: true, list: true },
    approvedBy:      { type: 'ref', label: 'Approved by', ref: 'User' },
    checkedOutAt:    { type: 'date', label: 'Checked out at' },
    receivedBy:      { type: 'ref', label: 'Received by', ref: 'User' },
    returnedAt:      { type: 'date', label: 'Returned at' },
    returnCondition: { type: 'enum', label: 'Return condition', values: ['Good', 'Fair', 'Damaged'] },
    returnNotes:     { type: 'text', label: 'Return notes', max: 1000 },
    rejectReason:    { type: 'string', label: 'Reject reason', max: 300 },
  },
  permissions: { read: ['Technician', 'Student'], create: [], update: [], delete: [] },
  statusFlow: { field: 'status', transitions: {}, workflowOnly: CHECKOUT_STATUS },
  due: { field: 'dueBack', status: 'status', from: ['Active'], to: 'Overdue' },
  report: { columns: ['equipment', 'borrower', 'status', 'dueBack', 'checkedOutAt', 'returnedAt'] },
  voice: { synonyms: ['checkouts', 'loans'] },
  defaultSort: '-createdAt',
  hooks: {
    // Generic PATCH (LabManager only) may fix the purpose or due date, never re-point a loan.
    beforeUpdate(doc, changes) {
      for (const f of ['equipment', 'borrower']) {
        if (changes[f] !== undefined && String(changes[f]) !== String(doc[f])) {
          throw httpError(409, `The ${f} of a checkout cannot be changed — cancel it and request again`);
        }
      }
      return changes;
    },
  },
  extendSchema(schema) {
    // Second guard for Req 3.4: at most one Active/Overdue checkout per equipment item.
    schema.index(
      { equipment: 1 },
      { name: 'one_active_checkout_per_equipment', unique: true, partialFilterExpression: { status: { $in: OUT_STATUSES } } }
    );
    schema.index({ borrower: 1, createdAt: -1 });
    // A hard DELETE (LabManager) of a loan that is out would orphan a CheckedOut item.
    schema.pre('findOneAndDelete', async function guardOutLoan() {
      const session = this.getOptions().session ?? null;
      const doc = await this.model.findOne(this.getFilter()).session(session).lean();
      if (doc && OUT_STATUSES.includes(doc.status)) {
        throw httpError(409, 'This checkout is out on loan — record the return instead of deleting it');
      }
    });
  },
});
