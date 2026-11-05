// Property L1: At Most One Active Checkout per Equipment
// Validates: Requirements 3.3, 3.4, 3.5
// Property L3: Return Restores the Correct Equipment State
// Validates: Requirements 3.5
import fc from 'fast-check';
import * as svc from './checkoutService.js';
import * as resourceService from './resourceService.js';
import { sweep } from './sweeperService.js';
import ActivityLog from '../models/ActivityLog.js';
import { startLabDb, makeActor, makeEquipment, equipment, checkouts, NOW } from '../../test/lab.js';
import { CONDITIONS } from '../resources/equipment.js';
import { OUT_STATUSES } from '../resources/checkouts.js';

const DAY = 86400000;
const DUE = new Date(NOW.getTime() + 7 * DAY);
const LATER = new Date(NOW.getTime() + 60 * DAY); // sweeper clock: every Active loan is late by then

let db;
let users; // [studentA, studentB, tech]
beforeAll(async () => {
  db = await startLabDb();
  users = [await makeActor('Student', 'Ada'), await makeActor('Student', 'Ben'), await makeActor('Technician', 'Tess')];
});
afterAll(() => db.stop());

/** Runs `p`, returning the HTTP-ish status (200 on success). */
const outcome = (p) => p.then(() => 200, (err) => err.status ?? 500);

// ── Invariant (the property itself) ───────────────────────────────────────────
async function assertSingleActive(eqIds) {
  for (const id of eqIds) {
    const [item, out] = await Promise.all([
      equipment.model.findById(id).lean(),
      checkouts.model.countDocuments({ equipment: id, status: { $in: OUT_STATUSES } }),
    ]);
    expect(out).toBeLessThanOrEqual(1);
    expect(item.status === 'CheckedOut').toBe(out === 1);
  }
}

async function assertMatchesModel(m, r) {
  for (let i = 0; i < r.eq.length; i += 1) {
    expect((await equipment.model.findById(r.eq[i]).lean()).status).toBe(m.eq[i]);
  }
  for (let i = 0; i < r.cos.length; i += 1) {
    expect((await checkouts.model.findById(r.cos[i]).lean()).status).toBe(m.cos[i].status);
  }
}

// ── Commands (model = { eq: status[], cos: { eq, borrower, status }[] }) ─────
const pick = (m, i) => (m.cos.length ? i % m.cos.length : -1);

class Request {
  constructor(eq, who) { Object.assign(this, { eq, who }); }
  check() { return true; }
  async run(m, r) {
    const pending = m.cos.some((c) => c.eq === this.eq && c.borrower === this.who && c.status === 'Requested');
    const expected = m.eq[this.eq] !== 'Available' || pending ? 409 : 200;
    let created = null;
    const got = await outcome(svc.request({ equipmentId: String(r.eq[this.eq]), dueBack: DUE }, users[this.who], NOW).then((co) => { created = co; }));
    expect(got).toBe(expected);
    if (created) { m.cos.push({ eq: this.eq, borrower: this.who, status: 'Requested' }); r.cos.push(created._id); }
  }
  toString() { return `request(eq${this.eq}, u${this.who})`; }
}

class Approve {
  constructor(i) { this.i = i; }
  check(m) { return m.cos.length > 0; }
  async run(m, r) {
    const k = pick(m, this.i);
    const co = m.cos[k];
    const expected = co.status === 'Requested' && m.eq[co.eq] === 'Available' ? 200 : 409;
    expect(await outcome(svc.approve(String(r.cos[k]), users[2], NOW))).toBe(expected);
    if (expected === 200) { co.status = 'Active'; m.eq[co.eq] = 'CheckedOut'; }
  }
  toString() { return `approve(#${this.i})`; }
}

