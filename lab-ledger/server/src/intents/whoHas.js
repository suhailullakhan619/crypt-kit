import { lookup, listTags, labName, spoken } from '../services/labVoiceService.js';

const RE = /^(?:who|whos|who s)(?: has| has got| got| took| borrowed| is using| using| checked out)(?: out)? (.+?)(?: right now| now| at the moment| today)?$/;

/**
 * WHO_HAS — "who has the oscilloscope?" (lab-ledger Req 6.1): the borrower and due-back date of the
 * active checkout, or "it's on the shelf in <lab>". Several matches list up to 3 asset tags.
 */
export default {
  name: 'WHO_HAS',
  resource: 'equipment',
  examples: ['who has the oscilloscope'],
  match(t) {
    const m = t.match(RE);
    return m ? { query: m[1] } : null;
  },
  handle: ({ query }, { config }) => lookup(query, { timeZone: config.reports?.timeZone }),
  respond({ query, matches, total, checkout }) {
    if (total === 0) return `I couldn't find any equipment called "${query}".`;
    if (total > 1) return `I found ${total}: ${listTags(matches)}${total > 3 ? ', and more' : ''}. Which one do you mean?`;
    const item = matches[0];
    if (checkout) {
      const late = checkout.status === 'Overdue' ? ' — it is overdue' : '';
      return `${checkout.borrower} has the ${item.name} (${item.assetTag}), due back ${checkout.due}${late}.`;
    }
    if (item.status === 'Available') return `Nobody — the ${item.name} (${item.assetTag}) is on the shelf in ${labName(item)}.`;
    return `Nobody has the ${item.name} (${item.assetTag}); it is marked ${spoken(item.status)} in ${labName(item)}.`;
  },
};
