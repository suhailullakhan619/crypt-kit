import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../app.js';
import { hashPassword, login } from './authService.js';
import User from '../models/User.js';
import { startDb } from '../../test/db.js';
import { TEST_SECRET } from '../../test/helpers.js';
import config from '../../crypt.config.js';

let db;
let app;
let user;
const auth = () => ({ Authorization: `Bearer ${jwt.sign({ userId: String(user._id), role: user.role, name: user.name }, TEST_SECRET)}` });
const change = (body) => request(app).post('/api/auth/change-password').set(auth()).send(body);

beforeAll(async () => {
  db = await startDb([]);
  app = await createApp();
});
afterAll(() => db.stop());
beforeEach(async () => {
  await db.clear();
  user = await User.create({ name: 'Pat', email: 'pat@t.test', role: config.roles[1], passwordHash: await hashPassword('old-password-1') });
});

describe('POST /api/auth/change-password', () => {
  test('changes the password: the new one signs in, the old one no longer does', async () => {
    expect((await change({ currentPassword: 'old-password-1', newPassword: 'new-password-2' })).status).toBe(204);
    await expect(login('pat@t.test', 'new-password-2')).resolves.toHaveProperty('token');
    await expect(login('pat@t.test', 'old-password-1')).rejects.toMatchObject({ status: 401 });
  });

  test('rejects a wrong current password without changing anything', async () => {
    const res = await change({ currentPassword: 'nope-nope-1', newPassword: 'new-password-2' });
    expect(res.status).toBe(401);
    await expect(login('pat@t.test', 'old-password-1')).resolves.toHaveProperty('token');
  });

  test('rejects short, unchanged and missing passwords', async () => {
    expect((await change({ currentPassword: 'old-password-1', newPassword: 'short' })).status).toBe(400);
    expect((await change({ currentPassword: 'old-password-1', newPassword: 'old-password-1' })).status).toBe(400);
    expect((await change({ newPassword: 'new-password-2' })).status).toBe(400);
  });

  test('requires a sign-in', async () => {
    expect((await request(app).post('/api/auth/change-password').send({})).status).toBe(401);
  });
});
