// The seed keeps the demo accounts and, when .env names one, adds an owner account as the superuser.
import bcrypt from 'bcryptjs';
import config from '../../crypt.config.js';
import User from '../models/User.js';
import '../models/ActivityLog.js';
import { loadEnv, setEnvForTests } from '../config/env.js';
import { seedUsers } from './users.js';
import { startDb } from '../../test/db.js';
import { TEST_SECRET } from '../../test/helpers.js';

let db;
const env = (extra = {}) => setEnvForTests({ ...loadEnv({ DEMO_MODE: 'true', JWT_SECRET: TEST_SECRET, ...extra }) });
beforeAll(async () => { db = await startDb([]); });
afterAll(() => db.stop());
beforeEach(async () => { await db.clear(); env(); });

test('without an owner in .env, exactly the demo accounts are created', async () => {
  const users = await seedUsers();
  expect(users.map((u) => u.email).sort()).toEqual(config.demoUsers.map((d) => d.email.toLowerCase()).sort());
});

test('an owner from .env is added first, as the superuser, next to the demo accounts', async () => {
  env({ SEED_ADMIN_EMAIL: 'Owner@Example.test', SEED_ADMIN_PASSWORD: 'owner-password-1', SEED_ADMIN_NAME: 'The Owner' });
  const users = await seedUsers();
  expect(users[0]).toMatchObject({ email: 'owner@example.test', name: 'The Owner', role: config.roles[0] });
  expect(users).toHaveLength(config.demoUsers.length + 1);
  const stored = await User.findOne({ email: 'owner@example.test' }).select('+passwordHash');
  expect(await bcrypt.compare('owner-password-1', stored.passwordHash)).toBe(true);
});

test('seeding again never overwrites the owner, so a changed password survives a restart', async () => {
  env({ SEED_ADMIN_EMAIL: 'owner@example.test', SEED_ADMIN_PASSWORD: 'owner-password-1' });
  await seedUsers();
  await User.updateOne({ email: 'owner@example.test' }, { passwordHash: await bcrypt.hash('changed-password-2', 4) });
  await seedUsers();
  expect(await User.countDocuments({ email: 'owner@example.test' })).toBe(1);
  const stored = await User.findOne({ email: 'owner@example.test' }).select('+passwordHash');
  expect(await bcrypt.compare('changed-password-2', stored.passwordHash)).toBe(true);
});
