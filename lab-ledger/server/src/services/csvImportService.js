import mongoose from 'mongoose';
import { getContext } from '../context.js';
import { OBJECT_ID_RE, isResourceRef } from '../core/fieldTypes.js';
import { httpError } from '../utils/httpError.js';
import * as resourceService from './resourceService.js';

export const IMPORT_MAX_ROWS = 1000;

/**
 * RFC 4180 CSV parser: quoted cells, escaped quotes, CRLF/LF, BOM. Blank lines are skipped.
 * @param {string} text
 * @returns {string[][]}
 */
export function parseCsv(text) {
  const src = String(text ?? '').replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  let touched = false;

  const endCell = () => { row.push(cell); cell = ''; };
  const endRow = () => {
    endCell();
    if (touched || row.some((c) => c !== '')) rows.push(row);
    row = [];
    touched = false;
  };

  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i += 1; } else quoted = false;
      } else cell += ch;
    } else if (ch === '"' && cell === '') { quoted = true; touched = true; }
    else if (ch === ',') { endCell(); touched = true; }
    else if (ch === '\n') endRow();
    else if (ch === '\r') { if (src[i + 1] === '\n') i += 1; endRow(); }
    else { cell += ch; touched = true; }
  }
  if (quoted) throw httpError(400, 'CSV has an unterminated quoted cell');
  if (cell !== '' || row.length) endRow();
  return rows;
}

const norm = (s) => String(s).trim().toLowerCase();

/** Maps CSV headers to field names by label or name (case-insensitive). */
function mapHeaders(def, headers) {
  const byKey = new Map();
  for (const [name, spec] of Object.entries(def.fields)) {
    if (spec.secret) continue;
    byKey.set(norm(name), name);
    if (spec.label) byKey.set(norm(spec.label), name);
  }
  const columns = [];
  const ignored = [];
  headers.forEach((h, idx) => {
    const field = byKey.get(norm(h));
    if (field && !columns.some((c) => c.field === field)) columns.push({ field, idx });
    else ignored.push(h);
  });
  return { columns, ignored };
}

/** Finds the id of the record a ref cell points to (ObjectId, or title / email lookup). */
async function resolveRef(spec, raw, cache) {
  const value = raw.trim();
  if (OBJECT_ID_RE.test(value)) return value;
  const cacheKey = `${spec.ref}|${norm(value)}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  const { registry } = getContext();
  let model;
  let fields;
  if (isResourceRef(spec.ref)) {
    const target = registry.get(spec.ref);
    model = target.model;
    fields = [target.def.titleField ?? 'name'];
  } else {
    model = mongoose.model(spec.ref);
    fields = ['email', 'name'];
  }
  const rx = new RegExp(`^${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
  const doc = await model.findOne({ $or: fields.map((f) => ({ [f]: rx })) }).select('_id').lean();
  const id = doc ? String(doc._id) : null;
  cache.set(cacheKey, id);
  return id;
}

/** Converts one cell to the field's type. Returns { value } or { error }. */
async function coerce(name, spec, raw, cache) {
  const v = raw.trim();
  if (v === '') return { value: undefined };
  switch (spec.type) {
    case 'string':
    case 'text':
      return { value: raw };
    case 'number': {
      const n = Number(v);
      return Number.isFinite(n) ? { value: n } : { error: `${name}: "${v}" is not a number` };
    }
    case 'boolean':
      if (/^(true|yes|y|1)$/i.test(v)) return { value: true };
      if (/^(false|no|n|0)$/i.test(v)) return { value: false };
      return { error: `${name}: "${v}" is not true/false` };
    case 'date': {
      const d = new Date(v);
      return Number.isNaN(d.getTime()) ? { error: `${name}: "${v}" is not a valid date (use YYYY-MM-DD)` } : { value: d };
    }
    case 'enum': {
      const parts = spec.multiple ? v.split(/[;|]/).map((p) => p.trim()).filter(Boolean) : [v];
      const out = [];
      for (const p of parts) {
        const hit = spec.values.find((x) => norm(x) === norm(p));
        if (!hit) return { error: `${name}: "${p}" must be one of ${spec.values.join(', ')}` };
        out.push(hit);
      }
      return { value: spec.multiple ? out : out[0] };
    }
    case 'ref': {
      const id = await resolveRef(spec, v, cache);
      return id ? { value: id } : { error: `${name}: no ${spec.ref} matches "${v}"` };
    }
    default:
      return { error: `${name}: unsupported field type` };
  }
}

/**
 * Validates (and, unless `dryRun`, creates) records from CSV text. Rows are created one by one
 * through the normal create path, so hooks, transactions and the activity log all apply.
 * A dry run validates types, required fields and schema rules; hook- and database-level rules
 * (unique indexes, business rules) are only checked when the rows are really created.
 *
 * @returns {Promise<{ dryRun: boolean, total: number, valid: number, created: number,
 *   ignoredColumns: string[], preview: object[], errors: {row:number, message:string}[] }>}
 */
export async function importCsv(resource, csvText, user, { dryRun = true } = {}) {
  const { def, model } = resource;
  const rows = parseCsv(csvText);
  if (rows.length < 2) throw httpError(400, 'CSV needs a header row and at least one data row');
  if (rows.length - 1 > IMPORT_MAX_ROWS) throw httpError(400, `CSV has too many rows (max ${IMPORT_MAX_ROWS})`);

  const [headers, ...body] = rows;
  const { columns, ignored } = mapHeaders(def, headers);
  if (!columns.length) throw httpError(400, 'No CSV column matches a field of this resource');

  const cache = new Map();
  const errors = [];
  const good = [];
  const seenUnique = new Map();
  const uniqueFields = Object.entries(def.fields).filter(([, s]) => s.unique).map(([n]) => n);

  for (let i = 0; i < body.length; i += 1) {
    const rowNo = i + 2; // spreadsheet line number (header is line 1)
    const data = {};
    const rowErrors = [];
    for (const { field, idx } of columns) {
      const r = await coerce(field, def.fields[field], body[i][idx] ?? '', cache);
      if (r.error) rowErrors.push(r.error);
      else if (r.value !== undefined) data[field] = r.value;
    }

    if (!rowErrors.length) {
      const sf = def.statusFlow;
      if (sf && data[sf.field] !== undefined && (sf.workflowOnly ?? []).includes(data[sf.field])) {
        rowErrors.push(`${sf.field}: "${data[sf.field]}" is managed by a workflow and cannot be imported`);
      }
      const invalid = new model(resourceService.sanitize(def, data)).validateSync();
      if (invalid) for (const e of Object.values(invalid.errors)) rowErrors.push(e.message);
      for (const f of uniqueFields) {
        if (data[f] === undefined) continue;
        const k = `${f}|${norm(data[f])}`;
        if (seenUnique.has(k)) rowErrors.push(`${f}: "${data[f]}" is duplicated on row ${seenUnique.get(k)}`);
        else seenUnique.set(k, rowNo);
      }
    }

    if (rowErrors.length) errors.push({ row: rowNo, message: rowErrors.join('; ') });
    else good.push({ row: rowNo, data });
  }

  let created = 0;
  if (!dryRun) {
    for (const { row, data } of good) {
      try {
        await resourceService.create(resource, data, user);
        created += 1;
      } catch (err) {
        errors.push({ row, message: err.message || 'Could not create record' });
      }
    }
    errors.sort((a, b) => a.row - b.row);
  }

  return {
    dryRun,
    total: body.length,
    valid: good.length,
    created,
    ignoredColumns: ignored,
    preview: good.slice(0, 5).map((g) => g.data),
    errors: errors.slice(0, 100),
  };
}