/** Two approvals racing — for the same or different requests, same or different items. */
class ConcurrentApprove {
  constructor(i, j) { Object.assign(this, { i, j }); }
  check(m) { return m.cos.length > 0; }
  async run(m, r) {
    const ks = [pick(m, this.i), pick(m, this.j)];
    const got = await Promise.all(ks.map((k) => outcome(svc.approve(String(r.cos[k]), users[2], NOW))));
    // Group candidates per item: at most one approval per item may win, and it must have been valid.
    const winners = ks.filter((k, n) => got[n] === 200);
    for (const n of [0, 1]) expect([200, 409]).toContain(got[n]);
    const byEq = new Map();
    ks.forEach((k) => {
      const co = m.cos[k];
      if (co.status === 'Requested' && m.eq[co.eq] === 'Available') byEq.set(co.eq, true);
    });
    expect(new Set(winners).size).toBe(winners.length); // the same request never wins twice
    expect(winners.length).toBe(byEq.size);
    for (const k of winners) {
      const co = m.cos[k];
      expect(co.status).toBe('Requested');
      co.status = 'Active';
      m.eq[co.eq] = 'CheckedOut';
    }
  }
  toString() { return `approve‖approve(#${this.i}, #${this.j})`; }
}

class Return {
  constructor(i, condition) { Object.assign(this, { i, condition }); }
  check(m) { return m.cos.length > 0; }
  async run(m, r) {
    const k = pick(m, this.i);
    const co = m.cos[k];
    const expected = OUT_STATUSES.includes(co.status) ? 200 : 409;
    expect(await outcome(svc.returnItem(String(r.cos[k]), { condition: this.condition }, users[2], NOW))).toBe(expected);
    if (expected === 200) { co.status = 'Returned'; m.eq[co.eq] = this.condition === 'Damaged' ? 'Maintenance' : 'Available'; }
  }
  toString() { return `return(#${this.i}, ${this.condition})`; }
}

class Reject {
  constructor(i) { this.i = i; }
  check(m) { return m.cos.length > 0; }
  async run(m, r) {
    const k = pick(m, this.i);
    const expected = m.cos[k].status === 'Requested' ? 200 : 409;
    expect(await outcome(svc.reject(String(r.cos[k]), 'Booked for an exam', users[2]))).toBe(expected);
    if (expected === 200) m.cos[k].status = 'Rejected';
  }
  toString() { return `reject(#${this.i})`; }
}

class Cancel {
  constructor(i, byOwner) { Object.assign(this, { i, byOwner }); }
  check(m) { return m.cos.length > 0; }
  async run(m, r) {
    const k = pick(m, this.i);
    const co = m.cos[k];
    const actor = this.byOwner ? users[co.borrower] : users[1 - co.borrower];
    const expected = !this.byOwner ? 403 : co.status === 'Requested' ? 200 : 409;
    expect(await outcome(svc.cancel(String(r.cos[k]), actor))).toBe(expected);
    if (expected === 200) co.status = 'Cancelled';
  }
  toString() { return `cancel(#${this.i}, ${this.byOwner ? 'owner' : 'stranger'})`; }
}

class Sweep {
  check() { return true; }
  async run(m) {
    await sweep(db.registry, LATER);
    for (const co of m.cos) if (co.status === 'Active') co.status = 'Overdue';
  }
  toString() { return 'sweep(+60d)'; }
}

class Repair {
  constructor(eq) { this.eq = eq; }
  check() { return true; }
  async run(m, r) {
    const expected = m.eq[this.eq] === 'Maintenance' ? 200 : m.eq[this.eq] === 'Available' ? 200 : 409;
    expect(await outcome(resourceService.update(equipment, String(r.eq[this.eq]), { status: 'Available' }, users[2]))).toBe(expected);
    if (expected === 200) m.eq[this.eq] = 'Available';
  }
  toString() { return `repair(eq${this.eq})`; }
}

/** Wraps every command so the invariant and the model are checked after each step. */
const checked = (cmd) => ({
  check: (m) => cmd.check(m),
  async run(m, r) {
    await cmd.run(m, r);
    await assertSingleActive(r.eq);
    await assertMatchesModel(m, r);
  },
  toString: () => cmd.toString(),
});

