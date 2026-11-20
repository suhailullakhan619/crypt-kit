import { defineResource } from '../core/defineResource.js';
import { buildIntents } from '../core/intentRegistry.js';
import { runQuery, runOverview, lookupCode } from '../core/queryEngine.js';
import { answer, examples } from './voiceService.js';
import { setConverseForTests, specFromTool } from './assistantService.js';
import { startDb, makeActor } from '../../test/db.js';
import '../models/ActivityLog.js';
import config from '../../crypt.config.js';

const [superRole, midRole] = config.roles;
const DAY = 86400000;
const NOW = new Date('2026-11-19T10:00:00.000Z'); // a Thursday
const at = (days, hour = 12) => new Date(Date.UTC(2026, 10, 19 + days, hour));

const tasks = defineResource({
  key: 'tasks',
  label: 'Tasks',
  titleField: 'title',
  fields: {
    code: { type: 'string', label: 'ID', unique: true },
    title: { type: 'string', label: 'Title', required: true, list: true, search: true },
    status: { type: 'enum', label: 'Status', values: ['Open', 'Done', 'Overdue', 'Archived'], default: 'Open', list: true, filter: true },
    priority: { type: 'enum', label: 'Priority', values: ['Low', 'Medium', 'High'], list: true, filter: true },
    owner: { type: 'ref', label: 'Owner', ref: 'User', list: true, filter: true },
    dueDate: { type: 'date', label: 'Due date', list: true },
    secretNote: { type: 'string', label: 'Secret', secret: true },
  },
  permissions: { read: [midRole], create: [midRole], update: [midRole], delete: [] },
  statusFlow: { field: 'status', transitions: { Open: ['Done', 'Archived'], Overdue: ['Done'], Done: ['Open'], Archived: ['Open'] } },
  due: { field: 'dueDate', status: 'status', from: ['Open'], to: 'Overdue' },
  softDelete: { field: 'status', value: 'Archived', at: 'archivedAt' },
  voice: { synonyms: ['tasks'] },
});

const entries = defineResource({
  key: 'entries',
  label: 'Time log',
  titleField: 'what',
  fields: {
    what: { type: 'string', label: 'What', required: true, list: true, search: true },
    minutes: { type: 'number', label: 'Minutes', list: true },
    day: { type: 'date', label: 'Day', list: true },
    person: { type: 'ref', label: 'Logged by', ref: 'User', filter: true },
  },
  permissions: { read: [midRole], create: [midRole], update: [midRole], delete: [] },
  voice: { synonyms: ['time log'] },
});

// readable by the superuser only
const vault = defineResource({
  key: 'vault',
  label: 'Vault',
  titleField: 'name',
  fields: { name: { type: 'string', label: 'Name', required: true, search: true } },
  permissions: { read: [], create: [], update: [], delete: [] },
  voice: { synonyms: ['vault items'] },
});

let db;
let mina;
let igor;
let boss;
let ctx;
const run = (spec, user = mina) => runQuery(spec, { registry: db.registry, config, user });
const ask = (text, user = mina, opts = {}) => answer(text, user, { now: NOW, ...opts });

beforeAll(async () => {
  db = await startDb([tasks, entries, vault]);
  ctx = db.ctx;
  ctx.intents = await buildIntents(db.registry, { appIntents: [] });
  mina = await makeActor(midRole, 'Mina');
  igor = await makeActor(midRole, 'Igor');
  boss = await makeActor(superRole, 'Boss');
  const t = (n, extra) => ({ code: `T-000${n}`, title: `Task ${n}`, status: 'Open', priority: 'Low', ...extra });
  await tasks.model.create([
    t(1, { title: 'Buy candles', priority: 'High', owner: mina.userId, dueDate: at(2) }),
    t(2, { title: 'Polish the crystal ball (50% off)', priority: 'High', owner: igor.userId, dueDate: at(-3), status: 'Overdue' }),
    t(3, { title: 'Renew broom insurance', priority: 'Medium', owner: mina.userId, dueDate: at(-1), status: 'Overdue' }),
    t(4, { title: 'Order cobwebs', owner: mina.userId, dueDate: at(20) }),
    t(5, { title: 'Write the report', status: 'Done', owner: igor.userId, dueDate: at(1) }),
    t(6, { title: 'Old task', status: 'Archived', owner: mina.userId }),
    t(7, { title: 'Due today at noon', owner: mina.userId, dueDate: at(0, 12) }),
  ]);
  await entries.model.create([
    { what: 'Sorted bottles', minutes: 60, day: at(0), person: mina.userId },
    { what: 'Phoned supplier', minutes: 30, day: at(-1), person: mina.userId },
    { what: 'Planning', minutes: 90, day: at(-2), person: igor.userId },
    { what: 'Last month', minutes: 500, day: new Date(Date.UTC(2026, 9, 5)), person: mina.userId },
  ]);
  await vault.model.create([{ name: 'Crown jewels' }]);
});
afterAll(() => db.stop());
afterEach(() => { setConverseForTests(null); delete ctx.env.ASSISTANT; });

