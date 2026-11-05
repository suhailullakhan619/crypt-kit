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
    case 'date': return formatDate(value);
    case 'boolean': return value ? 'Yes' : 'No';
    case 'enum': return Array.isArray(value) ? (value.length ? value.map(humanise).join(', ') : '—') : humanise(value);
    case 'ref': return typeof value === 'object' ? value.name ?? value.title ?? value.code ?? '—' : String(value);
    default: return String(value);
  }
}

/** Value suitable for an <input> of the field's type. */
export function inputValue(field, value) {
  if (value === null || value === undefined) return field.type === 'boolean' ? false : field.type === 'enum' && field.multiple ? [] : '';
  if (field.type === 'date') return String(value).slice(0, 10);
  if (field.type === 'ref') return typeof value === 'object' ? String(value._id ?? '') : String(value);
  return value;
}
