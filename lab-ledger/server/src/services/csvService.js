import { getContext } from '../context.js';
import { isSuperuser } from '../core/permissions.js';
import { formatChecklist } from '../core/checklist.js';
import { buildFilter, buildSort, populateSpecs } from './resourceService.js';

export const EXPORT_LIMIT = 10000;

/**
 * Escapes one CSV cell (RFC 4180). Cells starting with = + - @ are prefixed with a quote so
 * spreadsheets do not execute them as formulas (CSV injection).
 */
export function csvCell(value) {
  if (value === null || value === undefined) return '';
  let s = value instanceof Date ? value.toISOString() : Array.isArray(value) ? value.join('; ') : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function plain(v) {
  if (v && typeof v === 'object' && !(v instanceof Date) && !Array.isArray(v)) {
    return v.name ?? v.title ?? v.email ?? String(v._id ?? '');
  }
  return v;
}

/**
 * Builds a CSV for the records matching the same filters/search/sort as the list endpoint.
 * Secret and hidden fields are never exported. Capped at EXPORT_LIMIT rows.
 * @returns {Promise<{ csv: string, rows: number }>}
 */
export async function exportCsv(resource, query, user) {
  const { config, registry } = getContext();
  const includeDeleted = query.includeDeleted === 'true' && isSuperuser(user?.role, config.roles);
  const filter = buildFilter(resource.def, query, { includeDeleted });
  const sort = buildSort(resource.def, query.sort);

  const columns = Object.entries(resource.def.fields).filter(([, s]) => !s.secret && !s.hidden);
  let cursor = resource.model.find(filter).sort(sort).limit(EXPORT_LIMIT);
  for (const p of populateSpecs(resource.def, registry)) cursor = cursor.populate(p);
  const items = await cursor.lean();

  const header = [...columns.map(([n, s]) => s.label ?? n), 'Created'].map(csvCell).join(',');
  const lines = items.map((it) => [...columns.map(([n, s]) => (s.type === 'checklist' ? formatChecklist(it[n]) : plain(it[n]))), it.createdAt].map(csvCell).join(','));
  return { csv: `\uFEFF${[header, ...lines].join('\r\n')}\r\n`, rows: items.length };
}