describe('query engine', () => {
  test('filters by value, excludes, and never returns soft-deleted records', async () => {
    const high = await run({ resource: 'tasks', filters: { priority: 'High' } });
    expect(high.total).toBe(2);
    const notDone = await run({ resource: 'tasks', aggregate: 'count', exclude: { status: ['Done'] } });
    expect(notDone.total).toBe(5); // archived and done are both out
    expect((await run({ resource: 'tasks', aggregate: 'count' })).total).toBe(6);
  });

  test('overdue uses the due rule; open-only skips finished work', async () => {
    const over = await run({ resource: 'tasks', overdue: true });
    expect(over.items.map((i) => i.title)).toEqual(['Polish the crystal ball (50% off)', 'Renew broom insurance']); // oldest due date first
    const range = { field: 'dueDate', from: at(0, 0), to: at(3, 0), label: 'x' };
    const soon = await run({ resource: 'tasks', openOnly: true, range });
    expect(soon.items.map((i) => i.title).sort()).toEqual(['Buy candles', 'Due today at noon']); // 'Write the report' is Done
  });

  test('mine and assigned-to', async () => {
    expect((await run({ resource: 'tasks', aggregate: 'count', mine: true })).total).toBe(4);
    expect((await run({ resource: 'tasks', aggregate: 'count', mine: true }, igor)).total).toBe(2);
    expect((await run({ resource: 'tasks', aggregate: 'count', assignee: 'igo' })).total).toBe(2);
    expect((await run({ resource: 'tasks', aggregate: 'count', assignee: 'nobody' })).total).toBe(0);
  });

  test('search is plain text: regex characters mean themselves', async () => {
    expect((await run({ resource: 'tasks', search: 'candles' })).total).toBe(1);
    expect((await run({ resource: 'tasks', search: '(50% off)' })).total).toBe(1);
    expect((await run({ resource: 'tasks', search: '.*' })).total).toBe(0);
    expect((await run({ resource: 'tasks', search: 't-0003' })).total).toBe(1); // IDs are searchable too
  });

  test('sum and average over a number field, with a date range', async () => {
    const week = { field: 'day', from: at(-6, 0), to: at(1, 0), label: 'this week' };
    const sum = await run({ resource: 'entries', aggregate: 'sum', field: 'minutes', range: week });
    expect(sum).toMatchObject({ sum: 180, total: 3, fieldLabel: 'Minutes' });
    const mine = await run({ resource: 'entries', aggregate: 'avg', field: 'minutes', range: week, mine: true });
    expect(mine.average).toBe(45);
    expect((await run({ resource: 'entries', aggregate: 'sum', field: 'what' })).unsupported).toBe(true); // not a number
  });

  test('refuses what the asker may not read, and what does not apply', async () => {
    expect(await run({ resource: 'vault' })).toEqual({ denied: true, label: 'Vault' });
    expect((await run({ resource: 'vault' }, boss)).total).toBe(1);
    expect((await run({ resource: 'entries', overdue: true })).unsupported).toBe(true); // no due rule
    expect((await run({ resource: 'nothing' })).unsupported).toBe(true);
  });

  test('secret fields cannot be filtered on, and the list is capped', async () => {
    expect((await run({ resource: 'tasks', aggregate: 'count', filters: { secretNote: 'x' } })).total).toBe(6);
    expect((await run({ resource: 'tasks', limit: 999 })).items.length).toBeLessThanOrEqual(10);
    expect((await run({ resource: 'tasks', limit: 2 })).hasMore).toBe(true);
  });

  test('overview counts what is overdue and due soon, and the asker\'s share', async () => {
    const o = await runOverview({ registry: db.registry, config, user: mina, now: NOW });
    expect(o.rows).toEqual([{ key: 'tasks', label: 'Tasks', overdue: 2, dueSoon: 2, mineOverdue: 1, mineDueSoon: 2 }]);
    expect(o.items[0]).toMatchObject({ kind: 'overdue', title: 'Renew broom insurance' }); // the asker's own overdue first
  });

  test('looks a record up by its ID, only where the asker may read', async () => {
    expect(await lookupCode('t-0001', { registry: db.registry, config, user: mina })).toMatchObject({ found: true, key: 'tasks', title: 'Buy candles', status: 'Open' });
    expect((await lookupCode('T-9999', { registry: db.registry, config, user: mina })).found).toBe(false);
  });
});

