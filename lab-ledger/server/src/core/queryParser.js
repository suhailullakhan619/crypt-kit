import { escapeRegex } from '../utils/escapeRegex.js';
import { spokenValue, synonymsOf } from './utterance.js';
import { parseRange } from './when.js';

/**
 * Turns a normalised question into a structured query (see queryEngine.runQuery) without any
 * language model: it finds the resource by its spoken names (plurals and one-letter typos allowed),
 * then reads off filters (statuses and other values, "overdue", "mine", "assigned to X"), a date range
 * ("due this week"), a text search ("about candles"), a limit ("top 3") and sums ("total minutes").
 * Returns null when the text names nothing it knows, so unrelated text stays UNKNOWN.
 */

const singular = (w) => w.replace(/ies$/, 'y').replace(/(ss|us)$/, '$1').replace(/s$/, '');
const withinOne = (a, b) => {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (a.length < b.length) j++;
    else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
};
const sameWord = (w, s) => {
  const a = singular(w);
  const b = singular(s);
  return a === b || (b.length >= 5 && a.length >= 4 && withinOne(a, b));
};

/** Index of the first place `phrase` (space separated words) occurs in `words`, or -1. */
function findPhrase(words, phrase) {
  const parts = phrase.split(' ');
  for (let i = 0; i + parts.length <= words.length; i++) {
    if (parts.every((p, k) => sameWord(words[i + k], p))) return i;
  }
  return -1;
}

const variants = (syn) => [...new Set([syn, syn.replace(/-/g, ' '), syn.replace(/-/g, '')])];
const NOT_NAMES = new Set(['me', 'my', 'the', 'a', 'an', 'all', 'everyone', 'anyone', 'nobody', 'none', 'someone', 'somebody', 'this', 'that', 'them', 'us', 'you']);
const SEARCH_END = '(?= (?:that|which|who|with|due|in|on|this|next|last|assigned|owned|for|by|from|and|are|is|have|has|created|added)\\b|$)';
const SEARCH_RE = new RegExp(`\\b(?:about|called|named|titled|containing|contains?|mentioning|mentions?|matching|regarding|concerning|search for|looking for|look for) (?:the |a |an )?(.+?)${SEARCH_END}`);
const COUNT_RE = /^(?:how many|count|number of|total number of|what is the number of|what s the number of)\b|\bhow many\b/;
const SUM_RE = /\b(how many|how much|total|sum|add up|average|avg|mean)\b/;
const MINE_RE = /\b(my|mine|assigned to me|owned by me|for me|i have|ive got|im responsible|i am responsible|i (?:own|owned|log|logged|created|added|made|completed|finished|got))\b/;
const OVERDUE_RE = /\b(overdue|late|past due|behind schedule)\b/;
const OPEN_RE = /\b(unfinished|incomplete|outstanding|remaining|undone|todo|to do|not done|not finished|not completed|still open|still to do)\b/;

/** Number fields a sum/average question can mean, by spoken label ("minutes", "progress"). */
function numberFieldIn(def, words, t) {
  for (const [name, f] of Object.entries(def.fields)) {
    if (f.type !== 'number' || f.secret) continue;
    const label = spokenValue(f.label ?? name).replace(/\(.*?\)|%/g, '').trim();
    const spoken = label.split(' ').filter((w) => w.length > 2);
    const timey = /\bminutes?\b/.test(label) && /\b(?:time(?! (?:log|entries|entry))|hours?)\b/.test(t);
    if (timey || (spoken.length && spoken.every((w) => words.some((x) => sameWord(x, w))))) return { name, f, label };
  }
  return null;
}

/**
 * @param {string} t normalised question
 * @param {{ registry: { all: () => any[] }, now?: Date, tz?: number }} ctx
 * @returns {object|null} spec with `resource`, or `{ all: true, ... }` for questions about everything
 */
