import request from 'supertest';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { defineResource } from '../core/defineResource.js';
import { createApp } from '../app.js';
import { sweep } from './sweeperService.js';
import { notify, notifyDueChange, listFor } from './notificationService.js';
import Notification from '../models/Notification.js';
import User from '../models/User.js';
import { startDb, makeActor } from '../../test/db.js';
import { TEST_SECRET } from '../../test/helpers.js';
import config from '../../crypt.config.js';

const [superRole, midRole] = config.roles;

const tasks = defineResource({
  key: 'chores',
  label: 'Chores',
  titleField: 'title',
  fields: {
    title: { type: 'string', required: true },
    status: { type: 'enum', values: ['Open', 'Late'], default: 'Open' },
    owner: { type: 'ref', ref: 'User' },
    dueAt: { type: 'date' },
  },
  permissions: { read: config.roles, create: [midRole], update: [midRole], delete: [] },
  due: { field: 'dueAt', status: 'status', from: ['Open'], to: 'Late' },
});

let db;
let app;
const bearer = (a) => ({ Authorization: `Bearer ${jwt.sign({ userId: a.userId, role: a.role, name: a.name }, TEST_SECRET)}` });

beforeAll(async () => {
  db = await startDb([tasks]);
  await Notification.createCollection().catch(() => {});
  await Notification.syncIndexes();
  app = await createApp();
});
afterAll(() => db.stop());
beforeEach(() => db.clear());

describe('notify', () => {
  test('creates one per recipient, resolving roles to active users only', async () => {
    const a = await makeActor(midRole, 'A');
    await makeActor(midRole, 'B');
    const off = await makeActor(midRole, 'Off');
    await User.updateOne({ _id: off.userId }, { active: false });
    const n = await notify({ roles: [midRole], userIds: [a.userId], title: 'Hello' });
    expect(n).toBe(2);
    expect(await Notification.countDocuments({ user: off.userId })).toBe(0);
  });

  test('the same dedupeKey never notifies the same user twice', async () => {
    const a = await makeActor(midRole, 'Dup');
    expect(await notify({ userIds: [a.userId], title: 'T', dedupeKey: 'k1' })).toBe(1);
    expect(await notify({ userIds: [a.userId], title: 'T', dedupeKey: 'k1' })).toBe(0);
    expect(await notify({ userIds: [a.userId], title: 'T', dedupeKey: 'k2' })).toBe(1);
    expect(await Notification.countDocuments({ user: a.userId })).toBe(2);
  });
});

describe('sweeper notifications', () => {
  test('a record turning Late notifies its owner and the superuser, once', async () => {
    const owner = await makeActor(midRole, 'Owner');
    const boss = await makeActor(superRole, 'Boss');
    const other = await makeActor(midRole, 'Bystander');
    const [chore] = await tasks.model.insertMany([{ title: 'Burn candles', owner: owner.userId, dueAt: new Date('2020-01-01') }]);

    await sweep(db.registry, new Date('2030-01-01'));
    await sweep(db.registry, new Date('2030-01-02'));

    const mine = await listFor(owner.userId);
    expect(mine.unread).toBe(1);
    expect(mine.items[0]).toMatchObject({ kind: 'danger', link: `/r/chores/${chore._id}` });
    expect(mine.items[0].title).toMatch(/Burn candles.*Late/);
    expect((await listFor(boss.userId)).unread).toBe(1);
    expect((await listFor(other.userId)).unread).toBe(0);

    await notifyDueChange(db.registry.get('chores'), [chore.toObject()], 'Late', { roles: [superRole] });
    expect((await listFor(owner.userId)).unread).toBe(1);
  });

  test('a failure while notifying never breaks the sweep', async () => {
    await tasks.model.insertMany([{ title: 'x', owner: new mongoose.Types.ObjectId(), dueAt: new Date('2020-01-01') }]);
    await expect(sweep(db.registry, new Date('2030-01-01'))).resolves.toEqual({ chores: 1 });
  });
});

describe('/api/notifications', () => {
  test('lists only my notifications, marks one read, then all', async () => {
    const me = await makeActor(midRole, 'Me');
    const you = await makeActor(midRole, 'You');
    await notify({ userIds: [me.userId], title: 'one' });
    await notify({ userIds: [me.userId], title: 'two' });
    await notify({ userIds: [you.userId], title: 'secret' });

    const list = await request(app).get('/api/notifications').set(bearer(me));
    expect(list.status).toBe(200);
    expect(list.body.unread).toBe(2);
    expect(list.body.items.map((i) => i.title)).toEqual(['two', 'one']);

    const first = list.body.items[0]._id;
    expect((await request(app).post(`/api/notifications/${first}/read`).set(bearer(me))).body.item.readAt).toBeTruthy();
    expect((await request(app).get('/api/notifications').set(bearer(me))).body.unread).toBe(1);

    expect((await request(app).post('/api/notifications/read-all').set(bearer(me))).body.updated).toBe(1);
    expect((await request(app).get('/api/notifications?unread=true').set(bearer(me))).body.items).toHaveLength(0);
  });

  test('POST /test-email needs a sign-in and says so when email is not set up', async () => {
    const me = await makeActor(midRole, 'Mailer');
    expect((await request(app).post('/api/notifications/test-email')).status).toBe(401);
    const res = await request(app).post('/api/notifications/test-email').set(bearer(me));
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/not set up/);
  });

  test("nobody can read someone else's notification, and it needs a sign-in", async () => {
    const me = await makeActor(midRole, 'Mine');
    const you = await makeActor(midRole, 'Yours');
    await notify({ userIds: [you.userId], title: 'private' });
    const theirs = (await Notification.findOne({ user: you.userId }))._id;
    expect((await request(app).post(`/api/notifications/${theirs}/read`).set(bearer(me))).status).toBe(404);
    expect((await Notification.findById(theirs)).readAt).toBeNull();
    expect((await request(app).post('/api/notifications/not-an-id/read').set(bearer(me))).status).toBe(404);
    expect((await request(app).get('/api/notifications')).status).toBe(401);
  });
});
