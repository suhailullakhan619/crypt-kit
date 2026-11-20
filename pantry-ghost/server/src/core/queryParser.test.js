import { defineResource } from './defineResource.js';
import { createRegistry } from './registry.js';
import { normaliseUtterance } from './utterance.js';
import { parseQuestion } from './queryParser.js';
import config from '../../crypt.config.js';

const [, midRole] = config.roles;
const perms = { read: [midRole], create: [midRole], update: [midRole], delete: [] };

const tasks = defineResource({
  key: 'tasks',
  label: 'Tasks',
  titleField: 'title',
  fields: {
    title: { type: 'string', label: 'Title', required: true, list: true, search: true },
    status: { type: 'enum', label: 'Status', values: ['Open', 'Done', 'Overdue', 'OnHold'], default: 'Open', list: true, filter: true },
    priority: { type: 'enum', label: 'Priority', values: ['Low', 'Medium', 'High'], list: true, filter: true },
    owner: { type: 'ref', label: 'Owner', ref: 'User', list: true, filter: true },
    dueDate: { type: 'date', label: 'Due date', list: true },
    pinned: { type: 'boolean', label: 'Pinned', filter: true },
  },
  permissions: perms,
  statusFlow: { field: 'status', transitions: { Open: ['Done', 'OnHold'], Overdue: ['Done'], Done: ['Open'], OnHold: ['Open'] } },
  due: { field: 'dueDate', status: 'status', from: ['Open'], to: 'Overdue' },
  voice: { synonyms: ['tasks', 'to-dos'] },
});

const entries = defineResource({
  key: 'entries',
  label: 'Time log',
  titleField: 'what',
  fields: {
    what: { type: 'string', label: 'What', required: true, list: true, search: true },
    minutes: { type: 'number', label: 'Minutes', min: 1, list: true },
    day: { type: 'date', label: 'Day', list: true },
    person: { type: 'ref', label: 'Logged by', ref: 'User', filter: true },
  },
  permissions: perms,
  voice: { synonyms: ['time log', 'time entries'] },
});

const reminders = defineResource({
  key: 'reminders',
  label: 'Reminders',
  titleField: 'title',
  fields: { title: { type: 'string', label: 'Reminder', required: true, search: true }, status: { type: 'enum', label: 'Status', values: ['Pending', 'Done'], filter: true } },
  permissions: perms,
});

const registry = createRegistry([tasks, entries, reminders]);
const NOW = new Date('2026-11-19T10:00:00.000Z'); // a Thursday
const parse = (text, extra = {}) => parseQuestion(normaliseUtterance(text), { registry, now: NOW, ...extra });

describe('which resource, and what kind of answer', () => {
  test('counts and lists, plural or singular, by any of the resource\'s spoken names', () => {
    expect(parse('how many tasks are there')).toMatchObject({ resource: 'tasks', aggregate: 'count' });
    expect(parse('list the to-dos')).toMatchObject({ resource: 'tasks', aggregate: 'list' });
    expect(parse('show me a task')).toMatchObject({ resource: 'tasks' });
    expect(parse('how many time entries do we have')).toMatchObject({ resource: 'entries', aggregate: 'count' });
  });

  test('forgives a one-letter typo in a longer name', () => {
    expect(parse('which remindrs are overdue')).toMatchObject({ resource: 'reminders' });
    expect(parse('show my reminderz')).toMatchObject({ resource: 'reminders', mine: true });
  });

  test('text that names nothing it knows is not a question for it', () => {
    expect(parse('zzz qqq')).toBeNull();
    expect(parse('the weather is lovely today')).toBeNull();
    expect(parse('')).toBeNull();
  });
});

