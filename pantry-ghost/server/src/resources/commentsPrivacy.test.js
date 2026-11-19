// Property P6 (privacy) extended to comments: households and distributions never accept free text,
// so names or addresses cannot be stored through the comment thread. Other resources keep comments.
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../app.js';
import { startDb, makeActor } from '../../test/db.js';
import { TEST_SECRET } from '../../test/helpers.js';
import donors from './donors.js';
import stockLots from './stock-lots.js';
import households from './households.js';
import distributions from './distributions.js';

let db;
let app;
let auth;
beforeAll(async () => {
  db = await startDb([donors, stockLots, households, distributions]);
  app = await createApp();
  const coordinator = await makeActor('Coordinator', 'Cora');
  auth = { Authorization: `Bearer ${jwt.sign({ userId: coordinator.userId, role: coordinator.role, name: coordinator.name }, TEST_SECRET)}` };
});
afterAll(() => db.stop());

test('households and distributions refuse comments (405); meta reports them off', async () => {
  const [hh] = await households.model.create([{ code: 'H-0001', size: 2, dietary: [] }]);
  for (const path of [`/api/r/households/${hh._id}/comments`]) {
    const post = await request(app).post(path).set(auth).send({ body: 'Lives at 12 Elm Street' });
    expect(post.status).toBe(405);
    expect((await request(app).get(path).set(auth)).status).toBe(405);
  }
  expect((await request(app).get(`/api/r/distributions/${hh._id}/comments`).set(auth)).status).toBe(405);
  const meta = await request(app).get('/api/meta').set(auth);
  const flag = (k) => meta.body.resources.find((r) => r.key === k)?.comments;
  expect(flag('households')).toBe(false);
  expect(flag('distributions')).toBe(false);
  expect(flag('donors')).toBe(true);
});

test('donors still take comments', async () => {
  const [d] = await donors.model.create([{ name: 'Fresh Mart', type: 'Grocery' }]);
  const res = await request(app).post(`/api/r/donors/${d._id}/comments`).set(auth).send({ body: 'Prefers Tuesday pickups' });
  expect(res.status).toBe(201);
});
