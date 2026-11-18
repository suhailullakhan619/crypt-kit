// Lab insights: utilization and late borrowers
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../app.js';
import { utilization, lateBorrowers, parseDays } from './insightsService.js';
import { startLabDb, makeActor, makeEquipment, checkouts, equipment } from '../../test/lab.js';
import { TEST_SECRET } from '../../test/helpers.js';

const DAY = 86400000;
const NOW = new Date('2026-11-05T12:00:00Z');
const ago = (d) => new Date(NOW.getTime() - d * DAY);
let db;
let app;
let ada;
let ben;
let tess;
let student;
const bearer = (a) => ({ Authorization: `Bearer ${jwt.sign({ userId: a.userId, role: a.role, name: a.name }, TEST_SECRET)}` });

beforeAll(async () => {
  db = await startLabDb();
  app = await createApp();
  ada = await makeActor('Student', 'Ada');
  ben = await makeActor('Student', 'Ben');
  tess = await makeActor('Technician', 'Tess');
  student = ada;
});
afterAll(() => db.stop());
beforeEach(async () => {
  await checkouts.model.deleteMany({});
  await equipment.model.deleteMany({});
});

const loan = (eq, who, o) => checkouts.model.create({ equipment: eq._id, borrower: who.userId, dueBack: ago(1), ...o });

describe('utilization', () => {
  test('counts loans and days out per item, includes never-borrowed items, ignores retired and old loans', async () => {
    const [scope, fridge, spare, retired] = [
      await makeEquipment({ name: 'Scope' }), await makeEquipment({ name: 'Fridge' }), await makeEquipment({ name: 'Spare' }),
      await makeEquipment({ name: 'Old', status: 'Retired' }),
    ];
    await loan(scope, ada, { status: 'Returned', checkedOutAt: ago(10), returnedAt: ago(8) }); // 2 days
    await loan(scope, ben, { status: 'Returned', checkedOutAt: ago(5), returnedAt: ago(4) }); // 1 day
    await loan(fridge, ada, { status: 'Active', checkedOutAt: ago(3) }); // still out: 3 days
    await loan(spare, ada, { status: 'Returned', checkedOutAt: ago(200), returnedAt: ago(199) }); // outside window
    await loan(scope, ada, { status: 'Rejected', checkedOutAt: ago(2) }); // never really out
    await loan(retired, ada, { status: 'Returned', checkedOutAt: ago(2), returnedAt: ago(1) });

    const u = await utilization(90, NOW);
    expect(u.items.map((i) => i.name)).toEqual(['Scope', 'Fridge', 'Spare']);
    expect(u.items[0]).toMatchObject({ loans: 2, daysOut: 3 });
    expect(u.items[1]).toMatchObject({ loans: 1, daysOut: 3 });
    expect(u.items[2]).toMatchObject({ loans: 0, daysOut: 0 });
    expect(u.totalLoans).toBe(3);
    expect(u.neverBorrowed).toBe(1);
    expect(u.mostUsed.map((i) => i.name)).toEqual(['Scope', 'Fridge']);
    expect(u.leastUsed[0].name).toBe('Spare');
  });
});

describe('lateBorrowers', () => {
  test('lists only borrowers with a late loan, counting overdue and late returns, worst first', async () => {
    const [a, b, c] = [await makeEquipment(), await makeEquipment(), await makeEquipment()];
    await loan(a, ada, { status: 'Returned', checkedOutAt: ago(20), dueBack: ago(10), returnedAt: ago(8) }); // late
    await loan(b, ada, { status: 'Overdue', checkedOutAt: ago(9), dueBack: ago(2) }); // late, still out
    await loan(c, ada, { status: 'Returned', checkedOutAt: ago(30), dueBack: ago(25), returnedAt: ago(26) }); // on time
    await loan(a, ben, { status: 'Returned', checkedOutAt: ago(15), dueBack: ago(12), returnedAt: ago(13) }); // on time
    const l = await lateBorrowers(180, NOW);
    expect(l.borrowers).toHaveLength(1);
    expect(l.borrowers[0]).toMatchObject({ name: 'Ada', loans: 3, late: 2, stillOut: 1, lateRate: 67 });
  });
});

describe('routes', () => {
  test('staff get both reports, students are refused, bad windows are 400', async () => {
    const res = await request(app).get('/api/insights?usageDays=30').set(bearer(tess));
    expect(res.status).toBe(200);
    expect(res.body.utilization.days).toBe(30);
    expect(res.body.late.days).toBe(180);
    expect((await request(app).get('/api/insights').set(bearer(student))).status).toBe(403);
    expect((await request(app).get('/api/insights')).status).toBe(401);
    expect((await request(app).get('/api/insights?usageDays=0').set(bearer(tess))).status).toBe(400);
    expect((await request(app).get('/api/insights?lateDays=abc').set(bearer(tess))).status).toBe(400);
    expect(() => parseDays('9999')).toThrow(/days must be/);
  });

  test('POST /insights/report stores a PDF report for staff only', async () => {
    const res = await request(app).post('/api/insights/report').set(bearer(tess)).send({});
    expect(res.status).toBe(201);
    expect(res.body.report.title).toBe('Lab insights');
    expect((await request(app).post('/api/insights/report').set(bearer(student)).send({})).status).toBe(403);
  });
});
