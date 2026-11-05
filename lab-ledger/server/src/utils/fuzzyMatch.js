/**
 * Pure fuzzy name matching for lab voice questions (lab-ledger Req 6.2).
 *
 * A candidate matches when EVERY query token (after dropping stop-words) is within
 * Damerau-Levenshtein distance `maxDistance` (default 2) of SOME token of the candidate.
 * Matching is case-insensitive. Results are ordered by total distance (best first), stable.
 */

export const STOP_WORDS = new Set(['the', 'a', 'an', 'our', 'my', 'your', 'that', 'this', 'these', 'those', 'one', 'some', 'any', 'of', 'please']);

/**
 * Lower-cases, splits on anything that is not a letter or digit, drops stop-words.
 * @param {string} text
 * @returns {string[]}
 */
export function tokenize(text) {
  return String(text ?? '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t && !STOP_WORDS.has(t));
}

/**
 * Unrestricted Damerau-Levenshtein distance (insert, delete, substitute, adjacent transposition),
 * Lowrance–Wagner algorithm. Unlike the "optimal string alignment" variant it is a true metric, so
 * k random edits never measure as more than k.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function damerauLevenshtein(a, b) {
  const A = [...a];
  const B = [...b];
  const n = A.length;
  const m = B.length;
  if (!n) return m;
  if (!m) return n;
  const INF = n + m;
  const lastRow = new Map(); // char → last row index where it appeared in A
  // d is (n + 2) × (m + 2); row/col 0 hold INF, row/col 1 hold the base case.
  const d = Array.from({ length: n + 2 }, () => new Array(m + 2).fill(0));
  d[0][0] = INF;
  for (let i = 0; i <= n; i += 1) { d[i + 1][0] = INF; d[i + 1][1] = i; }
  for (let j = 0; j <= m; j += 1) { d[0][j + 1] = INF; d[1][j + 1] = j; }

  for (let i = 1; i <= n; i += 1) {
    let lastMatchCol = 0;
    for (let j = 1; j <= m; j += 1) {
      const i1 = lastRow.get(B[j - 1]) ?? 0;
      const j1 = lastMatchCol;
      const cost = A[i - 1] === B[j - 1] ? 0 : 1;
      if (cost === 0) lastMatchCol = j;
      d[i + 1][j + 1] = Math.min(
        d[i][j] + cost, // substitute / match
        d[i + 1][j] + 1, // insert
        d[i][j + 1] + 1, // delete
        d[i1][j1] + (i - i1 - 1) + 1 + (j - j1 - 1) // transpose
      );
    }
    lastRow.set(A[i - 1], i);
  }
  return d[n + 1][m + 1];
}

/**
 * @template T
 * @param {string} query
 * @param {T[]} candidates
 * @param {{ key?: (c: T) => string, maxDistance?: number }} [opts]
 * @returns {T[]} matching candidates, best first (empty when the query has no usable tokens)
 */
export function fuzzyMatch(query, candidates, { key = (c) => c, maxDistance = 2 } = {}) {
  const q = tokenize(query);
  if (!q.length) return [];
  const scored = [];
  candidates.forEach((c, index) => {
    const tokens = tokenize(key(c));
    if (!tokens.length) return;
    let score = 0;
    for (const t of q) {
      let best = Infinity;
      for (const u of tokens) {
        best = Math.min(best, damerauLevenshtein(t, u));
        if (best === 0) break;
      }
      if (best > maxDistance) return;
      score += best;
    }
    scored.push({ c, score, index });
  });
  return scored.sort((x, y) => x.score - y.score || x.index - y.index).map((s) => s.c);
}
