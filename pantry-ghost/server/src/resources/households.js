import { defineResource } from '../core/defineResource.js';
import { DIETARY } from '../domain/expiryWindows.js';

/**
 * Households: recipients identified ONLY by a generated code (Req 2.3, 2.4).
 *
 * Privacy by construction: there is no field for a name, address, phone or email, and the
 * generic service strips undeclared fields, so such data can never be stored (Property P6).
 * Board is absent from every permission list, so it never sees a household record.
 */

/** Next free code, `H-` + 4 digits. Runs inside the create transaction. */
export async function nextHouseholdCode(model, session) {
  const last = await model.findOne({ code: /^H-\d{4,}$/ }).sort({ code: -1 }).select({ code: 1 }).session(session ?? null).lean();
  const n = last ? Number(last.code.slice(2)) + 1 : 1;
  return `H-${String(n).padStart(4, '0')}`;
}

export default defineResource({
  key: 'households',
  label: 'Households',
  icon: 'house',
  titleField: 'code',
  description: 'Who we serve — a code, a size and dietary needs. No names, no addresses.',
  fields: {
    code:    { type: 'string', label: 'Code', unique: true, max: 12, list: true, search: true, help: 'Generated automatically (H-0001).' },
    size:    { type: 'number', label: 'People', required: true, min: 1, max: 20, list: true },
    dietary: { type: 'enum', label: 'Dietary needs', multiple: true, values: [...DIETARY], list: true, filter: true },
  },
  permissions: {
    read:   ['Volunteer'],
    create: ['Volunteer'],
    update: ['Volunteer'],
    delete: [],
  },
  hooks: {
    beforeCreate: async (d, ctx) => ({ ...d, code: await nextHouseholdCode(ctx.registry.get('households').model, ctx.session) }),
    // Codes are permanent: an edit can change size and dietary needs only.
    beforeUpdate: (_doc, changes) => {
      const { code, ...rest } = changes;
      return rest;
    },
  },
  report: { columns: ['code', 'size', 'dietary'] },
  voice: { synonyms: ['households', 'families'] },
  defaultSort: 'code',
});
