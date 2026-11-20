import { normaliseUtterance, spokenValue, synonymsOf } from './utterance.js';
import { parseQuestion } from './queryParser.js';
import { runQuery, runOverview, lookupCode, readableResources, ownerField } from './queryEngine.js';

/**
 * Chat intents that sit after the specific built-ins: LOOKUP (an ID such as N-0006), OVERVIEW
 * ("what is on my plate"), GREETING, HELP and QUERY, the general question parser. Everything is
 * read-only and answered by the permission-checked query engine.
 */
const join = (names) => (names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);
const day = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');
const plural = (n, noun) => `${n} ${noun}`;
const number = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** Phrases describing the filters of a spec, e.g. ['status open', 'priority high', 'yours', 'due this week']. */
function pieces(spec, def) {
  const out = [];
  const statusField = def.statusFlow?.field ?? def.due?.status;
  for (const [name, value] of Object.entries(spec.filters ?? {})) {
    out.push(`${name === statusField ? 'status' : (def.fields[name]?.label ?? name).toLowerCase()} ${spokenValue(value)}`);
  }
  for (const [name, values] of Object.entries(spec.exclude ?? {})) {
    out.push(`${name === statusField ? 'status' : (def.fields[name]?.label ?? name).toLowerCase()} not ${values.map(spokenValue).join(' or ')}`);
  }
  if (spec.overdue) out.push('overdue');
  if (spec.openOnly) out.push('not finished');
  if (spec.mine) out.push('yours');
  if (spec.assignee) out.push(`assigned to ${spec.assignee}`);
  if (spec.range) {
    const f = spec.range.field;
    out.push(f === def.due?.field ? `due ${spec.range.label}` : f === 'createdAt' ? `added ${spec.range.label}` : `${(def.fields[f]?.label ?? f).toLowerCase()} ${spec.range.label}`);
  }
  if (spec.search) out.push(`matching "${spec.search}"`);
  return out;
}

/** The list page that shows the same records, so an answer can link to "see all". */
function listLink(def, key, spec, user) {
  const p = new URLSearchParams();
  for (const [n, v] of Object.entries(spec.filters ?? {})) if (def.fields[n]?.filter) p.set(n, String(v));
  if (spec.overdue && def.due) p.set(def.due.status, def.due.to);
  if (spec.mine) { const o = ownerField(def); if (o) p.set(o, user.userId); }
  if (spec.range && def.fields[spec.range.field]?.type === 'date') {
    p.set(`${spec.range.field}_from`, day(spec.range.from));
    p.set(`${spec.range.field}_to`, day(new Date(new Date(spec.range.to).getTime() - 1)));
  }
  if (spec.search) p.set('q', spec.search);
  const q = p.toString();
  return `/r/${key}${q ? `?${q}` : ''}`;
}

/** Example questions that work for what `user` can read (the chat page shows them as chips). */
export function exampleQuestions(registry, config, user) {
  const rs = readableResources(registry, config, user);
  const out = rs.some((r) => r.def.due) ? ['what is on my plate'] : [];
  const named = (r) => synonymsOf(r.def)[0];
  const due = rs.find((r) => r.def.due && ownerField(r.def));
  if (due) out.push(`show my ${named(due)} due this week`);
  const timed = rs.find((r) => Object.values(r.def.fields).some((f) => f.type === 'number' && /minute/i.test(f.label ?? '')));
  if (timed) out.push(`total minutes in ${named(timed)} this week`);
  const overdue = rs.find((r) => r.def.due);
  if (overdue) out.push(`which ${named(overdue)} are over due`);
  const enumR = rs.find((r) => r.def.fields.priority?.type === 'enum' && r.def.fields.priority.filter);
  if (enumR) out.push(`${spokenValue(enumR.def.fields.priority.values.at(-1))} priority ${named(enumR)}`);
  out.push('help');
  return out;
}

