import mongoose from 'mongoose';
import { getContext, now } from '../context.js';
import { isSuperuser } from '../core/permissions.js';
import { checkGenericTransition } from '../core/statusFlow.js';
import { OBJECT_ID_RE } from '../core/fieldTypes.js';
import * as activity from './activityService.js';
import { httpError } from '../utils/httpError.js';
import { escapeRegex } from '../utils/escapeRegex.js';
import { paginate, envelope } from '../utils/pagination.js';
import { diff } from '../utils/diff.js';
import { withTransaction } from '../utils/transaction.js';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const DAY = 24 * 60 * 60 * 1000;

// ── Pure helpers ──────────────────────────────────────────────────────────────

/**
 * Keeps only declared fields (Req 5.4). System fields can never be declared, so they are
 * always dropped. Empty strings become null for non-text types (HTML forms send '').
 * Populated refs ({ _id, name }) are reduced to their id.
 * @param {{ fields: object }} def
 * @param {unknown} input
 * @returns {Record<string, any>}
 */
export function sanitize(def, input) {
  if (!isObj(input)) return {};
  const out = {};
  for (const [name, spec] of Object.entries(def.fields)) {
    if (!Object.prototype.hasOwnProperty.call(input, name)) continue;
    let v = input[name];
    if (v === undefined) continue;
    if (v === '' && spec.type !== 'string' && spec.type !== 'text') v = null;
    if (spec.type === 'ref' && isObj(v) && v._id !== undefined) v = String(v._id);
    out[name] = v;
  }
  return out;
}

/** The enum field that represents a record's lifecycle status, if any. */
export function statusFieldOf(def) {
  return def.statusFlow?.field ?? def.due?.status ?? def.softDelete?.field ?? null;
}

function castFilterValue(name, spec, raw) {
  if (typeof raw !== 'string') throw httpError(400, `Filter "${name}" must be a single value`);
  switch (spec.type) {
    case 'string':
    case 'text':
      return raw;
    case 'enum':
      if (!spec.values.includes(raw)) throw httpError(400, `Filter "${name}" must be one of: ${spec.values.join(', ')}`);
      return raw;
    case 'number': {
      const n = Number(raw);
      if (raw.trim() === '' || !Number.isFinite(n)) throw httpError(400, `Filter "${name}" must be a number`);
      return n;
    }
    case 'boolean':
      if (raw !== 'true' && raw !== 'false') throw httpError(400, `Filter "${name}" must be true or false`);
      return raw === 'true';
    case 'date': {
      const d = new Date(raw);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(d.getTime())) throw httpError(400, `Filter "${name}" must be YYYY-MM-DD`);
      return { $gte: d, $lt: new Date(d.getTime() + DAY) };
    }
    case 'ref':
      if (!OBJECT_ID_RE.test(raw)) throw httpError(400, `Filter "${name}" must be an id`);
      return new mongoose.Types.ObjectId(raw);
    default:
      throw httpError(400, `Field "${name}" cannot be filtered`);
  }
}

/**
 * Builds a Mongo filter from query params (Req 5.3, 5.6). Only `filter: true` fields are used;
 * values are cast by type so operator objects like `{ $gt: '' }` are rejected with 400.
 * @param {{ fields: object, softDelete?: object }} def
 * @param {Record<string, any>} query
 * @param {{ includeDeleted?: boolean }} [opts]
 */
export function buildFilter(def, query = {}, { includeDeleted = false } = {}) {
  const filter = {};
  for (const [name, spec] of Object.entries(def.fields)) {
    if (!spec.filter || spec.secret) continue;
    const raw = query[name];
    if (raw === undefined || raw === '') continue;
    filter[name] = castFilterValue(name, spec, raw);
  }

  const q = typeof query.q === 'string' ? query.q.trim() : '';
  const searchFields = Object.entries(def.fields).filter(([, s]) => s.search && !s.secret).map(([n]) => n);
  if (q && searchFields.length) {
    const rx = { $regex: escapeRegex(q.slice(0, 100)), $options: 'i' };
    filter.$or = searchFields.map((f) => ({ [f]: rx }));
  }

  const sd = def.softDelete;
  if (sd && !includeDeleted && filter[sd.field] === undefined) filter[sd.field] = { $ne: sd.value };
  return filter;
}

/**
 * Parses `sort` ("field" / "-field") into a stable Mongo sort (with _id tiebreaker).
 * @throws {Error} 400 for unknown or secret fields
 */
export function buildSort(def, sortParam) {
  const raw = typeof sortParam === 'string' && sortParam ? sortParam : def.defaultSort ?? '-createdAt';
  const dir = raw.startsWith('-') ? -1 : 1;
  const field = raw.replace(/^-/, '');
  const spec = def.fields[field];
  if (!(['createdAt', 'updatedAt'].includes(field) || (spec && !spec.secret))) {
    throw httpError(400, `Cannot sort by "${field}"`);
  }
  return { [field]: dir, _id: dir };
}

/** Populate specs for every ref field: `{ path, select }` with the target's title field only. */
export function populateSpecs(def, registry) {
  return Object.entries(def.fields)
    .filter(([, s]) => s.type === 'ref')
    .map(([path, s]) => ({ path, select: registry?.titleFieldFor ? registry.titleFieldFor(s.ref) : 'name' }));
}

function hookCtx(user, session) {
  const { registry } = getContext();
  return { user, registry, session, now: now() };
}

function assertId(id) {
  if (typeof id !== 'string' || !OBJECT_ID_RE.test(id)) throw httpError(404, 'Record not found');
}

// ── Service ───────────────────────────────────────────────────────────────────

