import request from 'supertest';
import jwt from 'jsonwebtoken';
import { defineResource } from '../core/defineResource.js';
import { createApp } from '../app.js';
import { startDb, makeActor } from '../../test/db.js';
import { TEST_SECRET } from '../../test/helpers.js';
import config from '../../crypt.config.js';
import Notification from '../models/Notification.js';
import ActivityLog from '../models/ActivityLog.js';

const [superRole, midRole, lowRole] = config.roles;
const bearer = (a) => ({ Authorization: `Bearer ${jwt.sign({ userId: a.userId, role: a.role, name: a.name }, TEST_SECRET)}` });

const tickets = defineResource({
  key: 'tickets',
  label: 'Tickets',
  titleField: 'title',
  fields: {
    title: { type: 'string', label: 'Title', required: true },
    assignee: { type: 'ref', label: 'Assignee', ref: 'User' },
  },
  permissions: { read: [midRole], create: [midRole], update: [midRole], delete: [] },
});
const quiet = defineResource({
  key: 'quiet',
  label: 'Quiet',
  titleField: 'title',
  comments: false,
  fields: { title: { type: 'string', label: 'Title', required: true } },
  permissions: { read: [midRole], create: [midRole], update: [midRole], delete: [] },
});

let db;
let app;
let alice;
let bob;
let admin;
let viewer;
let ticketId;

beforeAll(async () => {
  db = await startDb([tickets, quiet]);
  await Notification.createCollection().catch(() => {});
  await Notification.syncIndexes();
  app = await createApp();
});
afterAll(() => db.stop());
beforeEach(async () => {
  await db.clear();
  alice = await makeActor(midRole, 'Alice');
  bob = await makeActor(midRole, 'Bob');
  admin = await makeActor(superRole, 'Root');
  viewer = await makeActor(lowRole, 'Vera');
  const res = await request(app).post('/api/r/tickets').set(bearer(alice)).send({ title: 'Leak', assignee: bob.userId });
  ticketId = res.body.item._id;
});

const url = (id = ticketId) => `/api/r/tickets/${id}/comments`;
const post = (who, body, id) => request(app).post(url(id)).set(bearer(who)).send({ body });

