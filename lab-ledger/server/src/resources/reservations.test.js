// Reservations: no overlaps (even concurrent), no forging, cancel-only edits, auto-complete
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../app.js';
import { sweep } from '../services/sweeperService.js';
import { startDb, makeActor } from '../../test/db.js';
import { TEST_SECRET } from '../../test/helpers.js';
import { LAB_RESOURCES, makeEquipment, equipment } from '../../test/lab.js';
import reservations from './reservations.js';
import Notification from '../models/Notification.js';

const HOUR = 3600000;
const DAY = 24 * HOUR;
let db;
let app;
let ada;
let ben;
let tess;
const bearer = (a) => ({ Authorization: `Bearer ${jwt.sign({ userId: a.userId, role: a.role, name: a.name }, TEST_SECRET)}` });
const at = (hours) => new Date(Date.now() + hours * HOUR).toISOString();
const book = (who, body) => request(app).post('/api/r/reservations').set(bearer(who)).send(body);

beforeAll(async () => {
  db = await startDb(LAB_RESOURCES.concat([reservations]));
  app = await createApp();
  ada = await makeActor('Student', 'Ada');
  ben = await makeActor('Student', 'Ben');
  tess = await makeActor('Technician', 'Tess');
});
afterAll(() => db.stop());
beforeEach(async () => {
  await reservations.model.deleteMany({});
  await equipment.model.deleteMany({});
});

describe('booking', () => {
  test('creates a Booked reservation owned by the caller, ignoring forged user and status', async () => {
    const item = await makeEquipment();
    const res = await book(ada, { equipment: String(item._id), startAt: at(24), endAt: at(26), user: ben.userId, status: 'Cancelled', purpose: 'Lab 3' });
    expect(res.status).toBe(201);
    expect(res.body.item.status).toBe('Booked');
    expect(String(res.body.item.user._id ?? res.body.item.user)).toBe(ada.userId);
  });

  test('the workflow-only Completed status cannot be set at creation', async () => {
    const item = await makeEquipment();
    expect((await book(ada, { equipment: String(item._id), startAt: at(24), endAt: at(26), status: 'Completed' })).status).toBe(409);
  });

  test('refuses overlapping windows but allows back-to-back and other items', async () => {
    const [a, b] = [await makeEquipment(), await makeEquipment()];
    const first = await book(ada, { equipment: String(a._id), startAt: at(24), endAt: at(28) });
    expect(first.status).toBe(201);
    const clash = await book(ben, { equipment: String(a._id), startAt: at(27), endAt: at(30) });
    expect(clash.status).toBe(409);
    expect(clash.body.error).toMatch(/already reserved/);
    expect((await book(ben, { equipment: String(a._id), startAt: at(28), endAt: at(30) })).status).toBe(201);
    expect((await book(ben, { equipment: String(b._id), startAt: at(24), endAt: at(28) })).status).toBe(201);
  });

  test('two simultaneous bookings of the same window: exactly one wins', async () => {
    const item = await makeEquipment();
    const body = { equipment: String(item._id), startAt: at(48), endAt: at(50) };
    const results = await Promise.all([book(ada, body), book(ben, body), book(tess, body)]);
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(await reservations.model.countDocuments({ equipment: item._id, status: 'Booked' })).toBe(1);
  });

  test.each([
    ['in the past', () => ({ startAt: at(-3), endAt: at(-1) }), 400],
    ['ending before it starts', () => ({ startAt: at(5), endAt: at(4) }), 400],
    ['longer than 14 days', () => ({ startAt: at(5), endAt: at(5 + 15 * 24) }), 400],
    ['more than 90 days ahead', () => ({ startAt: at(91 * 24), endAt: at(91 * 24 + 2) }), 400],
    ['not a date', () => ({ startAt: 'soon', endAt: at(9) }), 400],
  ])('rejects a window %s', async (_name, window, status) => {
    const item = await makeEquipment();
    expect((await book(ada, { equipment: String(item._id), ...window() })).status).toBe(status);
  });

  test('cannot reserve retired, maintenance or calibration-due equipment, or a missing item', async () => {
    for (const s of ['Maintenance', 'CalibrationDue', 'Retired']) {
      const item = await makeEquipment({ status: s });
      expect((await book(ada, { equipment: String(item._id), startAt: at(24), endAt: at(26) })).status).toBe(409);
    }
    expect((await book(ada, { equipment: '0123456789abcdef01234567', startAt: at(24), endAt: at(26) })).status).toBe(404);
  });

  test('an item that is currently checked out can still be reserved for later', async () => {
    const item = await makeEquipment({ status: 'CheckedOut' });
    expect((await book(ada, { equipment: String(item._id), startAt: at(72), endAt: at(74) })).status).toBe(201);
  });
});

