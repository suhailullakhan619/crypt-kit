import { readNumber } from './numberWords.js';
import { readDate, looksLikeDateStart } from './dateWords.js';
import { categoryFor } from './categoryKeywords.js';
import { defaultLocation } from './expiryWindows.js';

/**
 * Natural-language intake (Req 4.1–4.4). Pure: donors and `now` are passed in.
 *
 *   "add twelve cans of black beans expiring March 3rd from Fresh Mart"
 *     → { quantity: 12, unit: 'can', itemName: 'Black beans', category: 'Canned',
 *         expiresOn: 2027-03-03, donorId: <Fresh Mart>, missing: [], confidence: 1 }
 *
 * Pipeline: normalise → donor ("from|donated by <name>", fuzzy ≤ 2 edits) → expiry date (after a
 * marker such as "expiring", or any month-name/ISO date) → quantity → unit → item name (what is
 * left, minus filler words) → category (longest keyword).
 */

/** Spoken unit → stored unit. */
export const UNIT_WORDS = Object.freeze({
  can: 'can', cans: 'can', tin: 'can', tins: 'can',
  box: 'box', boxes: 'box', carton: 'box', cartons: 'box', case: 'box', cases: 'box',
  kg: 'kg', kgs: 'kg', kilo: 'kg', kilos: 'kg', kilogram: 'kg', kilograms: 'kg',
  lb: 'lb', lbs: 'lb', pound: 'lb', pounds: 'lb',
  l: 'L', litre: 'L', litres: 'L', liter: 'L', liters: 'L',
  item: 'item', items: 'item', piece: 'item', pieces: 'item', pcs: 'item', bag: 'item', bags: 'item',
  bottle: 'item', bottles: 'item', jar: 'item', jars: 'item', pack: 'item', packs: 'item', packet: 'item',
  packets: 'item', loaf: 'item', loaves: 'item', bunch: 'item', bunches: 'item', dozen: 'item',
});

/** Phrases that introduce the expiry date. Longest first. */
const DATE_MARKERS = [
  ['best', 'before'], ['use', 'by'], ['good', 'until'], ['good', 'till'], ['sell', 'by'], ['expiring', 'on'],
  ['expires', 'on'], ['expiry', 'date'], ['expiration', 'date'], ['expiring'], ['expires'], ['expire'], ['expiry'],
  ['expiration'], ['exp'], ['bb'],
];
const DONOR_MARKERS = [['donated', 'by'], ['given', 'by'], ['from']];
const FILLERS = new Set(['of', 'a', 'an', 'some', 'the', 'and', 'please', 'add', 'log', 'record', 'intake', 'we', 'got',
  'received', 'receive', 'have', 'here', 'are', 'is', 'with', 'that', 'it', 'its', 'they', 'were', 'was', 'just', 'new', 'on',
  'in', 'soon']);
const LEADING = new Set(['add', 'log', 'record', 'intake', 'please', 'we', 'got', 'received', 'just']);

export const REQUIRED_FIELDS = Object.freeze(['quantity', 'unit', 'itemName', 'category', 'expiresOn']);

