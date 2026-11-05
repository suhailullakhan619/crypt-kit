// Property 18: Hook Failures Roll Back the Whole Mutation              — Validates: Requirements 16.1
// Property 19: Workflow-Only States Are Unreachable Through Generic PATCH — Validates: Requirements 16.3
import fc from 'fast-check';
import mongoose from 'mongoose';
import * as svc from './resourceService.js';
import ActivityLog from '../models/ActivityLog.js';
import { defineResource } from '../core/defineResource.js';
import { startDb, makeActor } from '../../test/db.js';
import { httpError } from '../utils/httpError.js';
import specimens, { STATUS } from '../../test/fixtures/specimens.js';

// A side collection hooks write to, so we can check it is rolled back too.
const Echo = mongoose.models.Echo ?? mongoose.model('Echo', new mongoose.Schema({ note: String }));

const curses = defineResource({
  key: 'curses',
  label: 'Curses',
  fields: {
    name: { type: 'string', required: true },
    power: { type: 'number', min: 0 },
    failAt: { type: 'enum', values: ['none', 'beforeCreate', 'afterCreate', 'beforeUpdate', 'afterUpdate'], default: 'none' },
    code: { type: 'string' },
  },
  permissions: { read: ['Member'], create: ['Member'], update: ['Member'] },
  hooks: {
    async beforeCreate(data, ctx) {
      await Echo.create([{ note: `bc:${data.name}` }], { session: ctx.session });
      if (data.failAt === 'beforeCreate') throw httpError(422, 'nope');
      return { ...data, code: `C-${data.name}` }; // replacement data is re-sanitized
    },
    async afterCreate(doc, ctx) {
      await Echo.create([{ note: `ac:${doc.name}` }], { session: ctx.session });
      if (doc.failAt === 'afterCreate') throw httpError(422, 'nope');
    },
    async beforeUpdate(doc, changes, ctx) {
      await Echo.create([{ note: 'bu' }], { session: ctx.session });
      if (changes.failAt === 'beforeUpdate') throw httpError(422, 'nope');
      return changes;
    },
    async afterUpdate(doc, _before, ctx) {
      await Echo.create([{ note: 'au' }], { session: ctx.session });
      if (doc.failAt === 'afterUpdate') throw httpError(422, 'nope');
    },
  },
});

let db;
let actor;
beforeAll(async () => {
  db = await startDb([specimens, curses]);
  await Echo.createCollection().catch(() => {});
  actor = await makeActor('Member');
});
afterAll(() => db.stop());

const snapshot = async () => ({
  curses: await curses.model.find().sort({ _id: 1 }).lean(),
  echo: await Echo.countDocuments(),
  log: await ActivityLog.countDocuments(),
});

describe('Property 18: hook rollback', () => {
  test('when any hook throws, the record, hook side effects and activity log are unchanged', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.stringMatching(/^[a-z]{3,8}$/),
        fc.constantFrom('beforeCreate', 'afterCreate', 'beforeUpdate', 'afterUpdate'),
        async (name, failAt) => {
          await db.clear();
          let id = null;
          if (failAt.endsWith('Update')) id = String((await svc.create(curses, { name, power: 1 }, actor))._id);
          const before = await snapshot();

          const attempt = failAt.endsWith('Create')
            ? svc.create(curses, { name, failAt }, actor)
            : svc.update(curses, id, { power: 99, failAt }, actor);
          await expect(attempt).rejects.toMatchObject({ status: 422 });

          expect(await snapshot()).toEqual(before);
        }
      ),
      { numRuns: 30 }
    );
  });

  test('beforeCreate replacement data is applied (and still sanitized)', async () => {
    const c = await svc.create(curses, { name: 'hex' }, actor);
    expect(c.code).toBe('C-hex');
  });
});

describe('Property 19: workflow-only states', () => {
  test('generic PATCH into or out of a workflow-only status is 409 and leaves the record unchanged', async () => {
    await fc.assert(
      fc.asyncProperty(fc.constantFrom(...STATUS), fc.boolean(), async (other, into) => {
        await db.clear();
        const from = into ? other : 'Gone';
        const to = into ? 'Gone' : other;
        fc.pre(from !== to);
        const [doc] = await specimens.model.insertMany([{ name: 'wf', status: from }]);
        await expect(svc.update(specimens, String(doc._id), { status: to }, actor)).rejects.toMatchObject({ status: 409 });
        expect((await specimens.model.findById(doc._id).lean()).status).toBe(from);
      }),
      { numRuns: 30 }
    );
  });

  test('generic CREATE with a workflow-only status is 409', async () => {
    await expect(svc.create(specimens, { name: 'x', status: 'Gone' }, actor)).rejects.toMatchObject({ status: 409 });
  });
});
