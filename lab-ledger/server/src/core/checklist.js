import { httpError } from '../utils/httpError.js';

export const CHECKLIST_DEFAULT_MAX = 50;
export const CHECKLIST_HARD_MAX = 200;
export const CHECKLIST_TEXT_MAX = 200;

/** Effective maximum number of items for a checklist field spec (default 50, hard cap 200). */
export function checklistMax(spec) {
  const m = typeof spec?.max === 'number' ? Math.floor(spec.max) : CHECKLIST_DEFAULT_MAX;
  return Math.max(1, Math.min(m, CHECKLIST_HARD_MAX));
}

/**
 * Validates and cleans a checklist value: an array of `{ text, done }`. Text is trimmed, empty
 * items are dropped, extra keys are removed. `null`/`undefined`/'' mean an empty list.
 * @param {{ max?: number, label?: string }} spec
 * @param {string} name - field name, used in error messages
 * @param {unknown} value
 * @returns {{ text: string, done: boolean }[]}
 * @throws {Error} 400 naming the field
 */
export function normalizeChecklist(spec, name, value) {
  const label = spec?.label ?? name;
  if (value === undefined || value === null || value === '') return [];
  if (!Array.isArray(value)) throw httpError(400, `${label} must be a list of { text, done } items`, { fields: { [name]: 'Must be a list' } });
  const out = [];
  for (const item of value) {
    if (item === null || typeof item !== 'object' || Array.isArray(item) || (item.text !== undefined && typeof item.text !== 'string')) {
      throw httpError(400, `${label}: each item needs a text`, { fields: { [name]: 'Each item needs a text' } });
    }
    const text = (item.text ?? '').trim();
    if (!text) continue;
    if (text.length > CHECKLIST_TEXT_MAX) {
      throw httpError(400, `${label}: an item is longer than ${CHECKLIST_TEXT_MAX} characters`, { fields: { [name]: `Items are at most ${CHECKLIST_TEXT_MAX} characters` } });
    }
    out.push({ text, done: item.done === true });
  }
  const max = checklistMax(spec);
  if (out.length > max) throw httpError(400, `${label} has too many items (max ${max})`, { fields: { [name]: `At most ${max} items` } });
  return out;
}

/** `[{text:'a',done:true},{text:'b',done:false}]` → `[x] a; [ ] b` (semicolons in text become commas). */
export function formatChecklist(items) {
  if (!Array.isArray(items)) return '';
  return items.map((i) => `[${i?.done ? 'x' : ' '}] ${String(i?.text ?? '').replace(/;/g, ',')}`).join('; ');
}

/** Parses the `[x] a; [ ] b` format back into items. Items without a marker are not done. */
export function parseChecklist(str) {
  return String(str ?? '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const m = /^\[([ xX]?)\]\s*(.*)$/.exec(part);
      return m ? { text: m[2], done: m[1].toLowerCase() === 'x' } : { text: part, done: false };
    });
}

/** `2/5 done` summary used by reports. */
export function checklistSummary(items) {
  if (!Array.isArray(items) || !items.length) return '—';
  return `${items.filter((i) => i?.done).length}/${items.length} done`;
}