/**
 * Paginated, filtered, searchable list (Req 5.3, 5.6).
 * @param {{ key: string, def: object, model: mongoose.Model }} resource
 * @param {Record<string, any>} query
 * @param {{ userId: string, role: string }} user
 * @returns {Promise<{ items: object[], total: number, page: number, pages: number }>}
 */
export async function list(resource, query, user) {
  const { config, registry } = getContext();
  const includeDeleted = query.includeDeleted === 'true' && isSuperuser(user?.role, config.roles);
  const filter = buildFilter(resource.def, query, { includeDeleted });
  const sort = buildSort(resource.def, query.sort);
  const pg = paginate(query);

  let cursor = resource.model.find(filter).sort(sort).skip(pg.skip).limit(pg.limit);
  for (const p of populateSpecs(resource.def, registry)) cursor = cursor.populate(p);
  const [items, total] = await Promise.all([cursor.lean(), resource.model.countDocuments(filter)]);
  return envelope(items, total, pg);
}

/**
 * Single record with refs populated (Req 5.5).
 * @throws {Error} 404 for unknown or malformed ids
 */
export async function get(resource, id) {
  assertId(id);
  const { registry } = getContext();
  let q = resource.model.findById(id);
  for (const p of populateSpecs(resource.def, registry)) q = q.populate(p);
  q = q.populate({ path: 'createdBy', select: 'name' });
  const doc = await q.lean();
  if (!doc) throw httpError(404, 'Record not found');
  return doc;
}

/**
 * Creates a record inside a transaction, running hooks and logging activity (Req 5.4, 6.1, 16.1).
 * @throws {Error} 400 validation, 409 workflow-only status / duplicate, hook errors
 */
export async function create(resource, body, user) {
  const { def, model, key } = resource;
  let data = sanitize(def, body);

  const sf = def.statusFlow;
  if (sf && data[sf.field] !== undefined && (sf.workflowOnly ?? []).includes(data[sf.field])) {
    throw httpError(409, `Status "${data[sf.field]}" is managed by a workflow and cannot be set directly`);
  }

  const id = await withTransaction(async (session) => {
    const ctx = hookCtx(user, session);
    if (def.hooks?.beforeCreate) {
      const replaced = await def.hooks.beforeCreate(data, ctx);
      if (replaced) data = sanitize(def, replaced);
    }
    const [doc] = await model.create([{ ...data, createdBy: user?.userId }], { session });
    if (def.hooks?.afterCreate) await def.hooks.afterCreate(doc, ctx);
    await activity.record({ actor: user, resource: key, recordId: doc._id, action: 'create', diff: diff(null, doc, def) }, session);
    return doc._id;
  });

  return get(resource, String(id));
}

/**
 * Partially updates a record (Req 5.4, 5.8, 6.1, 16.1, 16.3).
 * @throws {Error} 404 unknown id, 409 illegal status transition, 400 validation
 */
export async function update(resource, id, body, user) {
  assertId(id);
  const { def, model, key } = resource;
  let changes = sanitize(def, body);
  const statusField = statusFieldOf(def);

  await withTransaction(async (session) => {
    const doc = await model.findById(id).session(session);
    if (!doc) throw httpError(404, 'Record not found');

    const sf = def.statusFlow;
    if (sf && changes[sf.field] !== undefined) {
      const check = checkGenericTransition(sf, doc[sf.field], changes[sf.field]);
      if (!check.ok) throw httpError(409, check.message);
    }

    const ctx = hookCtx(user, session);
    if (def.hooks?.beforeUpdate) {
      const replaced = await def.hooks.beforeUpdate(doc, changes, ctx);
      if (replaced) changes = sanitize(def, replaced);
    }

    const before = doc.toObject();
    doc.set(changes);
    await doc.save({ session });
    if (def.hooks?.afterUpdate) await def.hooks.afterUpdate(doc, before, ctx);

    const entries = [{ actor: user, resource: key, recordId: doc._id, action: 'update', diff: diff(before, doc, def) }];
    if (statusField && before[statusField] !== doc[statusField]) {
      entries.push({ actor: user, resource: key, recordId: doc._id, action: 'status', diff: { [statusField]: [before[statusField], doc[statusField]] } });
    }
    await activity.recordMany(entries, session);
  });

  return get(resource, id);
}

/**
 * Soft-deletes (status + timestamp) or hard-deletes a record (Req 5.6, 5.7), running
 * `hooks.beforeDelete` / `hooks.afterDelete` inside the same transaction (Req 16.10).
 * @returns {Promise<{ soft: boolean, item?: object }>}
 * @throws {Error} 404 unknown or already-deleted record; any httpError thrown by beforeDelete
 */
export async function remove(resource, id, user) {
  assertId(id);
  const { def, model, key } = resource;
  const sd = def.softDelete;

  await withTransaction(async (session) => {
    const doc = await model.findById(id).session(session);
    if (!doc || (sd && doc[sd.field] === sd.value)) throw httpError(404, 'Record not found');

    const ctx = hookCtx(user, session);
    if (def.hooks?.beforeDelete) await def.hooks.beforeDelete(doc, ctx);

    const before = doc.toObject();
    if (sd) {
      doc[sd.field] = sd.value;
      doc[sd.at] = ctx.now;
      await doc.save({ session, validateModifiedOnly: true });
    } else {
      await model.deleteOne({ _id: doc._id }, { session });
    }

    if (def.hooks?.afterDelete) await def.hooks.afterDelete(doc, ctx);
    await activity.record(
      { actor: user, resource: key, recordId: doc._id, action: 'delete', diff: sd ? diff(before, doc, def) : diff(before, null, def) },
      session
    );
  });

  return sd ? { soft: true, item: await get(resource, id) } : { soft: false };
}