const SPOKEN_CODE = /\b([a-z]{1,4}-\d{2,6})\b/;
const GREETING = /^(?:hi|hello|hey|hiya|yo|howdy|greetings|good (?:morning|afternoon|evening))(?: there| ghost| kit| assistant)?$/;
const THANKS = /^(?:thanks|thank you|cheers|ta|great|ok|okay|cool|nice|perfect|awesome)(?: a lot| so much| very much)?$/;
const HELP = /^(?:help|what can you do|what can i ask|what can i say|what do you do|how do you work|how does this work|commands|examples|what can you help with|what are you)$/;
const OVERVIEW = /^(?:whats on my plate|what is on my plate|what do i need to do|what should i do|what needs my attention|what needs attention|anything urgent|what is urgent|my day|my agenda|summary|summarise|summarize|overview|status report|catch me up|give me a summary|how are we doing|how am i doing|what is going on|whats going on|whats up|what is up|any alerts|what did i miss|what is happening|whats happening|my to do list|my todo list|my tasks|what is next|whats next)$/;

/**
 * @param {{ all: () => any[] }} registry
 * @returns {object[]}
 */
export function assistantIntents(registry) {
  const intents = [];

  intents.push({
    name: 'LOOKUP',
    examples: [],
    match: (t) => {
      const m = t.match(SPOKEN_CODE);
      return m && t.split(' ').length <= 8 ? { code: m[1] } : null;
    },
    handle: ({ code }, ctx) => lookupCode(code.toUpperCase(), ctx).then((r) => ({ kind: 'lookup', ...r })),
    respond: (d) => {
      if (!d.found) return `I couldn't find anything with the ID ${String(d.code).toUpperCase()}.`;
      const head = `${d.label}: "${d.title}"${d.status ? ` is ${spokenValue(d.status)}` : ''}${d.due ? `, due ${day(d.due)}` : ''}.`;
      const more = d.details.slice(0, 4).map((x) => `${x.label.toLowerCase()} ${x.value}`);
      return more.length ? `${head} ${more.join('; ')}.` : head;
    },
  });

  intents.push({
    name: 'OVERVIEW',
    examples: ['what is on my plate'],
    match: (t) => (OVERVIEW.test(t) ? {} : null),
    handle: (_p, ctx) => runOverview(ctx).then((r) => ({ kind: 'overview', ...r })),
    respond: (d) => {
      const sum = (k) => d.rows.reduce((a, r) => a + r[k], 0);
      const [o, s, mo, ms] = [sum('overdue'), sum('dueSoon'), sum('mineOverdue'), sum('mineDueSoon')];
      if (!o && !s) return 'Nothing is overdue and nothing is due in the next 7 days. All quiet.';
      const urgent = d.items.slice(0, 3).map((i) => `${i.title} (${i.kind === 'overdue' ? 'overdue' : `due ${day(i.due)}`})`);
      return `Overdue: ${o} (${mo} yours). Due in the next 7 days: ${s} (${ms} yours).${urgent.length ? ` Most urgent: ${join(urgent)}.` : ''}`;
    },
  });

  intents.push({
    name: 'GREETING',
    examples: [],
    match: (t) => (GREETING.test(t) ? { greeting: true } : THANKS.test(t) ? { thanks: true } : null),
    handle: (p, { user }) => ({ ...p, name: user?.name?.split(' ')[0] ?? null }),
    respond: (d) => (d.thanks ? "You're welcome. Ask me anything else about your records." : `Hello${d.name ? `, ${d.name}` : ''}! Ask me about your records, or say help to see what I can do.`),
  });

  intents.push({
    name: 'HELP',
    examples: ['help'],
    match: (t) => (HELP.test(t) ? {} : null),
    handle: (_p, { user, config }) => ({ examples: exampleQuestions(registry, config, user) }),
    respond: (d) => `I can count, list and total your records, show what is overdue or due soon, look up an item by its ID, and add things when you ask. Try: ${d.examples.slice(0, 5).map((e) => `"${e}"`).join(', ')}.`,
  });

  // The general question parser, last so every specific intent above keeps its tailored answer.
  intents.push({
    name: 'QUERY',
    examples: [],
    match(t) {
      const spec = parseQuestion(t, { registry });
      return spec ? { text: t, ...(spec.resource ? { resource: spec.resource } : {}) } : null;
    },
    async handle(params, ctx) {
      const { now = new Date(), tz = 0 } = ctx;
      const spec = parseQuestion(params.text, { registry, now, tz });
      if (!spec) return { kind: 'none', text: "Sorry, I couldn't work out what to look up." };
      if (spec.all) return runAcross(spec, ctx);
      const res = await runQuery(spec, ctx);
      if (res.unsupported) return { kind: 'none', text: `I can't answer that for ${res.label}: it has no ${spec.overdue ? 'due date' : 'matching field'}.` };
      const def = registry.get(spec.resource).def;
      const note = pieces(spec, def);
      const tail = note.length ? ` (${note.join(', ')})` : '';
      const noun = def.label.toLowerCase();
      const one = res.total === 1 ? noun.replace(/s$/, '') : noun; // "1 task", "2 tasks"
      let text;
      if (res.aggregate === 'sum' || res.aggregate === 'avg') {
        const v = res.aggregate === 'avg' ? res.average : res.sum;
        const shown = spec.unit === 'hours' ? `${number(v / 60)} hours` : number(v);
        text = `${res.aggregate === 'avg' ? 'Average' : 'Total'} ${res.fieldLabel.toLowerCase()} over ${plural(res.total, res.total === 1 ? 'record' : 'records')} in ${def.label}${tail}: ${shown}${spec.unit !== 'hours' && /minute/i.test(res.fieldLabel) && v >= 60 ? ` (about ${number(v / 60)} hours)` : ''}.`;
      } else if (res.aggregate === 'count') {
        text = res.total === 0 ? `No ${noun} found${tail}.` : `There ${res.total === 1 ? 'is' : 'are'} ${res.total} ${one}${tail}.`;
      } else if (res.total === 0) text = `No ${noun} found${tail}.`;
      else text = `${res.total} ${one}${tail}: ${join(res.items.map((i) => i.title))}${res.hasMore ? ', and more' : ''}.`;
      return { kind: 'query', ...res, text, link: listLink(def, spec.resource, spec, ctx.user) };
    },
    respond: (d) => d.text,
  });

  return intents;
}

