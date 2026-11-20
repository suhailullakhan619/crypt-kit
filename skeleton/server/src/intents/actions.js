import { can } from '../core/permissions.js';
import { parseMoment, parseRange } from '../core/when.js';
import { lookupCode } from '../core/queryEngine.js';
import { spokenValue } from '../core/utterance.js';

/**
 * Chat actions for the example modules: add a note, set a reminder, log time, mark an item done.
 * None of them writes anything. Each returns a draft (`data.draft`) that the page shows as a card;
 * the user presses Confirm and the card saves it through the normal, permission-checked API.
 * So a misheard sentence can never change data.
 */
const CODE = '([a-z]{1,4}-\\d{2,6})';
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const localDay = (d, tz) => new Date(d.getTime() - tz * 60000).toISOString().slice(0, 10);
const trimTail = (s) => s.replace(/\b(?:due|by|on|for|before|until|at|in|to|and)\s*$/, '').replace(/\s+/g, ' ').trim();

const REMIND = /^(?:please )?(?:remind me|add a reminder|set a reminder|create a reminder|new reminder)(?: to| about| that| for)? (.+)$/;
const LOG = new RegExp('^(?:please )?(?:log|record|add) (\\d{1,4}|an|one|half an) (minutes?|mins?|hours?|hrs?)(?: (?:on|for|of|doing|spent on|spent doing|working on))? (.+)$');
const SPENT = new RegExp('^i (?:spent|worked|did) (\\d{1,4}|an|one|half an) (minutes?|mins?|hours?|hrs?)(?: (?:on|doing|working on))? (.+)$');
const NOTE = /^(?:please )?(?:add|create|make|new)(?: a| an| new)* (?:note|task|to-do|todo|to do)(?: called| named| titled| saying| to| about| for)? (.+)$|^(?:note down|jot down|write down|add to my list) (.+)$/;
const MARK = new RegExp(`^(?:please )?(?:mark|set|move|update) ${CODE}(?: as| to)? (.+)$`);
const VERB = new RegExp(`^(?:please )?(complete|finish|close|reopen|archive) ${CODE}$`);

const WORDS = { done: ['Done', 'Completed', 'Achieved', 'Returned'], complete: ['Done', 'Completed', 'Achieved'], completed: ['Done', 'Completed', 'Achieved'], finished: ['Done', 'Completed', 'Achieved'], finish: ['Done', 'Completed', 'Achieved'], close: ['Done', 'Completed', 'Closed'], closed: ['Done', 'Completed', 'Closed'], achieved: ['Achieved'], open: ['Open', 'Active', 'Pending'], reopen: ['Open', 'Active', 'Pending'], reopened: ['Open', 'Active', 'Pending'], pending: ['Pending'], active: ['Active'], archived: ['Archived'], archive: ['Archived'] };

const amount = (n, unit) => {
  const base = n === 'an' || n === 'one' ? 1 : n === 'half an' ? 0.5 : Number(n);
  return Math.round(base * (/^h/.test(unit) ? 60 : 1));
};

const draft = (type, resource, body, summary, text, extra = {}) => ({ kind: 'draft', draft: { type, resource, body, summary, ...extra }, text });
const no = (text) => ({ kind: 'none', text });

function mayCreate(key, { registry, config, user }) {
  const r = registry.get(key);
  return r && can(user.role, r.def, 'create', config.roles) ? r : null;
}

