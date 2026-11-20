/**
 * Lowercases, removes apostrophes, turns other punctuation into spaces (keeps in-word hyphens)
 * and collapses whitespace, so intent matchers always see a canonical string.
 * @param {string} text
 */
function plainUtterance(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+-\s+|^-+|-+$|\s-+|-+\s/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** People write "over due" and "past due" for "overdue"; matchers only need to know one spelling. */
const CANON = [[/\b(?:over|past) due\b/g, 'overdue']];

/**
 * Canonical form of a question: lower case, no apostrophes or punctuation, single spaces,
 * and a few spelling variants folded together ("over due" becomes "overdue").
 * @param {string} text
 */
export function normaliseUtterance(text) {
  return CANON.reduce((s, [re, to]) => s.replace(re, to), plainUtterance(text));
}

/** 'CheckedOut' becomes 'checked out', 'Under Maintenance' becomes 'under maintenance'. */
export function spokenValue(value) {
  return normaliseUtterance(String(value).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' '));
}

/** Spoken synonyms for a resource (voice.synonyms, or derived from its label and key), normalised. */
export function synonymsOf(def) {
  const raw = def.voice?.synonyms?.length ? def.voice.synonyms : [def.label, def.key.replace(/-/g, ' ')];
  return [...new Set(raw.map((s) => normaliseUtterance(s)).filter(Boolean))];
}