describe('cancelling and editing', () => {
  const make = async (who) => {
    const item = await makeEquipment();
    const res = await book(who, { equipment: String(item._id), startAt: at(24), endAt: at(26) });
    return res.body.item._id;
  };
  const patch = (who, id, body) => request(app).patch(`/api/r/reservations/${id}`).set(bearer(who)).send(body);

  test('the owner and staff can cancel; another student cannot', async () => {
    const id = await make(ada);
    expect((await patch(ben, id, { status: 'Cancelled' })).status).toBe(403);
    expect((await patch(ada, id, { status: 'Cancelled' })).body.item.status).toBe('Cancelled');
    const id2 = await make(ada);
    expect((await patch(tess, id2, { status: 'Cancelled' })).status).toBe(200);
  });

  test('nothing but cancelling is allowed, and a cancelled slot can be booked again', async () => {
    const item = await makeEquipment();
    const created = await book(ada, { equipment: String(item._id), startAt: at(24), endAt: at(26) });
    const id = created.body.item._id;
    expect((await patch(ada, id, { endAt: at(40) })).status).toBe(409);
    expect((await patch(ada, id, { user: ben.userId, status: 'Cancelled' })).status).toBe(409);
    expect((await patch(ada, id, { status: 'Completed' })).status).toBe(409);
    await patch(ada, id, { status: 'Cancelled' });
    expect((await book(ben, { equipment: String(item._id), startAt: at(24), endAt: at(26) })).status).toBe(201);
  });
});

test('finished bookings are routine: no notification and no "overdue" on the dashboard', async () => {
  const item = await makeEquipment();
  await reservations.model.create({ equipment: item._id, user: ada.userId, startAt: new Date(Date.now() - 2 * DAY), endAt: new Date(Date.now() - 2 * DAY + HOUR), status: 'Booked' });
  await sweep(db.registry, new Date());
  expect(await Notification.countDocuments({ user: ada.userId })).toBe(0);
  const dash = await request(app).get('/api/dashboard').set(bearer(ada));
  const card = dash.body.resources.find((r) => r.key === 'reservations');
  expect(card).toMatchObject({ overdue: 0, dueSoon: 0, hasDue: false });
});

test('the booking form leaves out fields the server sets itself', async () => {
  const meta = await request(app).get('/api/meta').set(bearer(ada));
  const fields = meta.body.resources.find((r) => r.key === 'reservations').fields;
  expect(fields.filter((f) => f.formHidden).map((f) => f.name).sort()).toEqual(['status', 'user']);
  expect(fields.find((f) => f.name === 'startAt').time).toBe(true);
});

test('the sweeper completes finished reservations', async () => {
  const item = await makeEquipment();
  await reservations.model.create({ equipment: item._id, user: ada.userId, startAt: new Date(Date.now() - 2 * DAY), endAt: new Date(Date.now() - 2 * DAY + HOUR), status: 'Booked' });
  await sweep(db.registry, new Date());
  expect((await reservations.model.findOne({ equipment: item._id })).status).toBe('Completed');
});
