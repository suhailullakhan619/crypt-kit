import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { getEnv } from '../config/env.js';
import { httpError } from '../utils/httpError.js';

export const BCRYPT_COST = 10;
export const TOKEN_TTL = '24h';

// Compared against when the email is unknown so both failure paths take similar time.
const DUMMY_HASH = bcrypt.hashSync('crypt-kit-timing-dummy', BCRYPT_COST);
const INVALID = 'Invalid email or password';

/**
 * Signs a 24 h JWT carrying { userId, role, name }.
 * @param {{ _id: any, role: string, name: string }} user
 * @returns {string}
 */
export function signToken(user) {
  return jwt.sign(
    { userId: String(user._id), role: user.role, name: user.name },
    getEnv().JWT_SECRET,
    { expiresIn: TOKEN_TTL, algorithm: 'HS256' }
  );
}

/** @param {string} password @returns {Promise<string>} bcrypt hash with cost ≥ 10 */
export function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_COST);
}

/**
 * Validates credentials and returns a signed token plus the public user.
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{ token: string, user: object }>}
 * @throws {Error} 401 (same message for unknown email, wrong password, inactive user)
 */
export async function login(email, password) {
  const user = await User.findOne({ email: String(email).toLowerCase().trim() }).select('+passwordHash');

  const ok = await bcrypt.compare(String(password), user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok || user.active === false) throw httpError(401, INVALID);

  return { token: signToken(user), user: user.toPublic() };
}

/**
 * @param {string} userId
 * @returns {Promise<object>} public user
 * @throws {Error} 404 when the user no longer exists
 */
export async function getMe(userId) {
  const user = await User.findById(userId);
  if (!user) throw httpError(404, 'User not found');
  return user.toPublic();
}