describe('filters', () => {
  test('values of any filterable enum: "high priority", "open"', () => {
    expect(parse('how many high priority tasks are open')).toMatchObject({ aggregate: 'count', filters: { priority: 'High', status: 'Open' } });
    expect(parse('show low priority tasks').filters).toEqual({ priority: 'Low' });
    expect(parse('tasks on hold').filters).toEqual({ status: 'OnHold' });
  });

  test('"overdue" in any spelling is the due rule, not a plain status value', () => {
    for (const q of ['which tasks are overdue', 'which tasks are over due', 'tasks that are late', 'overdue tasks']) {
      const s = parse(q);
      expect(s).toMatchObject({ resource: 'tasks', overdue: true });
      expect(s.filters).toEqual({});
    }
  });

  test('negation becomes an exclusion', () => {
    expect(parse('tasks that are not done').exclude).toEqual({ status: ['Done'] });
    expect(parse('how many tasks excluding low priority').exclude).toEqual({ priority: ['Low'] });
  });

  test('"unfinished" style words mean "still open" when there is a due rule', () => {
    expect(parse('what tasks are unfinished')).toMatchObject({ openOnly: true });
    expect(parse('outstanding tasks')).toMatchObject({ openOnly: true });
  });

  test('mine, and someone else\'s', () => {
    expect(parse('show my tasks')).toMatchObject({ mine: true });
    expect(parse('tasks assigned to me')).toMatchObject({ mine: true });
    expect(parse('tasks assigned to igor')).toMatchObject({ assignee: 'igor' });
    expect(parse('tasks assigned to everyone').assignee).toBeUndefined();
  });

  test('text search: "about", "called", "containing"', () => {
    expect(parse('find tasks about candles').search).toBe('candles');
    expect(parse('which tasks mention the crystal ball').search).toBe('crystal ball');
    expect(parse('tasks called buy milk due today').search).toBe('buy milk');
    expect(parse('find tasks').search).toBeUndefined(); // the resource's own name is not a search word
  });
});

describe('dates', () => {
  test('"due this week" ranges over the due date and only counts unfinished work', () => {
    const s = parse('show my tasks due this week');
    expect(s.range).toMatchObject({ field: 'dueDate', label: 'this week' });
    expect(s.range.from.toISOString()).toBe('2026-11-16T00:00:00.000Z');
    expect(s).toMatchObject({ mine: true, openOnly: true });
  });

  test('"added" ranges over the creation time', () => {
    expect(parse('how many tasks were added this month').range.field).toBe('createdAt');
  });

  test('a past range is not limited to unfinished work', () => {
    expect(parse('which tasks were due last week').openOnly).toBeUndefined();
  });

  test('resources without a due rule use their own date field', () => {
    expect(parse('show the time log this week').range.field).toBe('day');
  });

  test('the asker\'s timezone shifts the day', () => {
    const s = parse('tasks due today', { now: new Date('2026-11-19T22:00:00.000Z'), tz: -330 });
    expect(s.range.from.toISOString()).toBe('2026-11-19T18:30:00.000Z');
  });
});

describe('totals', () => {
  test('sum a number field by its spoken label, in minutes or hours', () => {
    expect(parse('total minutes this week')).toMatchObject({ resource: 'entries', aggregate: 'sum', field: 'minutes' });
    expect(parse('how many minutes did i log last week')).toMatchObject({ aggregate: 'sum', mine: true });
    expect(parse('how much time did i log today')).toMatchObject({ aggregate: 'sum', field: 'minutes' });
    expect(parse('how many hours in the time log this month')).toMatchObject({ aggregate: 'sum', unit: 'hours' });
    expect(parse('average minutes in the time log')).toMatchObject({ aggregate: 'avg' });
  });

  test('"how many tasks" counts records, it does not sum', () => {
    expect(parse('how many tasks are there').aggregate).toBe('count');
  });
});

describe('questions about everything', () => {
  test('"what is overdue" with no resource asks every resource', () => {
    expect(parse('what is overdue')).toMatchObject({ all: true, overdue: true });
    expect(parse('what do i have due this week')).toMatchObject({ all: true, mine: true });
    expect(parse('find candles')).toMatchObject({ all: true, search: 'candles' });
  });
});

describe('limits and order', () => {
  test('"top 3", "latest", "oldest"', () => {
    expect(parse('show the top 3 tasks').limit).toBe(3);
    expect(parse('latest tasks').sort).toBe('-createdAt');
    expect(parse('show the oldest task').sort).toBe('createdAt');
  });
});
