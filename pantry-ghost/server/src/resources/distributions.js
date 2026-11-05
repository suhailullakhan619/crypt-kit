import mongoose from 'mongoose';
import { defineResource } from '../core/defineResource.js';
import { httpError } from '../utils/httpError.js';
import { CATEGORIES, UNITS, LOCATIONS } from '../domain/expiryWindows.js';

const WORKFLOW_ONLY = 'Distributions are recorded through the Distribute workflow and cannot be changed by hand';
const deny = () => { throw httpError(403, WORKFLOW_ONLY); };

/**
 * Distributions: quantities given to one household, one line per stock lot (Req 2.5).
 *
 * Read by Coordinator and Volunteer. Generic create/update/delete are denied for EVERY role —
 * including the Coordinator superuser, who passes every permission check — through hooks
 * (create/update) and a Mongoose delete guard (the skeleton has no beforeDelete hook).
 * Only distributionService writes them. `lines` is a sub-document array added via extendSchema.
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
  hooks: {
    beforeCreate: deny,
    beforeUpdate: deny,
  },
  extendSchema(schema) {
    schema.add({ lines: { type: [LineSchema], default: [] } });
    schema.index({ at: -1 });
    // The generic DELETE uses findByIdAndDelete → 'findOneAndDelete'.
    schema.pre('findOneAndDelete', deny);
  },
  report: { columns: ['at', 'summary', 'totalUnits', 'volunteer'] },
  voice: { synonyms: ['distributions', 'boxes', 'parcels'] },
  defaultSort: '-at',
});