const N_EQ = 2;
const eqIdx = fc.integer({ min: 0, max: N_EQ - 1 });
const coIdx = fc.nat(20);
const commands = [
  fc.tuple(eqIdx, fc.integer({ min: 0, max: 1 })).map(([e, u]) => checked(new Request(e, u))),
  fc.tuple(eqIdx, fc.integer({ min: 0, max: 1 })).map(([e, u]) => checked(new Request(e, u))),
  coIdx.map((i) => checked(new Approve(i))),
  fc.tuple(coIdx, coIdx).map(([i, j]) => checked(new ConcurrentApprove(i, j))),
  fc.tuple(coIdx, fc.constantFrom(...CONDITIONS)).map(([i, c]) => checked(new Return(i, c))),
  coIdx.map((i) => checked(new Reject(i))),
  fc.tuple(coIdx, fc.boolean()).map(([i, o]) => checked(new Cancel(i, o))),
  fc.constant(null).map(() => checked(new Sweep())),
  eqIdx.map((e) => checked(new Repair(e))),
];

test('L1: any interleaving of request/approve/return/reject/cancel/sweep keeps ≤ 1 active checkout per item', async () => {
  await fc.assert(
    fc.asyncProperty(fc.commands(commands, { maxCommands: 25 }), async (cmds) => {
      await checkouts.model.deleteMany({});
      await equipment.model.deleteMany({});
      await ActivityLog.deleteMany({});
      const eq = [];
      for (let i = 0; i < N_EQ; i += 1) eq.push((await makeEquipment())._id);
      await fc.asyncModelRun(() => ({ model: { eq: eq.map(() => 'Available'), cos: [] }, real: { eq, cos: [] } }), cmds);
    }),
    { numRuns: 30 }
  );
});

test('L1: N concurrent approvals of different requests for one item → exactly one wins', async () => {
  const students = [users[0], users[1], await makeActor('Student', 'Cy'), await makeActor('Student', 'Dee'), await makeActor('Student', 'Eve'), await makeActor('Student', 'Fay')];
  await fc.assert(
    fc.asyncProperty(fc.integer({ min: 2, max: students.length }), async (n) => {
      const item = await makeEquipment();
      const reqs = [];
      for (let i = 0; i < n; i += 1) reqs.push(await svc.request({ equipmentId: String(item._id), dueBack: DUE }, students[i], NOW));
      const got = await Promise.all(reqs.map((co) => outcome(svc.approve(String(co._id), users[2], NOW))));
      expect(got.filter((s) => s === 200)).toHaveLength(1);
      expect(got.filter((s) => s === 409)).toHaveLength(n - 1);
      await assertSingleActive([item._id]);
      expect(await checkouts.model.countDocuments({ equipment: item._id, status: 'Requested' })).toBe(n - 1);
    }),
    { numRuns: 25 }
  );
});

test('L1: a second approval of the same request is a 409 and changes nothing', async () => {
  const item = await makeEquipment();
  const co = await svc.request({ equipmentId: String(item._id), dueBack: DUE }, users[0], NOW);
  await svc.approve(String(co._id), users[2], NOW);
  const before = JSON.stringify(await checkouts.model.findById(co._id).lean());
  await expect(svc.approve(String(co._id), users[2], NOW)).rejects.toMatchObject({ status: 409 });
  expect(JSON.stringify(await checkouts.model.findById(co._id).lean())).toBe(before);
});

test('L1: the partial unique index is a second guard against two out loans', async () => {
  const item = await makeEquipment({ status: 'CheckedOut' });
  await checkouts.model.create([{ equipment: item._id, borrower: users[0].userId, status: 'Active', dueBack: DUE }]);
  await expect(checkouts.model.create([{ equipment: item._id, borrower: users[1].userId, status: 'Overdue', dueBack: DUE }]))
    .rejects.toMatchObject({ code: 11000 });
});