describe('asking in plain words', () => {
  test('the question that started this: "over due" with a space', async () => {
    const r = await ask('which tasks are over due');
    expect(r.intent).toBe('LIST_OVERDUE');
    expect(r.answer).toContain('2 tasks are overdue');
  });

  test('counts with several filters, in a sentence that says what was counted', async () => {
    const r = await ask('how many high priority tasks are open');
    expect(r.intent).toBe('QUERY');
    expect(r.answer).toBe('There is 1 task (status open, priority high).');
    expect(r.data).toMatchObject({ kind: 'query', total: 1, link: '/r/tasks?status=Open&priority=High' });
  });

  test('lists mine due this week, and links to the same list', async () => {
    const r = await ask('show my tasks due this week');
    expect(r.answer).toMatch(/^2 tasks \(not finished, yours, due this week\): /);
    expect(r.data.link).toMatch(/^\/r\/tasks\?owner=[0-9a-f]{24}&dueDate_from=2026-11-16&dueDate_to=2026-11-22$/);
  });

  test('totals, in hours when asked', async () => {
    expect((await ask('how many minutes did i log this week')).answer).toContain('90');
    expect((await ask('how many hours did i log this week')).answer).toMatch(/1\.5 hours/);
    expect((await ask('total minutes in the time log this month')).answer).toContain('180');
  });

  test('overview, lookup, help and greetings', async () => {
    expect((await ask('what is on my plate')).answer).toMatch(/^Overdue: 2 \(1 yours\)\. Due in the next 7 days: 2 \(2 yours\)\./);
    expect((await ask('tell me about T-0001')).answer).toMatch(/^Tasks: "Buy candles" is open/);
    expect((await ask('show T-9999')).answer).toContain("couldn't find anything with the ID T-9999");
    expect((await ask('hello')).answer).toBe('Hello, Mina! Ask me about your records, or say help to see what I can do.');
    expect((await ask('thanks')).answer).toContain("You're welcome");
    expect((await ask('what can you do')).answer).toContain('Try:');
  });

  test('questions about everything', async () => {
    const r = await ask('what is overdue');
    expect(r.answer).toMatch(/^2 records \(overdue\): 2 in Tasks\./);
    expect(r.data.items.map((i) => i.key)).toEqual(['tasks', 'tasks']);
    expect((await ask('find candles')).answer).toContain('1 in Tasks');
  });

  test('the asker\'s timezone decides what "today" is', async () => {
    const late = new Date('2026-11-19T22:00:00.000Z'); // already the 20th in India
    const utc = await ask('how many tasks are due today', mina, { now: late });
    const india = await ask('how many tasks are due today', mina, { now: late, tzOffset: -330 });
    expect(utc.data.total).toBe(1); // noon on the 19th is "today" in UTC
    expect(india.data.total).toBe(0); // ...but yesterday in India
  });

  test('a role that cannot read the resource is told so, and nothing is queried', async () => {
    const r = await ask('how many vault items are there', mina);
    expect(r.answer).toBe("Sorry, you don't have access to Vault.");
    expect((await ask('how many vault items are there', boss)).answer).toMatch(/1/);
    expect(JSON.stringify((await ask('what is overdue', mina)).data)).not.toContain('Crown jewels');
  });

  test('unrelated text gets a helpful fallback with examples for this user', async () => {
    const r = await ask('zzz qqq');
    expect(r.intent).toBe('UNKNOWN');
    expect(r.answer).toMatch(/Try something like "what is on my plate"/);
    expect(r.answer).not.toMatch(/vault/i);
  });

  test('example chips are role-aware and varied', () => {
    const list = examples(mina);
    expect(list.length).toBeGreaterThan(3);
    expect(list.length).toBeLessThanOrEqual(8);
    expect(list.join(' ')).not.toMatch(/vault/i);
    expect(list).toContain('what is on my plate');
  });
});

