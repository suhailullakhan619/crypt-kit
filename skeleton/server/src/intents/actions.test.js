// Chat actions for Crypt Kit: they only ever produce drafts, and respect permissions.
import { buildIntents } from '../core/intentRegistry.js';
import { answer } from '../services/voiceService.js';
import { startDb, makeActor } from '../../test/db.js';
import '../models/ActivityLog.js';
import notes from '../resources/notes.js';
import projects from '../resources/projects.js';
import reminders from '../resources/reminders.js';
import goals from '../resources/goals.js';
import timeEntries from '../resources/time-entries.js';
import actions from './actions.js';

const NOW = new Date('2026-11-19T10:00:00.000Z'); // Thursday
let db;
let member;
let viewer;
let note;
const ask = (text, user = member, opts = {}) => answer(text, user, { now: NOW, ...opts });

beforeAll(async () => {
  db = await startDb([notes, projects, reminders, goals, timeEntries]);
  db.ctx.intents = await buildIntents(db.registry, { appIntents: actions(db.registry) });
  member = await makeActor('Member', 'Mina');
  viewer = await makeActor('Viewer', 'Vic');
  note = await notes.model.create({ title: 'Buy candles', code: 'N-0006', status: 'Open', owner: member.userId });
});
afterAll(() => db.stop());

describe('drafts, never writes', () => {
  test('"add a note" with a due day and a priority', async () => {
    const r = await ask('add a note to buy candles due friday high priority');
    expect(r.intent).toBe('ADD_NOTE');
    expect(r.data.draft).toMatchObject({ type: 'create', resource: 'notes', body: { title: 'Buy candles', priority: 'High', dueDate: '2026-11-20' }, verb: 'Add note' });
    expect(r.answer).toContain('Tap Confirm');
    expect(await notes.model.countDocuments()).toBe(1); // nothing was saved
  });

  test('a plain note, and the other ways to say it', async () => {
    expect((await ask('create a task called water the plants')).data.draft.body).toEqual({ title: 'Water the plants' });
    expect((await ask('jot down call the plumber tomorrow')).data.draft.body).toMatchObject({ title: 'Call the plumber', dueDate: '2026-11-20' });
    expect((await ask('add a note')).intent).not.toBe('ADD_NOTE'); // nothing to write
  });

  test('"my to do list" is a question, not a new note', async () => {
    expect((await ask('my to do list')).intent).toBe('OVERVIEW');
  });

  test('a reminder needs a time, and uses the asker\'s clock', async () => {
    const r = await ask('remind me to call mum tomorrow at 5pm');
    expect(r.data.draft).toMatchObject({ type: 'create', resource: 'reminders', body: { title: 'Call mum', remindAt: '2026-11-20T17:00:00.000Z' } });
    const india = await ask('remind me to call mum tomorrow at 5pm', member, { tzOffset: -330 });
    expect(india.data.draft.body.remindAt).toBe('2026-11-20T11:30:00.000Z');
    const missing = await ask('remind me to call mum');
    expect(missing.data.draft).toBeUndefined();
    expect(missing.answer).toContain('When should I remind you?');
    expect((await ask('remind me in 2 hours to stretch')).data.draft.body.remindAt).toBe('2026-11-19T12:00:00.000Z');
  });

  test('log time, in minutes or hours, optionally against a note by its ID', async () => {
    const r = await ask('log 30 minutes on the quarterly report');
    expect(r.data.draft).toMatchObject({ resource: 'time-entries', body: { what: 'The quarterly report', minutes: 30, day: '2026-11-19' } });
    expect((await ask('log 2 hours on planning')).data.draft.body.minutes).toBe(120);
    expect((await ask('log half an hour on email')).data.draft.body.minutes).toBe(30);
    expect((await ask('i spent 45 minutes on filing')).data.draft.body.minutes).toBe(45);
    const linked = await ask('log 20 minutes on N-0006');
    expect(linked.data.draft.body.task).toBe(String(note._id));
    expect((await ask('log 5000 minutes on a very long day')).data.draft).toBeUndefined();
  });

  test('mark an item done by its ID; only moves the flow allows', async () => {
    const r = await ask('mark N-0006 as done');
    expect(r.data.draft).toMatchObject({ type: 'update', resource: 'notes', id: String(note._id), body: { status: 'Done' } });
    expect((await ask('complete n-0006')).data.draft.body).toEqual({ status: 'Done' });
    expect((await ask('archive N-0006')).data.draft.body).toEqual({ status: 'Archived' });
    const bad = await ask('mark N-0006 as banana');
    expect(bad.data.draft).toBeUndefined();
    expect(bad.answer).toContain('can move to');
    expect((await ask('mark N-9999 as done')).answer).toContain("couldn't find");
  });
});

describe('permissions', () => {
  test('a viewer cannot add, remind, log or change anything', async () => {
    for (const q of ['add a note to buy candles', 'remind me to call mum tomorrow at 5pm', 'log 30 minutes on the report', 'mark N-0006 as done']) {
      const r = await ask(q, viewer);
      expect(r.data?.draft).toBeUndefined();
      expect(r.answer).toMatch(/permission|access/i);
    }
    expect(await notes.model.findById(note._id).then((n) => n.status)).toBe('Open');
  });
});
