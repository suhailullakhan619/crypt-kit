import { defineResource } from '../core/defineResource.js';
import { classifyExpiry } from '../domain/classifyExpiry.js';
import { nextCode } from '../utils/itemCode.js';
import { CATEGORIES, UNITS, LOCATIONS, LOT_STATUSES, EXPIRY_WINDOWS, defaultLocation } from '../domain/expiryWindows.js';

const RECLASSIFY_ON = ['quantity', 'expiresOn', 'category'];

/**
 * Stock lots: a quantity of one item received together, sharing an expiry date (Req 2.2).
 *
 * - `status` is derived by classifyExpiry on create and whenever quantity/expiry/category change;
 *   ExpiringSoon, Expired and Depleted are set only by the expiry job and the distribution workflow.
 * - Deleting soft-deletes to `Discarded` (Coordinator only; the superuser passes every check).
 * - `receivedQuantity` (schema-only, via extendSchema) remembers the original quantity for the
 *   impact report after distributions have drawn the lot down.
 */
export default defineResource({
  key: 'stock-lots',
  label: 'Stock',
  icon: 'package',
  titleField: 'itemName',
  description: 'What is on the shelves, in the fridge and in the freezer — oldest first out.',
  fields: {
    code:       { type: 'string', label: 'Item ID', unique: true, max: 16, list: true, search: true, formHidden: true, help: 'Generated automatically (SL-0001). Printed under the QR code.' },
    itemName:   { type: 'string', label: 'Item', required: true, max: 80, list: true, search: true },
    category:   { type: 'enum', label: 'Category', values: [...CATEGORIES], required: true, list: true, filter: true },
    quantity:   { type: 'number', label: 'Quantity', required: true, min: 0, list: true },
    unit:       { type: 'enum', label: 'Unit', values: [...UNITS], default: 'item', list: true },
    expiresOn:  { type: 'date', label: 'Expires on', list: true },
    donor:      { type: 'ref', label: 'Donor', ref: 'donors', filter: true },
    location:   { type: 'enum', label: 'Location', values: [...LOCATIONS], default: 'Shelf', list: true, filter: true },
    status:     { type: 'enum', label: 'Status', values: [...LOT_STATUSES], default: 'Fresh', list: true, filter: true },
    receivedAt: { type: 'date', label: 'Received' },
  },
  permissions: {
    read:   ['Volunteer', 'Board'],
    create: ['Volunteer'],
    update: ['Volunteer'],
    delete: [],
  },
  statusFlow: {
    field: 'status',
    workflowOnly: ['ExpiringSoon', 'Expired', 'Depleted'],
    transitions: { Fresh: ['Discarded'], ExpiringSoon: ['Discarded'], Expired: ['Discarded'], Depleted: [], Discarded: [] },
  },
  softDelete: { field: 'status', value: 'Discarded', at: 'discardedAt' },
  hooks: {
    beforeCreate: async (d, ctx) => ({
      ...d,
      // The item ID is always generated here (an incoming value, e.g. from a CSV, is replaced).
      code: await nextCode(ctx.registry.get('stock-lots').model, 'code', 'SL', ctx.session),
      receivedAt: d.receivedAt ?? ctx.now,
      location: d.location ?? defaultLocation(d.category),
      status: classifyExpiry({ ...d, status: undefined }, ctx.now, EXPIRY_WINDOWS),
    }),
    beforeUpdate: (doc, input, ctx) => {
      const { code: _permanent, ...changes } = input; // item IDs never change: printed labels must stay valid
      if (!RECLASSIFY_ON.some((f) => f in changes) || changes.status === 'Discarded') return changes;
      const next = { ...doc.toObject(), ...changes };
      return { ...changes, status: classifyExpiry(next, ctx.now, EXPIRY_WINDOWS) };
    },
  },
  extendSchema(schema) {
    schema.add({ receivedQuantity: { type: Number, min: 0 } });
    schema.pre('validate', function rememberReceived() {
      if (this.isNew && (this.receivedQuantity === undefined || this.receivedQuantity === null)) this.receivedQuantity = this.quantity;
    });
    schema.index({ status: 1, expiresOn: 1 });
    schema.index({ receivedAt: 1 });
  },
  report: { columns: ['itemName', 'category', 'quantity', 'unit', 'expiresOn', 'location', 'status'] },
  voice: { synonyms: ['stock', 'stock lots', 'lots', 'food', 'items'] },
  defaultSort: '-receivedAt',
});