export function parseQuestion(t, { registry, now = new Date(), tz = 0 }) {
  if (!t || t.length > 300) return null;
  const words = t.split(' ');
  const resources = registry?.all() ?? [];

  // 1. which resource
  let best = null;
  for (const r of resources) {
    for (const syn of synonymsOf(r.def).flatMap(variants)) {
      const at = findPhrase(words, syn);
      if (at < 0) continue;
      const size = syn.split(' ').length;
      if (!best || size > best.size || (size === best.size && at < best.at)) best = { r, at, size, syn };
    }
  }

  // 2. what kind of answer
  const wantsSum = SUM_RE.test(t);
  let sumField = null;
  if (wantsSum) {
    const pool = best ? [best.r] : resources;
    for (const r of pool) {
      sumField = numberFieldIn(r.def, words, t);
      if (sumField) { if (!best) best = { r, at: 0, size: 0 }; break; }
    }
    // "how many notes" names the records, not a number field
    if (sumField && best.size > 0 && /\bhow many\b/.test(t) && !/\b(minutes?|hours?|time)\b/.test(t)) sumField = null;
  }

  // 3. date range, then the rest of the text without it
  const range = parseRange(t, now, tz);
  const rest = range ? range.rest : t;
  const overdue = OVERDUE_RE.test(t);
  const mine = MINE_RE.test(t);
  const mentionsDue = /\b(due|deadline|deadlines|by|before|until)\b/.test(t);

  if (!best) {
    // no resource named: still answer "what is overdue / due this week" across everything
    if (overdue || (mentionsDue && range)) return { all: true, overdue, openOnly: !overdue && !!range, range: range && { from: range.from, to: range.to, label: range.label }, mine, limit: 5 };
    const m = t.match(/^(?:find|search(?: for)?|look for|looking for) (?:the |a |an )?(.{2,60})$/);
    return m ? { all: true, search: m[1], limit: 3 } : null;
  }

  const { r } = best;
  const { def } = r;
  const spec = { resource: r.key, aggregate: 'list', filters: {}, exclude: {} };
  if (sumField) { spec.aggregate = /\b(average|avg|mean)\b/.test(t) ? 'avg' : 'sum'; spec.field = sumField.name; if (/\bhours?\b/.test(t) && /minute/.test(sumField.label)) spec.unit = 'hours'; }
  else if (COUNT_RE.test(t) || /\b(are|is) there\b/.test(t) && /\bhow many\b/.test(t)) spec.aggregate = 'count';

  // 4. values of enum fields ("high priority", "open", "not done")
  const consumed = [];
  for (const [name, f] of Object.entries(def.fields)) {
    if (f.type !== 'enum' || f.multiple || !f.filter || f.secret) continue;
    for (const value of f.values) {
      const phrase = escapeRegex(spokenValue(value));
      const m = t.match(new RegExp(`\\b(?:(not|isnt|arent|except|excluding|without) (?:the |a )?)?${phrase}\\b`));
      if (!m || consumed.includes(value)) continue;
      consumed.push(value);
      if (def.due && name === def.due.status && value === def.due.to) { if (!m[1]) spec.overdue = true; continue; }
      if (m[1]) (spec.exclude[name] ??= []).push(value);
      else if (spec.filters[name] === undefined) spec.filters[name] = value;
    }
  }
  if (overdue && def.due) spec.overdue = true;
  if (OPEN_RE.test(t) && def.due && spec.filters[def.due.status] === undefined && !spec.overdue) spec.openOnly = true;
  if (mine) spec.mine = true;
  const who = t.match(/\b(?:assigned to|owned by|belonging to|assigned|owned) ([a-z]{2,20})\b/);
  if (who && !NOT_NAMES.has(who[1]) && !spec.mine) spec.assignee = who[1];

  // 5. date range on the right field
  if (range) {
    const dates = Object.entries(def.fields).filter(([, f]) => f.type === 'date' && !f.secret).map(([n]) => n);
    const listed = Object.entries(def.fields).find(([, f]) => f.type === 'date' && f.list && !f.secret)?.[0];
    const created = /\b(created|added|made|new|started|opened|signed up)\b/.test(t);
    const field = created ? 'createdAt' : mentionsDue || overdue ? def.due?.field ?? listed ?? dates[0] ?? 'createdAt' : def.due?.field ?? listed ?? dates[0] ?? 'createdAt';
    spec.range = { field, from: range.from, to: range.to, label: range.label };
    if (mentionsDue && def.due && field === def.due.field && range.to > now && !spec.overdue && spec.filters[def.due.status] === undefined && !Object.keys(spec.exclude).length) spec.openOnly = true;
  }

  // 6. text search, limit and order
  // take the resource's own name out first, so "find tasks about candles" searches for "candles"
  let bare = rest;
  if (best.syn) {
    const rw = rest.split(' ');
    const at = findPhrase(rw, best.syn);
    if (at >= 0) bare = [...rw.slice(0, at), ...rw.slice(at + best.syn.split(' ').length)].join(' ');
  }
  const search = bare.match(SEARCH_RE) ?? bare.match(/^(?:find|search(?: for)?|look(?:ing)? for) (?:the |a |an |some )?(.{2,60})$/);
  if (search) {
    const term = search[1].replace(/\b(please|thanks)\b/g, '').trim();
    const named = synonymsOf(def).some((s) => variants(s).some((v) => term === v || sameWord(term, v)));
    if (term.length >= 2 && !named && !consumed.some((v) => spokenValue(v) === term)) spec.search = term;
  }
  const lim = rest.match(/\b(?:top|first|latest|newest|oldest|recent|next|last) (\d{1,2})\b/);
  if (lim) spec.limit = Number(lim[1]);
  if (/\b(latest|newest|recent|recently|last added)\b/.test(rest)) spec.sort = '-createdAt';
  if (/\boldest\b/.test(rest)) spec.sort = 'createdAt';

  // 7. is this really a question about the resource? (guards against stray words matching a name)
  const asks = COUNT_RE.test(t) || wantsSum || /\b(which|what|list|show|give|find|display|any|tell|who|see|get|are there|do i have|do we have|is there|have i|did i|am i|how)\b/.test(t)
    || best.at === 0 || spec.overdue || spec.mine || spec.openOnly || !!spec.sort || !!spec.limit || !!spec.range || Object.keys(spec.filters).length > 0 || Object.keys(spec.exclude).length > 0 || !!spec.search;
  if (!asks) return null;
  if (words.length > 28) return null;
  return spec;
}
