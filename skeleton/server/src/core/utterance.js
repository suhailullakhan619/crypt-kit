/**
 * Lowercases, removes apostrophes, turns other punctuation into spaces (keeps in-word hyphens)
 * and collapses whitespace, so intent matchers always see a canonical string.
 * @param {string} text
 */
export function normaliseUtterance(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+-\s+|^-+|-+$|\s-+|-+\s/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
