// Property L5: Fuzzy Match Tolerates Small Typos
// Validates: Requirements 6.2
import fc from 'fast-check';
import { fuzzyMatch, damerauLevenshtein, tokenize, STOP_WORDS } from './fuzzyMatch.js';

const LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('');
const letter = fc.constantFrom(...LETTERS);
const word = fc.array(letter, { minLength: 3, maxLength: 10 }).map((a) => a.join('')).filter((w) => !STOP_WORDS.has(w));
const name = fc.array(word, { minLength: 1, maxLength: 3 }).map((ws) => ws.join(' '));

/** One random edit: insert, delete, substitute or swap two adjacent letters. */
const edit = fc.record({ op: fc.constantFrom('ins', 'del', 'sub', 'swap'), at: fc.nat(), ch: letter });
function apply(w, { op, at, ch }) {
  const i = at % (w.length + (op === 'ins' ? 1 : 0) || 1);
  switch (op) {
    case 'ins': return w.slice(0, i) + ch + w.slice(i);
    case 'del': return w.length > 1 ? w.slice(0, i) + w.slice(i + 1) : w;
    case 'sub': return w.slice(0, i) + ch + w.slice(i + 1);
    case 'swap': return i + 1 < w.length ? w.slice(0, i) + w[i + 1] + w[i] + w.slice(i + 2) : w;
    default: return w;
  }
}
/** Perturbs every token of `n` with 0–2 edits, sometimes changing case. */
const typo = (n) => fc.tuple(
  fc.array(fc.array(edit, { maxLength: 2 }), { minLength: n.split(' ').length, maxLength: n.split(' ').length }),
  fc.boolean()
).map(([edits, upper]) => {
  const out = n.split(' ').map((w, k) => edits[k].reduce(apply, w)).join(' ');
  return upper ? out.toUpperCase() : out;
});

test('L5: a name with ≤ 2 edits per token still matches the original item', () => {
  fc.assert(
    fc.property(
      fc.array(name, { minLength: 1, maxLength: 8 }).chain((names) => fc.tuple(fc.constant(names), fc.nat(names.length - 1)))
        .chain(([names, i]) => fc.tuple(fc.constant(names), fc.constant(i), typo(names[i]))),
      ([names, i, query]) => {
        fc.pre(tokenize(query).length > 0); // a perturbed token may have become a stop-word
        const items = names.map((n, id) => ({ id, name: n }));
        // The intent regex strips "who has" — only the stop-word "the" reaches fuzzyMatch.
        const found = fuzzyMatch(`the ${query}`, items, { key: (x) => x.name });
        expect(found.map((x) => x.id)).toContain(i);
      }
    ),
    { numRuns: 500 }
  );
});

test('L5: a query token farther than 2 edits from every candidate token matches nothing', () => {
  fc.assert(
    fc.property(fc.array(name, { minLength: 1, maxLength: 8 }), word, fc.option(word, { nil: undefined }), (names, far, near) => {
      const allTokens = names.flatMap(tokenize);
      fc.pre(allTokens.every((t) => damerauLevenshtein(far, t) > 2));
      const query = near ? `${near} ${far}` : far;
      expect(fuzzyMatch(query, names)).toEqual([]);
    }),
    { numRuns: 500 }
  );
});

test('L5: exact names rank first and matching ignores case and stop-words', () => {
  const items = ['Digital Oscilloscope', 'Oscilloscope Probe Kit', 'Benchtop Centrifuge'];
  expect(fuzzyMatch('the OSCILOSCOPE', items)).toEqual(['Digital Oscilloscope', 'Oscilloscope Probe Kit']);
  expect(fuzzyMatch('probe oscilloscope', items)).toEqual(['Oscilloscope Probe Kit']);
  expect(fuzzyMatch('centrifuge', items)).toEqual(['Benchtop Centrifuge']);
  expect(fuzzyMatch('the', items)).toEqual([]);
});

test('regression (shrunk L5 counterexample [["aaa"],0,"aaa"]): only stop-words are ignored', () => {
  // The first L5 draft prefixed "who has the" — "who"/"has" are not stop-words, so nothing matched.
  expect(fuzzyMatch('the aaa', ['aaa'])).toEqual(['aaa']);
  expect(fuzzyMatch('who has the aaa', ['aaa'])).toEqual([]);
});

test('Damerau-Levenshtein is a metric on random words (symmetry, identity, triangle)', () => {
  fc.assert(
    fc.property(word, word, word, (a, b, c) => {
      expect(damerauLevenshtein(a, a)).toBe(0);
      expect(damerauLevenshtein(a, b)).toBe(damerauLevenshtein(b, a));
      expect(damerauLevenshtein(a, c)).toBeLessThanOrEqual(damerauLevenshtein(a, b) + damerauLevenshtein(b, c));
    }),
    { numRuns: 300 }
  );
  expect(damerauLevenshtein('ab', 'bca')).toBe(2); // the OSA variant says 3
  expect(damerauLevenshtein('centrifuge', 'cnetrifuge')).toBe(1);
});
