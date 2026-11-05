import { lookup, labName, spoken, MAX_LISTED } from '../services/labVoiceService.js';

const IS_RE = /^(?:is|are) (.+?) (?:available|free|in|on the shelf|in stock|bookable)(?: right now| now| today| at the moment)?$/;
const CAN_RE = /^can i (?:borrow|use|get|book|check out|take) (.+?)(?: right now| now| today| please)?$/;

/**
 * IS_AVAILABLE — "is the centrifuge available?" (lab-ledger Req 6.1): yes/no with the status.
 */
export default {
  name: 'IS_AVAILABLE',
  resource: 'equipment',
  examples: ['is the centrifuge available'],
  match(t) {
    const m = t.match(IS_RE) ?? t.match(CAN_RE);
    return m ? { query: m[1] } : null;
  },
  handle: ({ query }, { config }) => lookup(query, { timeZone: config.reports?.timeZone }),
  respond({ query, matches, total, checkout }) {
    if (total === 0) return `I couldn't find any equipment called "${query}".`;
    if (total > 1) {
      const free = matches.filter((m) => m.status === 'Available');
      const shown = matches.slice(0, MAX_LISTED).map((m) => `${m.assetTag} (${spoken(m.status)})`).join(', ');
      return `I found ${total}: ${shown}${total > MAX_LISTED ? ', and more' : ''}. ${free.length ? `${free.length} ${free.length === 1 ? 'is' : 'are'} available.` : 'None are available.'}`;
    }
    const item = matches[0];
    if (item.status === 'Available') return `Yes — the ${item.name} (${item.assetTag}) is available in ${labName(item)}.`;
    if (checkout) return `No — the ${item.name} (${item.assetTag}) is checked out until ${checkout.due}.`;
    return `No — the ${item.name} (${item.assetTag}) is ${spoken(item.status)}.`;
  },
};
