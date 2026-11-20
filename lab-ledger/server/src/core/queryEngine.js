import { escapeRegex } from '../utils/escapeRegex.js';
import { can } from './permissions.js';
import User from '../models/User.js';

/**
 * Read-only query engine behind the chat assistant. A question becomes a small structured spec
 * (see `runQuery`), so the rule-based parser and an optional language model both end up here. The
 * model never sees the database: it can only ask for specs, and every spec is checked against the
 * asker's read permission, runs against declared fields only, and is capped in size.
 */
export const MAX_LIMIT = 10;
const SUM_CAP = 5000;
const DAY = 86400000;

/** Resources `user` may read. */
export function readableResources(registry, config, user) {
  return (registry?.all() ?? []).filter((r) => can(user.role, r.def, 'read', config.roles));
}

/** The field that says who a record belongs to (owner, assignee, person…), or null. */
export function ownerField(def) {
  const refs = Object.entries(def.fields).filter(([, f]) => f.type === 'ref' && f.ref === 'User' && !f.secret);
  const pref = ['owner', 'assignee', 'assignedTo', 'person', 'borrower', 'volunteer'];
  return (pref.map((n) => refs.find(([k]) => k === n)).find(Boolean) ?? refs[0])?.[0] ?? null;
}

const statusFieldOf = (def) => def.statusFlow?.field ?? def.due?.status ?? def.softDelete?.field ?? null;
const codeFieldOf = (def) => Object.entries(def.fields).find(([, f]) => f.type === 'string' && f.unique && !f.secret)?.[0] ?? null;
const titleOf = (def) => def.titleField ?? Object.keys(def.fields)[0];
const searchFields = (def) => Object.entries(def.fields).filter(([, f]) => f.search && !f.secret && ['string', 'text'].includes(f.type)).map(([n]) => n);
const dateFields = (def) => [...Object.entries(def.fields).filter(([, f]) => f.type === 'date' && !f.secret).map(([n]) => n), 'createdAt', 'updatedAt'];

function coerce(spec, value) {
  if (spec.type === 'boolean') return value === true || value === 'true';
  if (spec.type === 'number') return Number(value);
  return String(value);
}

function addNin(filter, field, values) {
  const cur = filter[field];
  const already = cur && typeof cur === 'object' && cur.$ne !== undefined ? [cur.$ne] : [];
  filter[field] = { $nin: [...already, ...values] };
}

/** Mongo filter for a spec; null when the spec cannot apply to this resource. */
async function mongoFilter(def, spec, { user }) {
  const filter = {};
  if (def.softDelete) filter[def.softDelete.field] = { $ne: def.softDelete.value };
  for (const [name, value] of Object.entries(spec.filters ?? {})) {
    const f = def.fields[name];
    if (!f || f.secret || !f.filter) continue;
    if (f.type === 'enum' && !f.values.includes(value)) continue;
    filter[name] = coerce(f, value);
  }
  for (const [name, values] of Object.entries(spec.exclude ?? {})) {
    const f = def.fields[name];
    if (f?.type === 'enum' && !f.secret && f.filter) addNin(filter, name, values.filter((v) => f.values.includes(v)));
  }
  if (spec.overdue) {
    if (!def.due) return null;
    if (typeof filter[def.due.status] !== 'string') filter[def.due.status] = def.due.to;
  }
  if (spec.openOnly && def.due && typeof filter[def.due.status] !== 'string') filter[def.due.status] = { $in: def.due.from };
  if (spec.mine || spec.assignee) {
    const owner = ownerField(def);
    if (!owner) return null;
    if (spec.mine) filter[owner] = user.userId;
    else {
      const people = await User.find({ name: new RegExp(`^${escapeRegex(String(spec.assignee).slice(0, 40))}`, 'i') }).select('_id').limit(20).lean();
      filter[owner] = { $in: people.map((p) => p._id) };
    }
  }
  if (spec.range) {
    const field = spec.range.field;
    if (!dateFields(def).includes(field)) return null;
    filter[field] = { $gte: new Date(spec.range.from), $lt: new Date(spec.range.to) };
  }
  const term = typeof spec.search === 'string' ? spec.search.trim().slice(0, 100) : '';
  if (term) {
    const fields = [...new Set([...searchFields(def), codeFieldOf(def)].filter(Boolean))];
    if (!fields.length) return null;
    const rx = { $regex: escapeRegex(term), $options: 'i' };
    filter.$or = fields.map((f) => ({ [f]: rx }));
  }
  return filter;
}

function sortFor(def, spec) {
  const raw = spec.sort ?? (spec.overdue || (spec.range && spec.range.field === def.due?.field) ? def.due?.field : null) ?? def.defaultSort ?? '-createdAt';
  const dir = String(raw).startsWith('-') ? -1 : 1;
  const field = String(raw).replace(/^-/, '');
  const ok = ['createdAt', 'updatedAt'].includes(field) || (def.fields[field] && !def.fields[field].secret);
  return ok ? { [field]: dir, _id: dir } : { createdAt: -1, _id: -1 };
}

const brief = (def) => (item) => {
  const sf = statusFieldOf(def);
  const code = codeFieldOf(def);
  return {
    _id: String(item._id),
    title: String(item[titleOf(def)] ?? 'untitled'),
    code: code ? item[code] ?? null : null,
    status: sf ? item[sf] ?? null : null,
    due: def.due ? item[def.due.field] ?? null : null,
  };
};

const selectFor = (def, extra = []) => [titleOf(def), statusFieldOf(def), def.due?.field, codeFieldOf(def), ...extra].filter(Boolean).join(' ');

