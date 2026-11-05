import User from '../models/User.js';
import config from '../../crypt.config.js';
import { hashPassword } from './authService.js';
import { httpError } from '../utils/httpError.js';
import { paginate } from '../utils/pagination.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Lists users, newest first.
 * @param {{ page?: any, limit?: any }} query
 * @returns {Promise<{ items: object[], total: number, page: number, pages: number }>}
 */
export async function listUsers(query = {}) {
  const { page, limit, skip } = paginate(query);
  const [docs, total] = await Promise.all([
    User.find().sort({ createdAt: -1 }).skip(skip).limit(limit),
    User.countDocuments(),
  ]);
  return { items: docs.map((u) => u.toPublic()), total, page, pages: Math.ceil(total / limit) };
}

/**
 * Creates a user (Superuser only — enforced by the route).
 * @param {{ name: string, email: string, password: string, role: string }} data
 * @returns {Promise<object>} public user
 * @throws {Error} 400 invalid input / unknown role, 409 duplicate email
 */
export async function createUser({ name, email, password, role } = {}) {
  const fields = {};
  if (typeof name !== 'string' || !name.trim()) fields.name = 'Name is required';
  if (typeof email !== 'string' || !EMAIL_RE.test(email.trim())) fields.email = 'A valid email is required';
  if (typeof password !== 'string' || password.length < 8) fields.password = 'Password must be at least 8 characters';
  if (!config.roles.includes(role)) fields.role = `Role must be one of: ${config.roles.join(', ')}`;
  if (Object.keys(fields).length) throw httpError(400, 'Validation failed', { fields });

  const normalised = email.toLowerCase().trim();
  if (await User.findOne({ email: normalised })) {
    throw httpError(409, 'Email already registered', { fields: { email: 'Already registered' } });
  }

  const user = await User.create({
    name: name.trim(),
    email: normalised,
    passwordHash: await hashPassword(password),
    role,
  });
  return user.toPublic();
}

/**
 * Updates name / role / active. A Superuser cannot demote or deactivate themself
 * (prevents locking everyone out).
 * @param {string} id
 * @param {{ name?: string, role?: string, active?: boolean }} changes
 * @param {{ userId: string }} actor
 * @returns {Promise<object>} public user
 * @throws {Error} 400 invalid change, 404 unknown user
 */
export async function updateUser(id, changes = {}, actor) {
  const user = await User.findById(id);
  if (!user) throw httpError(404, 'User not found');

  const isSelf = String(user._id) === String(actor?.userId);

  if (changes.name !== undefined) {
    if (typeof changes.name !== 'string' || !changes.name.trim()) throw httpError(400, 'Name is required');
    user.name = changes.name.trim();
  }
  if (changes.role !== undefined) {
    if (!config.roles.includes(changes.role)) throw httpError(400, `Role must be one of: ${config.roles.join(', ')}`);
    if (isSelf && changes.role !== user.role) throw httpError(400, 'You cannot change your own role');
    user.role = changes.role;
  }
  if (changes.active !== undefined) {
    if (typeof changes.active !== 'boolean') throw httpError(400, 'active must be true or false');
    if (isSelf && changes.active === false) throw httpError(400, 'You cannot deactivate yourself');
    user.active = changes.active;
  }

  await user.save();
  return user.toPublic();
}

/**
 * Small searchable list for ref pickers: `{ _id, name }` only.
 * @param {string} q
 */
export async function searchUsers(q = '') {
  const filter = { active: true };
  if (q) filter.name = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
  const users = await User.find(filter).sort({ name: 1 }).limit(20).select('name');
  return users.map((u) => ({ _id: u._id, name: u.name }));
}