/** Questions about everything ("what is overdue", "due this week", "find candles"). */
async function runAcross(spec, ctx) {
  const { registry, config, user } = ctx;
  const rows = [];
  const items = [];
  for (const r of readableResources(registry, config, user)) {
    const due = r.def.due;
    if ((spec.overdue || spec.range || spec.openOnly) && !due) continue;
    const q = {
      resource: r.key, aggregate: 'list', limit: spec.limit ?? 5, mine: spec.mine, search: spec.search,
      ...(spec.overdue ? { overdue: true } : {}),
      ...(spec.range ? { range: { ...spec.range, field: due.field }, openOnly: spec.openOnly } : {}),
      ...(!spec.range && spec.openOnly ? { openOnly: true } : {}),
    };
    const res = await runQuery(q, ctx);
    if (res.unsupported || res.denied || !res.total) continue;
    rows.push({ key: r.key, label: r.def.label, total: res.total, link: listLink(r.def, r.key, q, user) });
    for (const it of res.items) items.push({ ...it, key: r.key, label: r.def.label });
  }
  const total = rows.reduce((a, r) => a + r.total, 0);
  const what = spec.search ? `matching "${spec.search}"` : [spec.overdue ? 'overdue' : '', spec.range ? `due ${spec.range.label}` : '', spec.mine ? 'yours' : ''].filter(Boolean).join(', ');
  const text = total === 0
    ? `Nothing found${what ? ` (${what})` : ''}.`
    : `${total} record${total === 1 ? '' : 's'}${what ? ` (${what})` : ''}: ${join(rows.map((r) => `${r.total} in ${r.label}`))}. ${join(items.slice(0, 4).map((i) => i.title))}${items.length > 4 ? ', and more' : ''}.`;
  return { kind: 'across', rows, items: items.slice(0, 8), total, text };
}

export { normaliseUtterance };
