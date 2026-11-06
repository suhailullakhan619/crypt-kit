// Property 21: Generically Disabled Actions Are Refused for Every Role — Validates: Requirements 16.12
import fc from 'fast-check';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { defineResource, validateDefinition } from '../core/defineResource.js';
import { createApp } from '../app.js';
import { startDb, makeActor } from '../../test/db.js';
import { TEST_SECRET } from '../../test/helpers.js';
import config from '../../crypt.config.js';

const ledgers = defineResource({
  key: 'ledgers',
  label: 'Ledgers',
  fields: { title: { type: 'string', required: true } },
  permissions: { read: config.roles.slice(1), create: config.roles.slice(1), update: config.roles.slice(1), delete: config.roles.slice(1) },
  genericDisabled: ['create', 'delete'],
});

let db;
let app;
const tokens = {};
beforeAll(async () => {
  db = await startDb([ledgers]);
  app = await createApp();
  for (const role of config.roles) {
    const a = await makeActor(role, role);
    tokens[role] = jwt.sign({ userId: a.userId, role, name: role }, TEST_SECRET);
  }
});
afterAll(() => db.stop());

describe('Property 21: genericDisabled', () => {
  test('disabled actions return 405 for every role (Superuser included) and change nothing', async () => {
    await fc.assert(
      fc.asyncProperty(fc.constantFrom(...config.roles), fc.constantFrom('create', 'delete'), async (role, action) => {
        await db.clear();
        const [doc] = await ledgers.model.insertMany([{ title: 'Book of the dead' }]);
        const auth = { Authorization: `Bearer ${tokens[role]}` };
        const res = action === 'create'
          ? await request(app).post('/api/r/ledgers').set(auth).send({ title: 'New' })
          : await request(app).delete(`/api/r/ledgers/${doc._id}`).set(auth);
        expect(res.status).toBe(405);
        expect(await ledgers.model.countDocuments()).toBe(1);
      }),
      { numRuns: 30 }
    );
  });

  test('enabled actions still follow the permission matrix', async () => {
    await db.clear();
    const [doc] = await ledgers.model.insertMany([{ title: 'Grimoire' }]);
    const res = await request(app).patch(`/api/r/ledgers/${doc._id}`).set({ Authorization: `Bearer ${tokens[config.roles[1]]}` }).send({ title: 'Grimoire II' });
    expect(res.status).toBe(200);
  });

  test('meta reports disabled actions as not permitted for every role', async () => {
    for (const role of config.roles) {
      const res = await request(app).get('/api/meta').set({ Authorization: `Bearer ${tokens[role]}` });
      const meta = res.body.resources.find((r) => r.key === 'ledgers');
      expect(meta.permissions).toMatchObject({ create: false, delete: false });
      expect(meta.genericDisabled).toEqual(['create', 'delete']);
    }
  });

  test('validation rejects unknown genericDisabled actions', () => {
    const errs = validateDefinition({ key: 'x', label: 'X', fields: { a: { type: 'string' } }, permissions: {}, genericDisabled: ['read'] });
    expect(errs.join()).toMatch(/genericDisabled has unknown action "read"/);
  });
});
