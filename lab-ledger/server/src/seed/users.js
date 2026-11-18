import User from '../models/User.js';
import config from '../../crypt.config.js';
import { getEnv } from '../config/env.js';
import { hashPassword } from '../services/authService.js';

/** Creates a user unless one with this email exists (existing users are never changed). */
async function ensureUser({ name, email, password, role }) {
  const normalised = email.toLowerCase();
  const existing = await User.findOne({ email: normalised });
  if (existing) return existing;
  return User.create({ name, email: normalised, role, passwordHash: await hashPassword(password) });
}

/**
 * Idempotently creates the seed users:
 *  1. the owner account from SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD in .env, as the superuser
 *     (first role). It comes first, so it owns the seeded records.
 *  2. one user per entry in `crypt.config.js` → demoUsers (may be empty).
 * Existing users (matched by email) are left untouched, so a changed password is kept.
 * @returns {Promise<import('mongoose').Document[]>}
 */
export async function seedUsers() {
  const users = [];
  const owner = getEnv().SEED_ADMIN;
  if (owner) users.push(await ensureUser({ ...owner, role: config.roles[0] }));
  for (const demo of config.demoUsers ?? []) {
    if (owner && demo.email.toLowerCase() === owner.email) continue;
    users.push(await ensureUser(demo));
  }
  return users;
}