describe('optional language-model assistant', () => {
  const FREEFORM = 'give me a rundown of the urgent stuff please';
  const enable = () => { ctx.env.ASSISTANT = { modelId: 'test-model', region: 'us-east-1' }; };
  const toolUse = (input, name = 'query_records') => ({ output: { message: { role: 'assistant', content: [{ toolUse: { toolUseId: 't1', name, input } }] } }, stopReason: 'tool_use' });
  const say = (text) => ({ output: { message: { role: 'assistant', content: [{ text }] } }, stopReason: 'end_turn' });

  test('is off by default: free-form questions get the normal fallback and no model is called', async () => {
    const spy = jestFn();
    setConverseForTests(spy);
    expect((await ask(FREEFORM)).intent).toBe('UNKNOWN');
    expect(spy.calls).toBe(0);
  });

  test('asks the model, runs its tool call through the permission-checked engine, and returns its words', async () => {
    enable();
    const seen = [];
    setConverseForTests(async (params) => {
      seen.push(structuredClone(params));
      return seen.length === 1 ? toolUse({ resource: 'tasks', overdue: true }) : say('You have 2 overdue tasks, the oldest is the crystal ball polish.');
    });
    const r = await ask(FREEFORM);
    expect(r).toMatchObject({ intent: 'ASSISTANT', answer: 'You have 2 overdue tasks, the oldest is the crystal ball polish.' });
    expect(r.data.items.map((i) => i.title)).toContain('Renew broom insurance');
    // the second call carries the tool result back to the model
    const result = seen[1].messages.at(-1).content[0].toolResult.content[0].json;
    expect(result).toMatchObject({ resource: 'tasks', total: 2 });
  });

  test('the model is only told about, and offered, what this user can read', async () => {
    enable();
    let first;
    setConverseForTests(async (params) => { first ??= structuredClone(params); return say('ok'); });
    await ask(FREEFORM, mina);
    expect(first.system[0].text).toContain('tasks');
    expect(first.system[0].text).not.toContain('vault');
    expect(first.toolConfig.tools[0].toolSpec.inputSchema.json.properties.resource.enum).toEqual(['tasks', 'entries']);
    expect(first.system[0].text).toContain('Today is 2026-11-19');
  });

  test('a tool call for a resource the user cannot read comes back denied, whatever the model says', async () => {
    enable();
    const seen = [];
    setConverseForTests(async (params) => { seen.push(structuredClone(params)); return seen.length === 1 ? toolUse({ resource: 'vault' }) : say('I could not read that.'); });
    await ask(FREEFORM, mina);
    expect(seen[1].messages.at(-1).content[0].toolResult.content[0].json).toEqual({ denied: true, label: 'Vault' });
  });

  test('overview and ID lookup tools work too', async () => {
    enable();
    const seen = [];
    setConverseForTests(async (params) => { seen.push(structuredClone(params)); return seen.length === 1 ? toolUse({}, 'overview') : seen.length === 2 ? toolUse({ code: 'T-0001' }, 'lookup_id') : say('done'); });
    // the model asks for two tools in a row
    await ask(FREEFORM);
    expect(seen[1].messages.at(-1).content[0].toolResult.content[0].json.rows[0]).toMatchObject({ key: 'tasks', overdue: 2 });
    expect(seen[2].messages.at(-1).content[0].toolResult.content[0].json).toMatchObject({ found: true, title: 'Buy candles' });
  });

  test('if the model fails, the user still gets the normal fallback', async () => {
    enable();
    setConverseForTests(async () => { throw new Error('AccessDeniedException'); });
    const spy = jestSpy();
    const r = await ask(FREEFORM);
    spy.restore();
    expect(r.intent).toBe('UNKNOWN');
    expect(r.answer).toContain('Try something like');
  });

  test('a model that never stops calling tools is cut off', async () => {
    enable();
    let n = 0;
    setConverseForTests(async () => { n += 1; return toolUse({ resource: 'tasks' }); });
    expect((await ask(FREEFORM)).intent).toBe('UNKNOWN');
    expect(n).toBe(4);
  });

  test('free-form questions are rate limited per user', async () => {
    enable();
    setConverseForTests(async () => say('fine'));
    const flood = await makeActor(midRole, 'Flood');
    for (let i = 0; i < 20; i++) expect((await ask(FREEFORM, flood)).intent).toBe('ASSISTANT');
    expect((await ask(FREEFORM, flood)).answer).toContain('a lot of free-form questions');
  });

  test('tool arguments are sanitised: unknown fields, bad dates and non-integers are dropped', () => {
    const spec = specFromTool({ resource: 'tasks', aggregate: 'drop table', filters: { priority: 'High', bad: 5 }, from: 'yesterday', to: '2026-11-30', limit: 'lots', evil: true, mine: 'yes' }, db.registry);
    expect(spec).toMatchObject({ resource: 'tasks', aggregate: 'list', filters: { priority: 'High' } });
    expect(spec.limit).toBeUndefined();
    expect(spec.mine).toBeUndefined();
    expect(spec.evil).toBeUndefined();
    expect(spec.range.to.toISOString()).toBe('2026-12-01T00:00:00.000Z'); // "to" is inclusive of the whole day
    expect(spec.range.from.getTime()).toBe(0);
  });
});

function jestFn() { const f = async () => { f.calls += 1; return { output: { message: { role: 'assistant', content: [{ text: 'x' }] } } }; }; f.calls = 0; return f; }
function jestSpy() { const orig = console.error; console.error = () => {}; return { restore: () => { console.error = orig; } }; }
