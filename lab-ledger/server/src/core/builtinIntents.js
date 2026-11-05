import { escapeRegex } from '../utils/escapeRegex.js';
import { can } from './permissions.js';
import { normaliseUtterance } from './utterance.js';

const DAY = 86400000;

/** 'CheckedOut' → 'checked out', 'Under Maintenance' → 'under maintenance' */
export function spokenValue(value) {
  return normaliseUtterance(String(value).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' '));
}

/** Spoken synonyms for a resource (voice.synonyms or derived from label/key), normalised. */
export function synonymsOf(def) {
  const raw = def.voice?.synonyms?.length ? def.voice.synonyms : [def.label, def.key.replace(/-/g, ' ')];
  return [...new Set(raw.map((s) => normaliseUtterance(s)).filter(Boolean))];
}

const alt = (words) =>
  [...words].sort((a, b) => b.length - a.length).map(escapeRegex).join('|');

/** Records not soft-deleted. */
const baseFilter = (def) => (def.softDelete ? { [def.softDelete.field]: { $ne: def.softDelete.value } } : {});

function listNames(names) {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

const plural = (n, label) => (n === 1 ? `1 record in ${label}` : `${n} ${label.toLowerCase()}`);

/**
 * Built-in intents for every resource (Req 11.1): COUNT_BY_VALUE, COUNT_ALL, LIST_OVERDUE,
 * plus one cross-resource DUE_SOON. More specific intents come first.
 * @param {{ all: () => Array<{ key: string, def: object, model: any }> }} registry
 */
export function builtinIntents(registry) {
  const intents = [];
  const resources = registry?.all() ?? [];

  for (const r of resources) {
    const { def } = r;
    const syns = synonymsOf(def);
    const SYN = alt(syns);

    // COUNT_BY_VALUE — one intent per filterable single-value enum field
    for (const [field, spec] of Object.entries(def.fields)) {
      if (spec.type !== 'enum' || spec.multiple || !spec.filter || spec.secret) continue;
      const lookup = new Map(spec.values.map((v) => [spokenValue(v), v]));
      const VAL = alt(lookup.keys());
      const FIELD = escapeRegex(normaliseUtterance(spec.label ?? field));
      const isStatus = field === (def.statusFlow?.field ?? def.due?.status ?? def.softDelete?.field ?? 'status');
      const after = new RegExp(`^how many (${SYN}) (?:are|is|have status|with status|that are|are marked|are in|in) (${VAL})$`);
      const withField = new RegExp(`^how many (${SYN}) (?:with|that have|having|have) (?:a |an )?(?:${FIELD} )?(?:of )?(${VAL})(?: ${FIELD})?$`);
      const before = new RegExp(`^how many (${VAL})(?: ${FIELD})? (${SYN})(?: are there| do we have)?$`);
      intents.push({
        name: 'COUNT_BY_VALUE',
        resource: r.key,
        examples: [
          isStatus
            ? `how many ${syns[0]} are ${spokenValue(spec.values[0])}`
            : `how many ${spokenValue(spec.values[spec.values.length - 1])} ${normaliseUtterance(spec.label ?? field)} ${syns[0]}`,
        ],
        match(t) {
          let m = t.match(after) ?? t.match(withField);
          if (m) return { resource: r.key, field, value: lookup.get(m[2]) };
          m = t.match(before);
          if (m) return { resource: r.key, field, value: lookup.get(m[1]) };
          return null;
        },
        handle: ({ value }) => r.model.countDocuments({ ...baseFilter(def), [field]: value }),
        respond: (n, { value }) => {
          const what = `${spec.label?.toLowerCase() ?? field} ${spokenValue(value)}`;
          return n === 1 ? `There is 1 record in ${def.label} with ${what}.` : `There are ${n} ${def.label.toLowerCase()} with ${what}.`;
        },
      });
    }

    // COUNT_ALL
    const countAll = new RegExp(
      `^(?:how many|count|count the|number of|total number of|total) (${SYN})(?: are there| do we have| exist| in total| total| we have)?$`
    );
    intents.push({
      name: 'COUNT_ALL',
      resource: r.key,
      examples: [`how many ${syns[0]} are there`],
      match: (t) => (countAll.test(t) ? { resource: r.key } : null),
      handle: () => r.model.countDocuments(baseFilter(def)),
      respond: (n) => (n === 1 ? `There is ${plural(n, def.label)}.` : `There are ${plural(n, def.label)}.`),
    });

    // LIST_OVERDUE
    if (def.due) {
      const late = '(?:overdue|late|past due)';
      const listRe = new RegExp(`^(?:which|what|list|show|show me|list the|any) (${SYN}) (?:are |is )?${late}$`);
      const listRe2 = new RegExp(`^(?:list |show |show me |any |what are the |which are the )?${late} (${SYN})$`);
      const titleField = def.titleField ?? 'name';
      intents.push({
        name: 'LIST_OVERDUE',
        resource: r.key,
        examples: [`which ${syns[0]} are overdue`],
        match: (t) => (listRe.test(t) || listRe2.test(t) ? { resource: r.key } : null),
        async handle() {
          const filter = { ...baseFilter(def), [def.due.status]: def.due.to };
          const [count, items] = await Promise.all([
            r.model.countDocuments(filter),
            r.model.find(filter).sort({ [def.due.field]: 1 }).limit(5).select({ [titleField]: 1 }).lean(),
          ]);
          return { count, names: items.map((i) => String(i[titleField] ?? 'untitled')) };
        },
        respond: ({ count, names }) =>
          count === 0
            ? `Nothing is overdue in ${def.label}.`
            : `${count === 1 ? `1 record in ${def.label} is overdue` : `${count} ${def.label.toLowerCase()} are overdue`}: ${listNames(names)}${count > names.length ? ', and more' : ''}.`,
      });
    }
  }

  // DUE_SOON — across every readable resource with a due rule
  const withDue = resources.filter((r) => r.def.due);
  if (withDue.length) {
    const re = /^(?:what is |whats |what s |what |anything |is anything |is there anything )?(?:coming )?due (?:this week|soon|in the next (?:7|seven) days|next week)$/;
    intents.push({
      name: 'DUE_SOON',
      examples: ['what is due this week'],
      match: (t) => (re.test(t) ? {} : null),
      async handle(_params, { user, config, now = new Date() }) {
        const readable = withDue.filter((r) => can(user.role, r.def, 'read', config.roles));
        const end = new Date(now.getTime() + 7 * DAY);
        return Promise.all(
          readable.map(async (r) => ({
            label: r.def.label,
            count: await r.model.countDocuments({ ...baseFilter(r.def), [r.def.due.status]: { $in: r.def.due.from }, [r.def.due.field]: { $gte: now, $lte: end } }),
          }))
        );
      },
      respond: (rows) => {
        const parts = rows.filter((x) => x.count > 0).map((x) => `${x.count} in ${x.label}`);
        return parts.length ? `Due in the next 7 days: ${listNames(parts)}.` : 'Nothing is due in the next 7 days.';
      },
    });
  }

  return intents;
}
