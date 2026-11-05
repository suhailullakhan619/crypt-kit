import { can } from '../core/permissions.js';
import { parseIntake } from '../domain/parseIntake.js';
import { describeDraft, missingSentence } from '../domain/spoken.js';

/**
 * INTAKE — "add twelve cans of black beans expiring March 3rd from Fresh Mart" (Req 6.1, 4.5).
 * Returns the Intake Draft in `data` and NEVER saves: the client shows a confirm card and only
 * an explicit Confirm calls POST /api/intake.
 */
const RE = /^(?:please )?(?:add|log|intake|record|we got|we received|received)\s+(.+)$/;

export default {
  name: 'INTAKE',
  resource: 'stock-lots',
  examples: ['add twelve cans of black beans expiring March 3rd from Fresh Mart'],
  match(t) {
    const m = t.match(RE);
    return m ? { text: m[1] } : null;
  },
  async handle({ text }, { registry, config, user, now = new Date() }) {
    const lots = registry.get('stock-lots');
    if (!can(user.role, lots.def, 'create', config.roles)) return { denied: true };
    const donors = await registry.get('donors').model.find().select({ name: 1 }).lean();
    return { draft: parseIntake(text, { donors, now }), saved: false };
  },
  respond(data) {
    if (data.denied) return 'Sorry, only coordinators and volunteers can log new stock.';
    const d = data.draft;
    return `I heard ${describeDraft(d)} — say confirm or edit it on screen.${missingSentence(d.missing)}`;
  },
};
