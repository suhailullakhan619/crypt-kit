import mongoose from 'mongoose';
import { defineResource } from '../core/defineResource.js';
import { CATEGORIES, UNITS, LOCATIONS } from '../domain/expiryWindows.js';


/**
 * Distributions: quantities given to one household, one line per stock lot (Req 2.5).
 *
 * Read by Coordinator and Volunteer. Generic create/update/delete are disabled for EVERY role —
 * including the Coordinator superuser — with `genericDisabled` (skeleton Req 16.12): the generic
 * routes answer 405 and the UI hides New/Edit/Delete. Only distributionService writes them. `lines` is a sub-document array added via extendSchema.
 */
const LineSchema = new mongoose.Schema(
  {
    lot:       { type: mongoose.Schema.Types.ObjectId, ref: 'StockLots', required: true },
    itemName:  { type: String, required: true },
    category:  { type: String, enum: [...CATEGORIES], required: true },
    unit:      { type: String, enum: [...UNITS], default: 'item' },
    location:  { type: String, enum: [...LOCATIONS] },
    expiresOn: { type: Date },
    quantity:  { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

export default defineResource({
  key: 'distributions',
  label: 'Distributions',
  // Distributions point at households; keep free text (possible personal data) off them too (P6).
  comments: false,
  icon: 'hand-heart',
  titleField: 'summary',
  description: 'Boxes packed for households. Recorded by the Distribute workflow.',
  fields: {
    summary:    { type: 'string', label: 'Summary', max: 200, list: true, search: true },
    household:  { type: 'ref', label: 'Household', ref: 'households', required: true, list: true, filter: true },
    totalUnits: { type: 'number', label: 'Units', min: 0, list: true },
    volunteer:  { type: 'ref', label: 'Packed by', ref: 'User', list: true, filter: true },
    at:         { type: 'date', label: 'Date', list: true },
  },
  permissions: {
    read:   ['Volunteer'],
    create: [],
    update: [],
    delete: [],
  },
  genericDisabled: ['create', 'update', 'delete'],
  extendSchema(schema) {
    schema.add({ lines: { type: [LineSchema], default: [] } });
    schema.index({ at: -1 });
  },
  report: { columns: ['at', 'summary', 'totalUnits', 'volunteer'] },
  voice: { synonyms: ['distributions', 'boxes', 'parcels'] },
  defaultSort: '-at',
});
