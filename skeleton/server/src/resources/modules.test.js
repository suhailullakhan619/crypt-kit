// The example modules shipped with Crypt Kit: notes, projects, reminders, goals and the time log.
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../app.js';
import { startDb, makeActor } from '../../test/db.js';
import { TEST_SECRET } from '../../test/helpers.js';
import { runSeed } from '../seed/index.js';
import notes from './notes.js';
import projects from './projects.js';
import reminders from './reminders.js';
import goals, { milestoneProgress } from './goals.js';
import timeEntries from './time-entries.js';

const bearer = (a) => ({ Authorization: `Bearer ${jwt.sign({ userId: a.userId, role: a.role, name: a.name }, TEST_SECRET)}` });
let db;
let app;
let member;
let viewer;
let M;
let V;

beforeAll(async () => {
  db = await startDb([notes, projects, reminders, goals, timeEntries]);
  app = await createApp();
  member = await makeActor('Member', 'Mina');
  viewer = await makeActor('Viewer', 'Vic');
  M = bearer(member);
  V = bearer(viewer);
});
afterAll(() => db.stop());

const post = (key, body, who = M) => request(app).post(`/api/r/${key}`).set(who).send(body);
const patch = (key, id, body, who = M) => request(app).patch(`/api/r/${key}/${id}`).set(who).send(body);

describe('the modules are wired in', () => {
  test('all five appear in /api/meta, and the viewer can read them but not create', async () => {
    const meta = await request(app).get('/api/meta').set(V);
    expect(meta.body.resources.map((r) => r.key).sort()).toEqual(['goals', 'notes', 'projects', 'reminders', 'time-entries']);
    for (const key of ['projects', 'reminders', 'goals', 'time-entries']) {
      expect((await request(app).get(`/api/r/${key}`).set(V)).status).toBe(200);
      expect((await post(key, { name: 'x', title: 'x', what: 'x', minutes: 5, remindAt: new Date() }, V)).status).toBe(403);
    }
  });

  test('a note can belong to a project, and notes can be filtered by it', async () => {
    const project = (await post('projects', { name: 'Haunt the attic' })).body.item;
    const inProject = (await post('notes', { title: 'Buy chains', project: project._id })).body.item;
    await post('notes', { title: 'Unrelated' });
    expect(project.owner?._id ?? project.owner).toBe(member.userId); // defaults to the creator
    const list = await request(app).get(`/api/r/notes?project=${project._id}`).set(M);
    expect(list.body.items.map((n) => n._id)).toEqual([inProject._id]);
    expect(list.body.items[0].project.name).toBe('Haunt the attic');
  });

  test('global search finds records in the new modules', async () => {
    await post('goals', { title: 'Unique-goal-xyz' });
    const res = await request(app).get('/api/search?q=unique-goal').set(V);
    expect(res.body.results.find((g) => g.key === 'goals')?.items[0].title).toBe('Unique-goal-xyz');
  });
});

describe('goals', () => {
  test('progress is worked out from the milestones and cannot be set by hand', async () => {
    const created = (await post('goals', { title: 'Finish the tower', milestones: [{ text: 'a', done: true }, { text: 'b', done: false }, { text: 'c', done: false }, { text: 'd', done: false }] })).body.item;
    expect(created.progress).toBe(25);
    const ticked = (await patch('goals', created._id, { milestones: [{ text: 'a', done: true }, { text: 'b', done: true }, { text: 'c', done: true }, { text: 'd', done: false }] })).body.item;
    expect(ticked.progress).toBe(75);
    const forged = (await patch('goals', created._id, { progress: 5 })).body.item;
    expect(forged.progress).toBe(75);
    const moved = (await patch('goals', created._id, { status: 'Achieved' })).body.item;
    expect(moved.status).toBe('Achieved');
    expect(moved.progress).toBe(75);
  });

  test('milestoneProgress rounds and treats an empty list as 0', () => {
    expect(milestoneProgress(undefined)).toBe(0);
    expect(milestoneProgress([])).toBe(0);
    expect(milestoneProgress([{ done: true }, { done: false }, { done: false }])).toBe(33);
  });
});

describe('reminders', () => {
  test('start Pending and owned by their creator; only allowed moves work; Missed is set by the sweeper', async () => {
    const r = (await post('reminders', { title: 'Call mum', remindAt: new Date(Date.now() + 3600000).toISOString() })).body.item;
    expect(r.status).toBe('Pending');
    expect(r.owner?._id ?? r.owner).toBe(member.userId);
    expect((await patch('reminders', r._id, { status: 'Missed' })).status).toBe(409); // not a manual move
    expect((await patch('reminders', r._id, { status: 'Done' })).body.item.status).toBe('Done');
    expect((await patch('reminders', r._id, { status: 'Pending' })).body.item.status).toBe('Pending'); // reopen
  });

  test('a reminder needs a time', async () => {
    const res = await post('reminders', { title: 'No time' });
    expect(res.status).toBe(400);
    expect(res.body.fields.remindAt).toBeTruthy();
  });
});

describe('time log', () => {
  test('defaults to today and to the person logging it; limits minutes; members can delete', async () => {
    const e = (await post('time-entries', { what: 'Wrote the report', minutes: 45 })).body.item;
    expect(e.person?._id ?? e.person).toBe(member.userId);
    expect(new Date(e.day).toDateString()).toBe(new Date().toDateString());
    expect((await post('time-entries', { what: 'None', minutes: 0 })).status).toBe(400);
    expect((await post('time-entries', { what: 'Too long', minutes: 1441 })).status).toBe(400);
    expect((await request(app).delete(`/api/r/time-entries/${e._id}`).set(M)).status).toBe(204);
  });

  test('an entry can point at a note and be filtered by it', async () => {
    const note = (await post('notes', { title: 'Plan the launch' })).body.item;
    const e = (await post('time-entries', { what: 'Outline', minutes: 20, task: note._id })).body.item;
    await post('time-entries', { what: 'Elsewhere', minutes: 10 });
    const list = await request(app).get(`/api/r/time-entries?task=${note._id}`).set(M);
    expect(list.body.items.map((x) => x._id)).toEqual([e._id]);
  });
});

describe('projects', () => {
  test('follow their status flow and are archived rather than deleted', async () => {
    const p = (await post('projects', { name: 'Moat repairs' })).body.item;
    expect(p.status).toBe('Planning');
    expect((await patch('projects', p._id, { status: 'Completed' })).status).toBe(409); // Planning cannot jump to Completed
    expect((await patch('projects', p._id, { status: 'Active' })).body.item.status).toBe('Active');
    expect((await request(app).delete(`/api/r/projects/${p._id}`).set(bearer(await makeActor('Admin', 'Ada')))).status).toBe(200); // archived, not removed
    const hidden = await request(app).get('/api/r/projects?limit=100').set(M);
    expect(hidden.body.items.some((x) => x._id === p._id)).toBe(false);
  });
});

describe('demo data', () => {
  test('seeds every module, links notes to projects, and goal progress matches its milestones', async () => {
    await db.clear();
    await runSeed(db.registry, { log: () => {} });
    const count = (m) => m.model.countDocuments();
    expect([await count(projects), await count(reminders), await count(goals), await count(timeEntries), await count(notes)]).toEqual([5, 5, 3, 8, 8]);
    expect(await notes.model.countDocuments({ project: { $ne: null } })).toBeGreaterThanOrEqual(5);
    for (const g of await goals.model.find().lean()) expect(g.progress).toBe(milestoneProgress(g.milestones));
    expect(await reminders.model.countDocuments({ note: { $ne: null } })).toBe(1);
  });
});
