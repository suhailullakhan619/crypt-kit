import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getContext, now as clockNow } from '../context.js';
import { can, isSuperuser } from '../core/permissions.js';
import { loadModules } from '../utils/loadModules.js';
import * as activity from './activityService.js';

const DAY = 86400000;
const PANEL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dashboard');

let panelsPromise = null;
/** App dashboard panels from src/dashboard/*.js → { key, title, roles?, load(ctx) } (Req 16.5). */
export function loadPanels(dir = PANEL_DIR) {
  if (!panelsPromise || dir !== PANEL_DIR) {
    const p = loadModules(dir).then((mods) => mods.map((m) => m.value));
    if (dir !== PANEL_DIR) return p;
    panelsPromise = p;
  }
  return panelsPromise;
}

async function statsFor(resource, now) {
  const { def, model } = resource;
  const base = def.softDelete ? { [def.softDelete.field]: { $ne: def.softDelete.value } } : {};

  const enumFields = Object.entries(def.fields).filter(([, s]) => s.type === 'enum' && s.filter && !s.multiple && !s.secret);
  const [total, ...breakdowns] = await Promise.all([
    model.countDocuments(base),
    ...enumFields.map(async ([name, spec]) => {
      const rows = await model.aggregate([{ $match: base }, { $group: { _id: `$${name}`, count: { $sum: 1 } } }]);
      const counts = Object.fromEntries(spec.values.map((v) => [v, 0]));
      for (const r of rows) if (r._id != null) counts[r._id] = r.count;
      return { field: name, label: spec.label ?? name, counts };
    }),
  ]);

  let overdue = 0;
  let dueSoon = 0;
  const routine = getContext().config?.routineDueRules?.includes(def.key);
  if (def.due && !routine) {
    const { field, status, from, to } = def.due;
    [overdue, dueSoon] = await Promise.all([
      model.countDocuments({ ...base, [status]: to }),
      model.countDocuments({ ...base, [status]: { $in: from }, [field]: { $gte: now, $lte: new Date(now.getTime() + 7 * DAY) } }),
    ]);
  }

  return { key: def.key, label: def.label, icon: def.icon ?? 'database', total, breakdowns, overdue, dueSoon, hasDue: !!def.due && !routine };
}

/**
 * Dashboard payload for a user (Req 9.1, 9.2, 16.5).
 * @param {{ userId: string, role: string }} user
 * @param {Date} [now]
 */
export async function getDashboard(user, now = clockNow()) {
  const { registry, config } = getContext();
  const readable = (registry?.all() ?? []).filter((r) => can(user.role, r.def, 'read', config.roles));

  const [resources, recent, panelDefs] = await Promise.all([
    Promise.all(readable.map((r) => statsFor(r, now))),
    activity.latest({ resources: readable.map((r) => r.key), limit: 10 }),
    loadPanels(),
  ]);

  const panels = [];
  for (const p of panelDefs) {
    if (p.roles && !isSuperuser(user.role, config.roles) && !p.roles.includes(user.role)) continue;
    panels.push({ key: p.key, title: p.title, data: await p.load({ user, registry, now }) });
  }

  return { resources, recent, panels };
}
