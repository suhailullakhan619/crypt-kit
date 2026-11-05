import { normaliseUtterance } from '../core/utterance.js';
import { synonymsOf } from '../core/builtinIntents.js';
import { categoryNamed } from '../domain/categoryKeywords.js';
import { UNPICKABLE } from '../domain/expiryWindows.js';
import { amount, listOf } from '../domain/spoken.js';
import { escapeRegex } from '../utils/escapeRegex.js';

/**
 * STOCK_OF — "how much canned food do we have", "how many apples do we have" (Req 6.1).
 * Sums usable quantity per unit for a category, an item name, or all stock ("how much food").
 * Phrases naming another resource ("how many households…") are left to the built-in intents.
 */
const RE = /^how (?:much|many) (.+?) (?:do we (?:still )?have(?: left| in stock)?|have we got|is there|are there|is left|are left|is in stock|are in stock|in stock|left)$/;

const singular = (w) => w.replace(/ies$/, 'y').replace(/(oes|ches|shes|xes)$/, (m) => m.slice(0, -2)).replace(/s$/, '');

export default (registry) => {
  const resources = registry?.all() ?? [];
  const stockWords = new Set(synonymsOf(registry?.get('stock-lots')?.def ?? { key: 'stock-lots', label: 'Stock' }));
  const otherWords = new Set(resources.filter((r) => r.key !== 'stock-lots').flatMap((r) => synonymsOf(r.def)));

  return {
    name: 'STOCK_OF',
    resource: 'stock-lots',
    examples: ['how much canned food do we have'],
    match(t) {
      const m = t.match(RE);
      if (!m) return null;
      const term = normaliseUtterance(m[1])
        .replace(/^(?:the|our|any) /, '')
        .replace(/^(?:cans?|tins?|box|boxes|cartons?|kilos?|kg|pounds?|lbs?|litres?|liters?|bags?|items?|packs?|bottles?|jars?) of /, '');
      if (otherWords.has(term)) return null;
      const category = categoryNamed(term);
      if (category) return { term, category };
      if (stockWords.has(term) || term === 'stuff') return { term, all: true };
      return { term };
    },
    async handle({ term, category, all }, { registry: reg }) {
      const match = { status: { $nin: UNPICKABLE }, quantity: { $gt: 0 } };
      if (category) match.category = category;
      else if (!all) match.itemName = { $regex: `\\b${escapeRegex(singular(term))}`, $options: 'i' };
      const rows = await reg.get('stock-lots').model.aggregate([
        { $match: match },
        { $group: { _id: '$unit', quantity: { $sum: '$quantity' }, lots: { $sum: 1 } } },
        { $sort: { quantity: -1 } },
      ]);
      return { term, category: category ?? null, byUnit: rows.map((r) => ({ unit: r._id, quantity: r.quantity })), lots: rows.reduce((s, r) => s + r.lots, 0) };
    },
    respond({ term, category, byUnit, lots }) {
      const what = category ? `${category.toLowerCase()} food` : term;
      if (!lots) return `We don't have any ${what} in stock right now.`;
      return `We have ${listOf(byUnit.map((u) => amount(u.quantity, u.unit)))} of ${what} (${lots === 1 ? '1 lot' : `${lots} lots`}).`;
    },
  };
};
