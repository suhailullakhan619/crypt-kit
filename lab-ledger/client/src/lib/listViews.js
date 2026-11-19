/** Pure helpers for the list page: sorting, board and calendar views, "Mine" filter. */

/** URL params that belong to the page itself and are never record filters. */
export const PAGE_PARAMS = ['page', 'q', 'sort', 'view', 'month'];

/** Params sent to the API for list/board/calendar queries (no view-only params). */
export function apiParams(params) {
  const out = Object.fromEntries(params instanceof URLSearchParams ? params.entries() : Object.entries(params));
  delete out.view;
  delete out.month;
  return out;
}

// ── Sorting ───────────────────────────────────────────────────────────────────

/** Can a column be sorted? Scalar types only (not ref, text, checklist or multi-value enums). */
export function isSortable(field) {
  if (!field) return false;
  if (field.multiple) return false;
  return ['string', 'number', 'date', 'enum', 'boolean'].includes(field.type);
}

/** `'asc' | 'desc' | null` for `field` given the current `sort` param. */
export function sortDirection(sort, name) {
  if (sort === name) return 'asc';
  if (sort === `-${name}`) return 'desc';
  return null;
}

/** Next `sort` param when a header is clicked: asc, then desc, then back to the default (null). */
export function nextSort(sort, name) {
  const dir = sortDirection(sort, name);
  if (!dir) return name;
  if (dir === 'asc') return `-${name}`;
  return null;
}

// ── Views ─────────────────────────────────────────────────────────────────────

/** Field the calendar places records on: `due.field` first, then the first listed date field. */
export function calendarField(resource) {
  const dueName = resource?.due?.field;
  const due = dueName && resource.fields.find((f) => f.name === dueName);
  if (due) return due;
  return resource?.fields?.find((f) => f.type === 'date' && f.list) ?? null;
}

/** Views this resource supports, in switcher order. */
export function availableViews(resource) {
  const views = ['list'];
  if (resource?.statusFlow) views.push('board');
  if (calendarField(resource)) views.push('calendar');
  return views;
}

const viewKey = (key) => `crypt_listview_${key}`;

/** Remembered view for a resource (localStorage), or null. */
export function loadView(key) {
  try { return localStorage.getItem(viewKey(key)); } catch { return null; }
}

/** Remembers the view for a resource. */
export function saveView(key, view) {
  try { localStorage.setItem(viewKey(key), view); } catch { /* private mode */ }
}

/** The view to show: URL param, then remembered, then list; always one the resource supports. */
export function resolveView(resource, param) {
  const ok = availableViews(resource);
  if (param && ok.includes(param)) return param;
  const stored = loadView(resource.key);
  return stored && ok.includes(stored) ? stored : 'list';
}

/** First filterable single `ref: 'User'` field, used by the "Mine" chip. */
export function mineField(resource) {
  return resource?.fields?.find((f) => f.type === 'ref' && f.ref === 'User' && f.filter) ?? null;
}

// ── Board ─────────────────────────────────────────────────────────────────────

/** Statuses a card may move to from `from` (transitions minus workflow-only). */
export function allowedTargets(resource, from) {
  const flow = resource?.statusFlow;
  if (!flow) return [];
  const locked = flow.workflowOnly ?? [];
  return (flow.transitions?.[from] ?? []).filter((t) => t !== from && !locked.includes(t));
}

/**
 * Board columns in `transitions` order (sources first, then targets never seen as a source).
 * The soft-delete status is hidden unless `statusFilter` asks for it; a status filter narrows to that column.
 */
export function boardColumns(resource, statusFilter) {
  const flow = resource?.statusFlow;
  if (!flow) return [];
  const seen = [];
  const add = (v) => { if (!seen.includes(v)) seen.push(v); };
  for (const [from, tos] of Object.entries(flow.transitions ?? {})) { add(from); tos.forEach(add); }
  const sf = resource.fields.find((f) => f.name === flow.field);
  (sf?.values ?? []).forEach(add);
  const sd = resource.softDelete;
  let cols = seen;
  if (sd && sd.field === flow.field && sd.value !== statusFilter) cols = cols.filter((v) => v !== sd.value);
  if (statusFilter) cols = cols.filter((v) => v === statusFilter);
  return cols;
}

// ── Calendar ──────────────────────────────────────────────────────────────────

const p2 = (n) => String(n).padStart(2, '0');

/** Local `YYYY-MM-DD` for a Date. */
export function ymd(d) {
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}

/** `YYYY-MM` for a Date. */
export function ym(d) {
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}`;
}

/** Parses `YYYY-MM`; falls back to the month of `fallback`. Returns `{ year, month }` (month 0-11). */
export function parseMonth(value, fallback = new Date()) {
  const m = /^(\d{4})-(\d{2})$/.exec(value ?? '');
  if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12) return { year: Number(m[1]), month: Number(m[2]) - 1 };
  return { year: fallback.getFullYear(), month: fallback.getMonth() };
}

/** `YYYY-MM` shifted by `delta` months. */
export function shiftMonth({ year, month }, delta) {
  return ym(new Date(year, month + delta, 1));
}

/** Weeks (Monday first) covering the month: array of 7-day arrays of Dates. */
export function monthWeeks({ year, month }) {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - ((first.getDay() + 6) % 7));
  const last = new Date(year, month + 1, 0);
  const end = new Date(year, month, last.getDate() + (6 - ((last.getDay() + 6) % 7)));
  const weeks = [];
  for (let d = new Date(start); d <= end; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + i)));
  }
  return weeks;
}

/** Day key (`YYYY-MM-DD`) a record sits on, or null. Date-only values are not shifted by time zone. */
export function dayKey(field, value) {
  if (!value) return null;
  if (field?.time) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : ymd(d);
  }
  const s = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

/** Is the record overdue? Needs a `due` rule, an open status and a day before `today`. */
export function isOverdue(resource, item, key, today) {
  const due = resource?.due;
  if (!due || !key || key >= today) return false;
  const status = item[due.status];
  if (Array.isArray(due.from)) return due.from.includes(status);
  return status !== due.to;
}
