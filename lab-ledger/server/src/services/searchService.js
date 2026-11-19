import { getContext } from '../context.js';
import { can } from '../core/permissions.js';
import { buildFilter, buildSort } from './resourceService.js';
import { titleFor } from './notificationService.js';

export const SEARCH_PER_RESOURCE = 5;
const MIN_Q = 2;
const MAX_Q = 100;

const searchedFields = (def) => Object.entries(def.fields).filter(([, s]) => s.search && !s.secret).map(([n]) => n);

/** First other searched field whose text contains `q` (case-insensitive), else the `code` field, else null. */
function subtitleFor(def, doc, q) {
  const needle = q.toLowerCase();
  const title = def.titleField ?? Object.keys(def.fields)[0];
  for (const f of searchedFields(def)) {
    const v = doc[f];
    if (f === title || typeof v !== 'string') continue;
    const at = v.toLowerCase().indexOf(needle);
    if (at < 0) continue;
    if (v.length <= 80) return v;
    const start = Math.max(0, at - 30);
    return `${start > 0 ? '…' : ''}${v.slice(start, start + 80).trim()}…`;
  }
  const code = doc.code;
  return typeof code === 'string' && code ? code : null;
}

/**
 * Searches every resource the user can read that declares `search: true` fields. Uses the same
 * filter as the list endpoint (soft-deleted records excluded, regex escaped). Max 5 items each.
 * @param {unknown} q
 * @param {{ role: string }} user
 * @returns {Promise<{ key: string, label: string, icon: string, items: { _id: string, title: string, subtitle: string|null }[] }[]>}
 */
export async function searchAll(q, user) {
  const text = typeof q === 'string' ? q.trim() : '';
  if (text.length < MIN_Q || text.length > MAX_Q) return [];
  const { registry, config } = getContext();
  const targets = (registry?.all() ?? []).filter((r) => searchedFields(r.def).length && can(user.role, r.def, 'read', config.roles));

  const groups = await Promise.all(targets.map(async (r) => {
    const docs = await r.model.find(buildFilter(r.def, { q: text })).sort(buildSort(r.def)).limit(SEARCH_PER_RESOURCE).lean();
    if (!docs.length) return null;
    const items = await Promise.all(docs.map(async (d) => ({
      _id: String(d._id),
      title: await titleFor(r, d),
      subtitle: subtitleFor(r.def, d, text),
    })));
    return { key: r.key, label: r.def.label, icon: r.def.icon ?? 'database', items };
  }));
  return groups.filter(Boolean);
}
