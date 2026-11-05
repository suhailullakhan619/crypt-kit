import User from '../models/User.js';
import config from '../../crypt.config.js';
import { hashPassword } from '../services/authService.js';

/**
 * Idempotently creates one demo user per entry in `crypt.config.js` → demoUsers.
 * Existing users (matched by email) are left untouched.
 * @returns {Promise<import('mongoose').Document[]>} all demo user documents
 */
export async function seedUsers() {
  const users = [];
  for (const demo of config.demoUsers ?? []) {
    const email = demo.email.toLowerCase();
    let user = await User.findOne({ email });
    if (!user) {
      user = await User.create({
        name: demo.name,
        email,
        role: demo.role,
        passwordHash: await hashPassword(demo.password),
      });
    }
    users.push(user);
  }
  return users;
}
