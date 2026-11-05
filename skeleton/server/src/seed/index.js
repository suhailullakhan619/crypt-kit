import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadModules } from '../utils/loadModules.js';
import { isResourceRef } from '../core/fieldTypes.js';
import * as activity from '../services/activityService.js';
import { seedUsers } from './users.js';

const DATA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'data');
const DAY = 86400000;

/** Orders resources so that ref targets are seeded before the resources pointing at them. */
export function seedOrder(resources) {
  const byKey = new Map(resources.map((r) => [r.key, r]));
  const done = new Set();
  const out = [];
  const visit = (r, stack = new Set()) => {
    if (done.has(r.key) || stack.has(r.key)) return;
    stack.add(r.key);
    for (const f of Object.values(r.def.fields)) {
      if (f.type === 'ref' && isResourceRef(f.ref) && byKey.has(f.ref)) visit(byKey.get(f.ref), stack);
    }
    done.add(r.key);
    out.push(r);
  };
  resources.forEach((r) => visit(r));
  return out;
}

/** Generic placeholder records for resources without a seed/data file. */
function genericRecords(resource, ctx, n = 6) {
  const { def } = resource;
  const locked = new Set([...(def.statusFlow?.workflowOnly ?? []), def.softDelete?.value].filter(Boolean));
  return Array.from({ length: n }, (_, i) => {
    const rec = {};
    for (const [name, f] of Object.entries(def.fields)) {
      if (f.secret) continue;
      switch (f.type) {
        case 'string': rec[name] = `${f.label ?? def.label} ${i + 1}`; break;
        case 'text': rec[name] = `Sample ${name} for record ${i + 1}.`; break;
        case 'number': rec[name] = Math.max(f.min ?? 0, Math.min(f.max ?? 100, (i + 1) * 3)); break;
        case 'boolean': rec[name] = i % 2 === 0; break;
        case 'date': rec[name] = new Date(ctx.now.getTime() + (i - 2) * 3 * DAY); break;
        case 'enum': {
          const vals = f.values.filter((v) => !locked.has(v));
          rec[name] = f.multiple ? vals.slice(0, (i % vals.length) + 1) : vals[i % vals.length];
          break;
        }
        case 'ref': rec[name] = f.ref === 'User' ? ctx.users.all[i % ctx.users.all.length] : ctx.pick(f.ref, i); break;
        default: break;
      }
    }
    return rec;
  });
}

/**
 * Idempotent demo seed (Req 2.5, 15.2): demo users, then records for every resource whose
 * collection is empty — from seed/data/<file>.js when provided, otherwise generic placeholders.
 * @param {{ all: () => any[] }} registry
 * @param {{ now?: Date, log?: (msg: string) => void, dataDir?: string }} [opts]
 * @returns {Promise<Record<string, number>>} records inserted per resource
 */
export async function runSeed(registry, { now = new Date(), log = () => {}, dataDir = DATA_DIR } = {}) {
  const userDocs = await seedUsers();
  const users = {
    all: userDocs.map((u) => u._id),
    byRole: Object.fromEntries(userDocs.map((u) => [u.role, u._id])),
  };
  const superuser = userDocs[0]?._id;

  const dataFiles = new Map((await loadModules(dataDir)).map(({ value }) => [value.resource, value]));
  const insertedIds = new Map();
  const pick = (key, i = 0) => {
    const ids = insertedIds.get(key) ?? [];
    return ids.length ? ids[i % ids.length] : null;
  };

  const summary = {};
  for (const r of seedOrder(registry.all())) {
    const existing = await r.model.find().select('_id').lean();
    if (existing.length) {
      insertedIds.set(r.key, existing.map((d) => d._id));
      summary[r.key] = 0;
      continue;
    }
    const ctx = { users, now, pick };
    const records = dataFiles.has(r.key) ? await dataFiles.get(r.key).records(ctx) : genericRecords(r, ctx);
    const docs = await r.model.insertMany(records.map((rec) => ({ createdBy: superuser, ...rec })));
    insertedIds.set(r.key, docs.map((d) => d._id));
    await activity.recordMany(docs.map((d) => ({ actor: 'system', resource: r.key, recordId: d._id, action: 'create', diff: {} })));
    summary[r.key] = docs.length;
  }
  log(`🌱 Seeded: ${Object.entries(summary).map(([k, n]) => `${k}=${n}`).join(', ') || 'nothing'}`);
  return summary;
}