test('L3: return sets condition, and status Maintenance iff Damaged (else Available)', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.constantFrom(...CONDITIONS), fc.constantFrom(...CONDITIONS), fc.boolean(), fc.option(fc.string({ maxLength: 40 }), { nil: undefined }),
      async (condition, startCondition, overdue, notes) => {
        const item = await makeEquipment({ condition: startCondition });
        const co = await svc.request({ equipmentId: String(item._id), dueBack: DUE }, users[0], NOW);
        await svc.approve(String(co._id), users[2], NOW);
        if (overdue) await checkouts.model.updateOne({ _id: co._id }, { status: 'Overdue' });

        const done = await svc.returnItem(String(co._id), { condition, notes }, users[2], NOW);
        const after = await equipment.model.findById(item._id).lean();
        expect(after.status).toBe(condition === 'Damaged' ? 'Maintenance' : 'Available');
        expect(after.condition).toBe(condition);
        expect(done.status).toBe('Returned');
        expect(done.returnCondition).toBe(condition);
        expect(done.receivedBy.name).toBe('Tess');
        await assertSingleActive([item._id]);
      }
    ),
    { numRuns: 30 }
  );
});

test('Req 3.9: every transition logs activity on both the checkout and the equipment', async () => {
  const item = await makeEquipment();
  const co = await svc.request({ equipmentId: String(item._id), dueBack: DUE }, users[0], NOW);
  await svc.approve(String(co._id), users[2], NOW);
  await svc.returnItem(String(co._id), { condition: 'Good' }, users[2], NOW);
  const onCo = await ActivityLog.find({ resource: 'checkouts', recordId: co._id }).lean();
  const onEq = await ActivityLog.find({ resource: 'equipment', recordId: item._id }).sort({ at: 1, _id: 1 }).lean();
  expect(onCo.map((e) => e.action).sort()).toEqual(['create', 'status', 'status', 'update', 'update']);
  expect(onEq.filter((e) => e.action === 'status').map((e) => e.diff.status)).toEqual([['Available', 'CheckedOut'], ['CheckedOut', 'Available']]);
  expect(onEq.some((e) => e.action === 'update' && e.diff.checkout)).toBe(true);

  const co2 = await svc.request({ equipmentId: String(item._id), dueBack: DUE }, users[0], NOW);
  await svc.reject(String(co2._id), 'Reserved', users[2]);
  const co3 = await svc.request({ equipmentId: String(item._id), dueBack: DUE }, users[0], NOW);
  await svc.cancel(String(co3._id), users[0]);
  expect(await ActivityLog.countDocuments({ resource: 'equipment', recordId: item._id, 'diff.checkout': { $eq: ['Requested', 'Rejected'] } })).toBe(1);
  expect(await ActivityLog.countDocuments({ resource: 'equipment', recordId: item._id, 'diff.checkout': { $eq: ['Requested', 'Cancelled'] } })).toBe(1);
});

test('request rules: non-Available → 409 naming the status; unknown → 404; reject needs a reason', async () => {
  const item = await makeEquipment({ status: 'Maintenance' });
  await expect(svc.request({ equipmentId: String(item._id), dueBack: DUE }, users[0], NOW)).rejects.toMatchObject({ status: 409, message: expect.stringContaining('Maintenance') });
  await expect(svc.request({ equipmentId: 'a'.repeat(24), dueBack: DUE }, users[0], NOW)).rejects.toMatchObject({ status: 404 });
  await expect(svc.request({ equipmentId: String(item._id), dueBack: NOW }, users[0], NOW)).rejects.toMatchObject({ status: 400 });
  const ok = await makeEquipment();
  const co = await svc.request({ equipmentId: String(ok._id), dueBack: DUE, purpose: '  Optics lab  ' }, users[0], NOW);
  expect(co).toMatchObject({ status: 'Requested', purpose: 'Optics lab', borrower: { name: 'Ada' } });
  await expect(svc.request({ equipmentId: String(ok._id), dueBack: DUE }, users[0], NOW)).rejects.toMatchObject({ status: 409 });
  await expect(svc.reject(String(co._id), '   ', users[2])).rejects.toMatchObject({ status: 400 });
  const mine = await svc.mine(users[0], { status: 'Requested' });
  expect(mine.items.some((c) => String(c._id) === String(co._id))).toBe(true);
});
