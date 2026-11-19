import { humanise } from './utils';

const dateFmt = new Intl.DateTimeFormat(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
const dateTimeFmt = new Intl.DateTimeFormat(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const rel = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

export function formatDate(v) {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : dateFmt.format(d);
}

export function formatDateTime(v) {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : dateTimeFmt.format(d);
}

/** "3 days ago", "in 2 hours" */
export function timeAgo(v, now = Date.now()) {
  const diff = new Date(v).getTime() - now;
  const abs = Math.abs(diff);
  const units = [['day', 86400000], ['hour', 3600000], ['minute', 60000]];
  for (const [unit, ms] of units) if (abs >= ms) return rel.format(Math.round(diff / ms), unit);
  return 'just now';
}

/** Display text for a field value according to its meta field definition. */
export function displayValue(field, value) {
  if (value === null || value === undefined || value === '') return '—';
  switch (field?.type) {
    case 'date': return field.time ? formatDateTime(value) : formatDate(value);
    case 'boolean': return value ? 'Yes' : 'No';
    case 'enum': return Array.isArray(value) ? (value.length ? value.map(humanise).join(', ') : '—') : humanise(value);
    case 'checklist': return Array.isArray(value) && value.length ? `${value.filter((i) => i?.done).length}/${value.length}` : '—';
    case 'ref': return typeof value === 'object' ? value.name ?? value.title ?? value.code ?? '—' : String(value);
    default: return String(value);
  }
}

/** ISO timestamp -> 'YYYY-MM-DDTHH:mm' in the browser's time zone, for <input type=datetime-local>. */
export function toLocalInput(v) {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Value suitable for an <input> of the field's type. */
export function inputValue(field, value) {
  if (field.type === 'checklist') return Array.isArray(value) ? value.map((i) => ({ text: String(i?.text ?? ''), done: !!i?.done })) : [];
  if (value === null || value === undefined) return field.type === 'boolean' ? false : field.type === 'enum' && field.multiple ? [] : '';
  if (field.type === 'date' && field.time) return toLocalInput(value);
  if (field.type === 'date') return String(value).slice(0, 10);
  if (field.type === 'ref') return typeof value === 'object' ? String(value._id ?? '') : String(value);
  return value;
}

/**
 * Human title of a record: the title field rendered with its own field type, so a title that is a
 * reference (a calibration's equipment, a loan's item) shows the target's name, never "[object Object]".
 */
export function recordTitle(resource, item) {
  const name = resource?.titleField ?? resource?.fields?.[0]?.name;
  const spec = resource?.fields?.find((f) => f.name === name) ?? {};
  const text = displayValue(spec, item?.[name]);
  return text === '—' ? 'Untitled' : text;
}