export default (registry) => {
  const has = (k) => !!registry.get(k);
  const intents = [];

  if (has('reminders')) {
    intents.push({
      name: 'ADD_REMINDER',
      resource: 'reminders',
      examples: ['remind me to call mum tomorrow at 5pm'],
      match: (t) => { const m = t.match(REMIND); return m ? { rest: m[1] } : null; },
      handle({ rest }, ctx) {
        if (!mayCreate('reminders', ctx)) return no("You don't have permission to add reminders.");
        const when = parseMoment(rest, ctx.now, ctx.tz ?? 0);
        const title = cap(trimTail(when ? when.rest : rest)).slice(0, 120);
        if (!title) return no('What should I remind you about?');
        if (!when) return no(`When should I remind you? Try: "remind me to ${title.toLowerCase()} tomorrow at 5pm".`);
        return draft('create', 'reminders', { title, remindAt: when.date.toISOString() },
          [{ label: 'Reminder', value: title }, { label: 'When', value: when.label }],
          `Ready to remind you to ${title.toLowerCase()} (${when.label}). Tap Confirm to save it.`, { verb: 'Add reminder' });
      },
      respond: (d) => d.text,
    });
  }

  if (has('time-entries')) {
    intents.push({
      name: 'LOG_TIME',
      resource: 'time-entries',
      examples: ['log 30 minutes on the report'],
      match: (t) => { const m = t.match(LOG) ?? t.match(SPENT); return m ? { n: m[1], unit: m[2], what: m[3] } : null; },
      async handle({ n, unit, what }, ctx) {
        if (!mayCreate('time-entries', ctx)) return no("You don't have permission to log time.");
        const minutes = amount(n, unit);
        if (!(minutes >= 1 && minutes <= 1440)) return no('Time entries can be from 1 minute to 24 hours.');
        const body = { what: cap(what.replace(/\s+/g, ' ').trim()).slice(0, 120), minutes, day: localDay(ctx.now, ctx.tz ?? 0) };
        const summary = [{ label: 'What', value: body.what }, { label: 'Minutes', value: String(minutes) }, { label: 'Day', value: body.day }];
        const code = what.match(new RegExp(CODE));
        if (code && has('notes')) {
          const hit = await lookupCode(code[1].toUpperCase(), ctx);
          if (hit.found && hit.key === 'notes') { body.task = hit._id; summary.push({ label: 'Note', value: hit.title }); }
        }
        return draft('create', 'time-entries', body, summary, `Ready to log ${minutes} minutes on "${body.what}". Tap Confirm to save it.`, { verb: 'Log time' });
      },
      respond: (d) => d.text,
    });
  }

  if (has('notes')) {
    intents.push({
      name: 'ADD_NOTE',
      resource: 'notes',
      examples: ['add a note to buy candles due friday'],
      match: (t) => { const m = t.match(NOTE); return m ? { rest: m[1] ?? m[2] } : null; },
      handle({ rest }, ctx) {
        if (!mayCreate('notes', ctx)) return no("You don't have permission to add notes.");
        let text = rest;
        const body = {};
        const pr = text.match(/\b(?:(high|medium|low) priority|priority (high|medium|low))\b/);
        if (pr) { body.priority = cap(pr[1] ?? pr[2]); text = text.replace(pr[0], ' '); }
        if (/\burgent\b/.test(text) && !body.priority) { body.priority = 'High'; text = text.replace(/\burgent\b/, ' '); }
        const range = parseRange(text, ctx.now, ctx.tz ?? 0);
        if (range) { body.dueDate = localDay(new Date(range.from.getTime() + 1), ctx.tz ?? 0); text = range.rest; }
        const title = cap(trimTail(text.replace(/\s+/g, ' ').trim())).slice(0, 120);
        if (!title) return no('What should the note say?');
        body.title = title;
        const summary = [{ label: 'Title', value: title }];
        if (body.priority) summary.push({ label: 'Priority', value: body.priority });
        if (body.dueDate) summary.push({ label: 'Due', value: body.dueDate });
        return draft('create', 'notes', body, summary, `Ready to add the note "${title}"${body.dueDate ? `, due ${body.dueDate}` : ''}${body.priority ? `, ${body.priority.toLowerCase()} priority` : ''}. Tap Confirm to save it.`, { verb: 'Add note' });
      },
      respond: (d) => d.text,
    });
  }

  intents.push({
    name: 'SET_STATUS',
    examples: ['mark N-0006 as done'],
    match(t) {
      const a = t.match(MARK);
      if (a) return { code: a[1], word: a[2].trim() };
      const b = t.match(VERB);
      return b ? { code: b[2], word: b[1] } : null;
    },
    async handle({ code, word }, ctx) {
      const hit = await lookupCode(code.toUpperCase(), ctx);
      if (!hit.found) return no(`I couldn't find anything with the ID ${code.toUpperCase()}.`);
      const r = ctx.registry.get(hit.key);
      if (!can(ctx.user.role, r.def, 'update', ctx.config.roles)) return no(`You don't have permission to change ${r.def.label.toLowerCase()}.`);
      const field = r.def.statusFlow?.field;
      if (!field) return no(`${r.def.label} don't have a status to change.`);
      const wanted = WORDS[word] ?? [];
      const spec = r.def.fields[field];
      const allowed = r.def.statusFlow.transitions[hit.status] ?? [];
      const locked = r.def.statusFlow.workflowOnly ?? [];
      const target = wanted.find((v) => spec.values.includes(v) && allowed.includes(v) && !locked.includes(v))
        ?? spec.values.find((v) => spokenValue(v) === word && allowed.includes(v) && !locked.includes(v));
      if (!target) {
        const options = allowed.filter((v) => !locked.includes(v)).map(spokenValue);
        return no(`"${hit.title}" is ${spokenValue(hit.status ?? '')}${options.length ? `, and can move to: ${options.join(', ')}` : ', and cannot be moved from here'}.`);
      }
      return draft('update', hit.key, { [field]: target }, [{ label: hit.label, value: hit.title }, { label: 'Status', value: `${spokenValue(hit.status)} to ${spokenValue(target)}` }],
        `Ready to move "${hit.title}" from ${spokenValue(hit.status)} to ${spokenValue(target)}. Tap Confirm to do it.`, { id: hit._id, verb: `Mark ${spokenValue(target)}` });
    },
    respond: (d) => d.text,
  });

  return intents;
};