describe('comments', () => {
  test('post returns 201 with the contract shape and trims the body', async () => {
    const res = await post(alice, '  hello  ');
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      body: 'hello',
      author: { _id: alice.userId, name: 'Alice', role: midRole },
      canDelete: true,
    });
    expect(typeof res.body._id).toBe('string');
    expect(new Date(res.body.createdAt).getTime()).not.toBeNaN();
  });

  test('list is oldest first and canDelete depends on the viewer', async () => {
    await post(alice, 'first');
    await post(bob, 'second');
    await post(alice, 'third');
    const res = await request(app).get(url()).set(bearer(alice));
    expect(res.status).toBe(200);
    expect(res.body.items.map((c) => c.body)).toEqual(['first', 'second', 'third']);
    expect(Object.keys(res.body.items[0]).sort()).toEqual(['_id', 'author', 'body', 'canDelete', 'createdAt']);
    expect(res.body.items.map((c) => c.canDelete)).toEqual([true, false, true]);
    expect(res.body.items[1].author).toEqual({ _id: bob.userId, name: 'Bob', role: midRole });
    const asAdmin = await request(app).get(url()).set(bearer(admin));
    expect(asAdmin.body.items.every((c) => c.canDelete)).toBe(true);
  });

  test('rejects empty, blank, non-string and over-long bodies with 400', async () => {
    expect((await post(alice, '')).status).toBe(400);
    expect((await post(alice, '   ')).status).toBe(400);
    expect((await request(app).post(url()).set(bearer(alice)).send({})).status).toBe(400);
    expect((await post(alice, 123)).status).toBe(400);
    expect((await post(alice, 'x'.repeat(2001))).status).toBe(400);
    expect((await post(alice, 'x'.repeat(2000))).status).toBe(201);
  });

  test('404 for a missing or malformed record id', async () => {
    expect((await post(alice, 'hi', '64b64b64b64b64b64b64b64b')).status).toBe(404);
    expect((await request(app).get(url('64b64b64b64b64b64b64b64b')).set(bearer(alice))).status).toBe(404);
    expect((await request(app).get(url('nope')).set(bearer(alice))).status).toBe(404);
  });

  test('401 without a token, 403 for a role without read', async () => {
    expect((await request(app).get(url())).status).toBe(401);
    expect((await request(app).get(url()).set(bearer(viewer))).status).toBe(403);
    expect((await post(viewer, 'psst')).status).toBe(403);
  });

  test('405 on a resource defined with comments: false', async () => {
    const rec = await request(app).post('/api/r/quiet').set(bearer(alice)).send({ title: 'Q' });
    const id = rec.body.item._id;
    const u = `/api/r/quiet/${id}/comments`;
    const g = await request(app).get(u).set(bearer(alice));
    expect(g.status).toBe(405);
    expect(g.body.error).toMatch(/Quiet/);
    expect((await request(app).post(u).set(bearer(alice)).send({ body: 'x' })).status).toBe(405);
    expect((await request(app).delete(`${u}/64b64b64b64b64b64b64b64b`).set(bearer(alice))).status).toBe(405);
  });

  test('delete: author 204, other non-superuser 403, superuser 204, unknown 404', async () => {
    const c1 = (await post(alice, 'mine')).body._id;
    const del = (who, id) => request(app).delete(`${url()}/${id}`).set(bearer(who));
    expect((await del(bob, c1)).status).toBe(403);
    expect((await del(alice, c1)).status).toBe(204);
    expect((await del(alice, c1)).status).toBe(404);
    const c2 = (await post(alice, 'again')).body._id;
    expect((await del(admin, c2)).status).toBe(204);
    expect((await del(alice, 'bad-id')).status).toBe(404);
    expect((await request(app).get(url()).set(bearer(alice))).body.items).toEqual([]);
  });

  test('a comment cannot be deleted through another record', async () => {
    const other = (await request(app).post('/api/r/tickets').set(bearer(alice)).send({ title: 'Other' })).body.item._id;
    const c = (await post(alice, 'mine')).body._id;
    const res = await request(app).delete(`${url(other)}/${c}`).set(bearer(alice));
    expect(res.status).toBe(404);
  });

  test('writes an activity entry on the record', async () => {
    await post(alice, 'a note for the log');
    const entries = await ActivityLog.find({ resource: 'tickets', recordId: ticketId, action: 'comment' }).lean();
    expect(entries).toHaveLength(1);
    // The history says a comment was added, but never copies its text (deleting a comment removes its words).
    expect(entries[0].diff.comment).toEqual([null, 'added']);
    expect(JSON.stringify(entries[0])).not.toContain('a note for the log');
    const res = await request(app).get(`/api/r/tickets/${ticketId}/activity`).set(bearer(alice));
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).toContain('"action":"comment"');
    expect(JSON.stringify(res.body)).not.toContain('a note for the log');
  });

  test('notifies the creator and ref:User fields, never the author', async () => {
    const carol = await makeActor(midRole, 'Carol');
    // Carol comments: Alice (creator) and Bob (assignee) are notified, Carol is not.
    await post(carol, 'from carol');
    const users = async () => (await Notification.find({}).lean()).map((n) => String(n.user)).sort();
    expect(await users()).toEqual([alice.userId, bob.userId].sort());
    const n = await Notification.findOne({ user: alice.userId }).lean();
    expect(n.title).toMatch(/Carol commented on Ticket "Leak"/);
    expect(n.body).toBe('from carol');
    expect(n.link).toBe(`/r/tickets/${ticketId}`);
    // Bob comments: only Alice is new.
    await Notification.deleteMany({});
    await post(bob, 'from bob');
    expect(await users()).toEqual([alice.userId]);
    // Creator comments on own record: only the assignee.
    await Notification.deleteMany({});
    await post(alice, 'from alice');
    expect(await users()).toEqual([bob.userId]);
  });

  test('rate limit: 30 comments per user, then 429', async () => {
    const spammer = await makeActor(midRole, 'Spam');
    let last;
    for (let i = 0; i < 31; i += 1) last = await post(spammer, `c${i}`);
    expect(last.status).toBe(429);
  });
});

describe('meta', () => {
  test('exposes comments true by default and false when turned off', async () => {
    const res = await request(app).get('/api/meta').set(bearer(alice));
    const by = Object.fromEntries(res.body.resources.map((r) => [r.key, r.comments]));
    expect(by).toEqual({ tickets: true, quiet: false });
  });
});