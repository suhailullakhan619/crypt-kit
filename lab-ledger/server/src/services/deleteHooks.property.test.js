// Property 20: Delete Hooks Guard and Roll Back Deletes — Validates: Requirements 16.10
// Also covers the injectable clock (Requirement 16.11).
import fc from 'fast-check';
import mongoose from 'mongoose';
import * as svc from './resourceService.js';
import { sweep } from './sweeperService.js';
import ActivityLog from '../models/ActivityLog.js';
import { defineResource } from '../core/defineResource.js';
import { startDb, makeActor } from '../../test/db.js';
import { httpError } from '../utils/httpError.js';

const Tomb = mongoose.models.Tomb ?? mongoose.model('Tomb', new mongoose.Schema({ note: String }));
const calls = { before: 0, after: 0, nows: [] };

const hooks = {
  async beforeDelete(doc, ctx) {
    calls.before += 1;
    calls.nows.push(ctx.now);
    await Tomb.create([{ note: `before:${doc.name}` }], { session: ctx.session });
    if (doc.locked) throw httpError(409, 'This one stays buried');
  },
  async afterDelete(doc, ctx) {
    calls.after += 1;
    await Tomb.create([{ note: `after:${doc.name}` }], { session: ctx.session });
  },
};

const graves = defineResource({
  key: 'graves',
  label: 'Graves',
  fields: {
    name: { type: 'string', required: true },
    locked: { type: 'boolean', default: false },
    status: { type: 'enum', values: ['Open', 'Late', 'Filled'], default: 'Open' },
    dueAt: { type: 'date' },
  },
  permissions: { read: ['Member'], create: ['Member'], update: ['Member'], delete: ['Member'] },
  softDelete: { field: 'status', value: 'Filled', at: 'filledAt' },
  due: { field: 'dueAt', status: 'status', from: ['Open'], to: 'Late' },
  hooks,
});

const urns = defineResource({
  key: 'urns',
  label: 'Urns',
  fields: { name: { type: 'string', required: true }, locked: { type: 'boolean', default: false } },
  permissions: { read: ['Member'], create: ['Member'], update: ['Member'], delete: ['Member'] },
  hooks,
});

let db;
let actor;
beforeAll(async () => {
  db = await startDb([graves, urns]);
  await Tomb.createCollection().catch(() => {});
  actor = await makeActor('Member');
});
afterAll(() => db.stop());

const snapshot = async (model) => ({
  docs: await model.find().sort({ _id: 1 }).lean(),
  tombs: await Tomb.countDocuments(),
  log: await ActivityLog.countDocuments(),
});

describe('Property 20: delete hooks', () => {
  test('a throwing beforeDelete leaves record, side effects and log unchanged; otherwise each hook runs once', async () => {
    await fc.assert(
      fc.asyncProperty(fc.constantFrom(graves, urns), fc.boolean(), fc.stringMatching(/^[a-z]{3,8}$/), async (resource, locked, name) => {
        await db.clear();
        const [doc] = await resource.model.insertMany([{ name, locked }]);
        calls.before = 0;
        calls.after = 0;
        const before = await snapshot(resource.model);

        const result = await svc.remove(resource, String(doc._id), actor).then(() => 'ok', (e) => e);

        if (locked) {
          expect(result.status).toBe(409);
          expect(await snapshot(resource.model)).toEqual(before);
          expect(calls.after).toBe(0);
        } else {
          expect(result).toBe('ok');
          expect(calls.before).toBe(1);
          expect(calls.after).toBe(1);
          expect(await Tomb.countDocuments()).toBe(2);
          expect(await ActivityLog.countDocuments({ action: 'delete' })).toBe(1);
          const after = await resource.model.findById(doc._id).lean();
          if (resource === graves) expect(after.status).toBe('Filled');
          else expect(after).toBeNull();
        }
      }),
      { numRuns: 30 }
    );
  });
});

describe('Requirement 16.11: injectable clock', () => {
  afterEach(() => { db.ctx.clock = undefined; });

  test('hooks, soft-delete timestamps and the sweeper read the injected clock', async () => {
    await db.clear();
    const fixed = new Date('2031-10-31T23:59:00Z');
    db.ctx.clock = () => fixed;
    calls.nows = [];

    const [g] = await graves.model.insertMany([{ name: 'midnight' }]);
    const { item } = await svc.remove(graves, String(g._id), actor);
    expect(calls.nows[0].toISOString()).toBe(fixed.toISOString());
    expect(new Date(item.filledAt).toISOString()).toBe(fixed.toISOString());

    // Due one minute before the injected time → the sweeper (default now) flags it.
    await graves.model.insertMany([{ name: 'late', dueAt: new Date(fixed.getTime() - 60000) }]);
    expect((await sweep({ withDue: () => [graves] })).graves).toBe(1);
  });
});