/** Lowercase tokens; splits "12kg" → "12 kg", keeps ISO dates and in-word hyphens. */
export function tokenize(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/(\d)(kg|kgs|lbs?|l)\b/g, '$1 $2')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/(^|\s)-+|-+(\s|$)/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/** Levenshtein distance (iterative, two rows). */
export function editDistance(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

const normName = (s) => tokenize(s).join(' ');

function markerAt(tokens, i, markers) {
  for (const m of markers) if (m.every((w, k) => tokens[i + k] === w)) return m.length;
  return 0;
}

/**
 * Best donor for the words after a donor marker: tries 1–6 word prefixes against every donor name
 * (case-insensitive, edit distance ≤ 2 and less than half the name). Smallest distance wins, then
 * the longer prefix.
 */
function matchDonor(tokens, start, donors) {
  let end = start;
  // Stop only at a COMPLETE marker: "good" alone may be a (mis-heard) donor word, "good until" is not.
  while (end < tokens.length && !markerAt(tokens, end, DATE_MARKERS) && !markerAt(tokens, end, DONOR_MARKERS)) end++;
  let best = null;
  for (let len = 1; len <= Math.min(6, end - start); len++) {
    const phrase = tokens.slice(start, start + len).join(' ');
    for (const d of donors) {
      const name = normName(d.name);
      if (!name) continue;
      const dist = editDistance(phrase, name);
      if (dist > 2 || dist * 2 >= name.length) continue;
      if (!best || dist < best.dist || (dist === best.dist && len > best.len)) best = { donor: d, dist, len };
    }
  }
  return { best, end };
}

const capitalise = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Parses an intake sentence into an Intake Draft.
 * @param {string} text
 * @param {{ donors?: Array<{ _id: any, name: string }>, now: Date }} opts
 * @returns {{ quantity: number|null, unit: string, itemName: string|null, category: string|null,
 *             expiresOn: Date|null, donorId: string|null, donorName: string|null, location: string,
 *             confidence: number, missing: string[], heard: string }}
 */
export function parseIntake(text, { donors = [], now } = {}) {
  const tokens = tokenize(text);
  const used = new Array(tokens.length).fill(false);
  const take = (i, n) => { for (let k = i; k < i + n && k < tokens.length; k++) used[k] = true; };

  // 1. donor
  let donorId = null;
  let donorName = null;
  let donorGuess = null;
  for (let i = 0; i < tokens.length && !donorId; i++) {
    const ml = markerAt(tokens, i, DONOR_MARKERS);
    if (!ml) continue;
    const { best, end } = matchDonor(tokens, i + ml, donors);
    if (best) {
      donorId = String(best.donor._id);
      donorName = best.donor.name;
      take(i, ml + best.len);
    } else if (!donorGuess) {
      // Unknown donor: keep the words out of the item name and report what was heard.
      let j = i + ml;
      while (j < end && !readNumber(tokens, j) && !UNIT_WORDS[tokens[j]] && !looksLikeDateStart(tokens, j)) j++;
      if (j > i + ml) {
        donorGuess = tokens.slice(i + ml, j).join(' ');
        take(i, j - i);
      }
    }
  }

  // 2. expiry date — after a marker first, then any unmarked month-name / ISO date
  let expiresOn = null;
  for (let i = 0; i < tokens.length && !expiresOn; i++) {
    if (used[i]) continue;
    const ml = markerAt(tokens, i, DATE_MARKERS);
    if (!ml) continue;
    let j = i + ml;
    if (tokens[j] === 'on' || tokens[j] === 'date') j += 1;
    const d = readDate(tokens, j, now);
    if (d && !used.slice(j, j + d.length).some(Boolean)) {
      expiresOn = d.date;
      take(i, j - i + d.length);
    } else {
      take(i, ml); // "expiring soon": never let the marker leak into the item name
    }
  }
  for (let i = 0; i < tokens.length && !expiresOn; i++) {
    if (used[i] || !looksLikeDateStart(tokens, i)) continue;
    const d = readDate(tokens, i, now);
    if (d && !used.slice(i, i + d.length).some(Boolean)) {
      expiresOn = d.date;
      take(i, d.length);
    }
  }

  // 3. quantity — first number expression not already used
  let quantity = null;
  let qtyEnd = -1;
  for (let i = 0; i < tokens.length && quantity === null; i++) {
    if (used[i]) continue;
    const n = readNumber(tokens, i);
    if (n && !used.slice(i, i + n.length).some(Boolean) && n.value > 0) {
      quantity = n.value;
      take(i, n.length);
      qtyEnd = i + n.length;
    }
  }

  // 4. unit — right after the quantity, else the first unit word
  let unit = null;
  const unitAt = (i) => (!used[i] && UNIT_WORDS[tokens[i]] ? UNIT_WORDS[tokens[i]] : null);
  if (qtyEnd >= 0 && unitAt(qtyEnd)) {
    unit = unitAt(qtyEnd);
    take(qtyEnd, 1);
  } else {
    for (let i = 0; i < tokens.length && !unit; i++) {
      if (unitAt(i)) { unit = unitAt(i); take(i, 1); }
    }
  }
  // "a can of soup" → 1
  if (quantity === null && unit) {
    const ui = tokens.findIndex((t, i) => used[i] && UNIT_WORDS[t]);
    if (ui > 0 && (tokens[ui - 1] === 'a' || tokens[ui - 1] === 'an')) { quantity = 1; take(ui - 1, 1); }
  }

  // 5. item name — leftover words without fillers (leading verbs dropped)
  let start = 0;
  while (start < tokens.length && (used[start] || LEADING.has(tokens[start]))) start++;
  const words = tokens.filter((t, i) => i >= start && !used[i] && !FILLERS.has(t));
  const itemName = words.length ? capitalise(words.join(' ')) : null;

  // 6. category
  const category = itemName ? categoryFor(itemName)?.category ?? null : null;

  const draft = {
    quantity,
    unit: unit ?? 'item',
    itemName,
    category,
    expiresOn,
    donorId,
    donorName,
    donorGuess: donorId ? null : donorGuess,
    location: defaultLocation(category),
  };
  const missing = REQUIRED_FIELDS.filter((f) => {
    if (f === 'expiresOn' && category === 'Hygiene') return false;
    return draft[f] === null || draft[f] === undefined;
  });
  return {
    ...draft,
    confidence: (REQUIRED_FIELDS.length - missing.length) / REQUIRED_FIELDS.length,
    missing,
    heard: String(text ?? '').trim(),
  };
}

export default parseIntake;