/**
 * Runs one question against one resource.
 *
 * Spec: `{ resource, aggregate: 'list'|'count'|'sum'|'avg', field?, filters?: {field: value}, exclude?: {field: [values]},
 * overdue?, openOnly?, mine?, assignee?, range?: {field, from, to, label}, search?, sort?, limit? }`.
 *
 * @returns {Promise<object>} `{ resource, label, aggregate, total, items, hasMore, sum?, average?, field? }`,
 *   `{ denied: true, label }` or `{ unsupported: true, label }`
 */
export async function runQuery(spec, { registry, config, user }) {
  const r = registry.get(spec.resource);
  if (!r) return { unsupported: true, label: String(spec.resource) };
  const { def } = r;
  if (!can(user.role, def, 'read', config.roles)) return { denied: true, label: def.label };
  const filter = await mongoFilter(def, spec, { user });
  if (!filter) return { unsupported: true, label: def.label };
  const base = { resource: r.key, label: def.label, aggregate: spec.aggregate ?? 'list' };

  if (base.aggregate === 'sum' || base.aggregate === 'avg') {
    const f = def.fields[spec.field];
    if (!f || f.type !== 'number' || f.secret) return { unsupported: true, label: def.label };
    const docs = await r.model.find(filter).select(spec.field).limit(SUM_CAP).lean();
    const values = docs.map((d) => Number(d[spec.field])).filter(Number.isFinite);
    const sum = values.reduce((a, b) => a + b, 0);
    return { ...base, field: spec.field, fieldLabel: f.label ?? spec.field, total: docs.length, sum, average: values.length ? sum / values.length : 0, items: [], hasMore: false };
  }
  const limit = Math.min(Math.max(Number(spec.limit) || 5, 1), MAX_LIMIT);
  if (base.aggregate === 'count') return { ...base, total: await r.model.countDocuments(filter), items: [], hasMore: false };
  const [total, items] = await Promise.all([
    r.model.countDocuments(filter),
    r.model.find(filter).sort(sortFor(def, spec)).limit(limit).select(selectFor(def)).lean(),
  ]);
  return { ...base, total, items: items.map(brief(def)), hasMore: total > items.length };
}

/**
 * "What needs my attention": per readable resource with a due rule, how many are overdue and how many
 * are due in the next 7 days, how many of those are the asker's, and the most urgent few records.
 */
export async function runOverview({ registry, config, user, now = new Date() }) {
  const end = new Date(now.getTime() + 7 * DAY);
  const rows = [];
  const urgent = [];
  for (const r of readableResources(registry, config, user).filter((x) => x.def.due)) {
    const { def } = r;
    const owner = ownerField(def);
    const soon = { field: def.due.field, from: now, to: end };
    const q = (extra) => runQuery({ resource: r.key, aggregate: 'list', limit: 5, ...extra }, { registry, config, user });
    const [overdue, dueSoon, mineOverdue, mineSoon] = await Promise.all([
      q({ overdue: true }),
      q({ openOnly: true, range: soon }),
      owner ? q({ overdue: true, mine: true }) : null,
      owner ? q({ openOnly: true, range: soon, mine: true }) : null,
    ]);
    rows.push({ key: r.key, label: def.label, overdue: overdue.total, dueSoon: dueSoon.total, mineOverdue: mineOverdue?.total ?? 0, mineDueSoon: mineSoon?.total ?? 0 });
    const pick = (mineQ, allQ) => (mineQ && mineQ.total ? mineQ : allQ);
    for (const [kind, res] of [['overdue', pick(mineOverdue, overdue)], ['soon', pick(mineSoon, dueSoon)]]) {
      for (const it of res.items) urgent.push({ ...it, key: r.key, label: def.label, kind });
    }
  }
  urgent.sort((a, b) => (a.kind === b.kind ? new Date(a.due ?? 0) - new Date(b.due ?? 0) : a.kind === 'overdue' ? -1 : 1));
  return { rows, items: urgent.slice(0, 6) };
}

const formatValue = (f, v) => {
  if (v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length)) return null;
  if (f.type === 'checklist') return `${v.filter((i) => i.done).length} of ${v.length} done`;
  if (f.type === 'date') return new Date(v).toISOString().slice(0, f.time ? 16 : 10).replace('T', ' ');
  if (f.type === 'boolean') return v ? 'yes' : 'no';
  if (f.type === 'ref') return v?.name ?? v?.title ?? null;
  if (Array.isArray(v)) return v.join(', ');
  return String(v);
};

/** Finds the one record whose unique ID field (code, asset tag…) equals `code`, across readable resources. */
export async function lookupCode(code, { registry, config, user }) {
  const rx = new RegExp(`^${escapeRegex(String(code).slice(0, 40))}$`, 'i');
  for (const r of readableResources(registry, config, user)) {
    const idField = codeFieldOf(r.def);
    if (!idField) continue;
    let cursor = r.model.findOne({ [idField]: rx });
    for (const [name, f] of Object.entries(r.def.fields)) {
      if (f.type === 'ref' && f.ref === 'User') cursor = cursor.populate({ path: name, select: 'name' });
    }
    const doc = await cursor.lean();
    if (!doc) continue;
    const details = Object.entries(r.def.fields)
      .filter(([n, f]) => !f.secret && n !== titleOf(r.def) && n !== idField)
      .map(([n, f]) => ({ label: f.label ?? n, value: formatValue(f, doc[n]) }))
      .filter((d) => d.value)
      .slice(0, 8);
    return { found: true, key: r.key, label: r.def.label, ...brief(r.def)(doc), details };
  }
  return { found: false, code };
}
