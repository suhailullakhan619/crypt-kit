import { overdueReturns } from '../services/labVoiceService.js';

const RES = [
  /^(?:which|what) (?:items|equipment|checkouts|loans|things|instruments|devices|returns) (?:are|is) (?:overdue|late|past due)$/,
  /^(?:what is |whats |what s |any |list |show |show me )?(?:overdue returns|overdue loans|overdue checkouts|late returns)$/,
  /^(?:whats|what s|what is) overdue$/,
  /^(?:who is|whos|who s) (?:late|overdue)(?: with (?:a|an|their) (?:return|item|loan))?$/,
];

/**
 * OVERDUE_RETURNS — "which items are overdue?" (lab-ledger Req 6.1): Overdue checkouts, with borrower
 * names for Technicians and the LabManager and a count only for Students.
 */
export default {
  name: 'OVERDUE_RETURNS',
  resource: 'checkouts',
  examples: ['which items are overdue'],
  match: (t) => (RES.some((re) => re.test(t)) ? {} : null),
  handle: (_params, { user, config }) => overdueReturns(user, { timeZone: config.reports?.timeZone }),
  respond({ count, detailed, items }) {
    if (count === 0) return 'Nothing is overdue. Every instrument is back where it belongs.';
    const head = count === 1 ? '1 item is overdue' : `${count} items are overdue`;
    if (!detailed) return `${head}.`;
    const named = items.slice(0, 5).map((i) => `${i.name} (${i.assetTag}) with ${i.borrower}, due ${i.due}`);
    return `${head}: ${named.join('; ')}${count > named.length ? '; and more' : ''}.`;
  },
};
