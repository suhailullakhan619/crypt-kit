import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import config from '../../crypt.config.js';
import { getEnv } from '../config/env.js';
import { httpError } from '../utils/httpError.js';
import { notify } from './notificationService.js';
import { mailEnabled, sendMail, renderNotificationEmail } from './mailService.js';

export const BCRYPT_COST = 10;
export const TOKEN_TTL = '24h';

// Compared against when the email is unknown so both failure paths take similar time.
const DUMMY_HASH = bcrypt.hashSync('crypt-kit-timing-dummy', BCRYPT_COST);
const INVALID = 'Invalid email or password';
const PENDING = 'Your account is waiting for approval. You can sign in once an administrator approves it.';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const RESET_TTL_MS = 30 * 60 * 1000;
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const DEMO_LOCKED = 'Demo accounts keep their password so the one-click demo keeps working. Create your own account to try this.';

/**
 * In DEMO_MODE the demo accounts sign in with the passwords in crypt.config.js, so their passwords
 * must not change: otherwise one visitor could break the one-click demo for everyone.
 */
export function isDemoAccount(email) {
  if (!getEnv().DEMO_MODE) return false;
  const e = String(email ?? '').toLowerCase();
  return (config.demoUsers ?? []).some((d) => d.email.toLowerCase() === e);
}

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
  // A sign-up waiting for approval is told so, but only once the password is proven right; every
  // other failure (unknown email, wrong password, deactivated account) gets the same message.
  if (user && ok && user.active === false && user.pendingApproval) throw httpError(401, PENDING);
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

/**
 * Changes the signed-in user's password after checking the current one.
 * @throws {Error} 400 weak/same password, 401 wrong current password, 404 unknown user
 */
export async function changePassword(userId, currentPassword, newPassword) {
  if (typeof currentPassword !== 'string' || typeof newPassword !== 'string' || !currentPassword) {
    throw httpError(400, 'Current and new password are required');
  }
  if (newPassword.length < 8) throw httpError(400, 'New password must be at least 8 characters', { fields: { newPassword: 'At least 8 characters' } });
  if (newPassword === currentPassword) throw httpError(400, 'New password must be different from the current one', { fields: { newPassword: 'Must be different' } });

  const user = await User.findById(userId).select('+passwordHash');
  if (!user) throw httpError(404, 'User not found');
  if (isDemoAccount(user.email)) throw httpError(409, DEMO_LOCKED);
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    throw httpError(401, 'Current password is incorrect', { fields: { currentPassword: 'Incorrect' } });
  }
  user.passwordHash = await hashPassword(newPassword);
  await user.save();
}
/** True unless crypt.config.js turns self sign-up off (`signup: { enabled: false }`). */
export const signupEnabled = () => config.signup?.enabled !== false;

/**
 * Self sign-up. The account is created inactive, with the lowest role, and marked as waiting for
 * approval; every superuser is notified (in the app and by email) to approve it and pick a role.
 * @param {{ name: string, email: string, password: string }} input
 * @returns {Promise<{ pending: true, email: string }>}
 * @throws {Error} 404 when sign-up is off, 400 invalid input, 409 email already registered
 */
export async function signup({ name, email, password } = {}) {
  if (!signupEnabled()) throw httpError(404, 'Sign-up is not available');
  const fields = {};
  if (typeof name !== 'string' || !name.trim()) fields.name = 'Name is required';
  else if (name.trim().length > 120) fields.name = 'Name is too long';
  if (typeof email !== 'string' || !EMAIL_RE.test(email.trim())) fields.email = 'A valid email is required';
  if (typeof password !== 'string' || password.length < 8) fields.password = 'Password must be at least 8 characters';
  if (Object.keys(fields).length) throw httpError(400, 'Please fix the highlighted fields', { fields });

  const normalised = email.trim().toLowerCase();
  if (await User.findOne({ email: normalised })) {
    throw httpError(409, 'An account with this email already exists. Sign in, or use "Forgot password".', { fields: { email: 'Already registered' } });
  }
  const user = await User.create({
    name: name.trim(),
    email: normalised,
    passwordHash: await hashPassword(password),
    role: config.roles[config.roles.length - 1],
    active: false,
    pendingApproval: true,
  });
  await notify({
    roles: [config.roles[0]],
    title: `${user.name} signed up and is waiting for approval`,
    body: `${user.email} asked for an account. Open Users to approve it and choose a role.`,
    link: '/users',
    kind: 'info',
    dedupeKey: `signup:${user._id}`,
  });
  return { pending: true, email: user.email };
}

/**
 * Emails a one-time reset link (valid 30 minutes) to an active account. Always resolves the same
 * way whether or not the email is registered, so the form cannot be used to discover accounts.
 * @throws {Error} 503 when email is not set up on the server
 */
export async function requestPasswordReset(email) {
  if (!mailEnabled()) throw httpError(503, 'Password reset by email is not set up on this server. Ask an administrator to reset it.');
  if (typeof email !== 'string' || !EMAIL_RE.test(email.trim())) throw httpError(400, 'Enter a valid email address', { fields: { email: 'A valid email is required' } });
  const user = await User.findOne({ email: email.trim().toLowerCase(), active: true });
  if (!user || isDemoAccount(user.email)) return;

  const token = crypto.randomBytes(32).toString('base64url');
  user.resetTokenHash = sha256(token);
  user.resetTokenExpires = new Date(Date.now() + RESET_TTL_MS);
  await user.save();

  const env = getEnv();
  const url = `${String(env.CLIENT_URL).replace(/\/$/, '')}/reset-password?token=${token}`;
  const { text, html } = renderNotificationEmail({
    title: `Reset your ${config.appName} password`,
    body: 'Someone (hopefully you) asked to reset your password. The link works once and expires in 30 minutes. If you did not ask for this, ignore this email.',
    url,
    appName: config.appName,
  });
  await sendMail({ to: user.email, subject: `[${config.appName}] Reset your password`, text, html });
}

/**
 * Sets a new password from a reset link. The link works once.
 * @throws {Error} 400 weak password or invalid/expired/used link
 */
export async function resetPassword(token, password) {
  if (typeof password !== 'string' || password.length < 8) throw httpError(400, 'Password must be at least 8 characters', { fields: { password: 'At least 8 characters' } });
  const expired = 'This reset link is invalid or has expired. Ask for a new one.';
  if (typeof token !== 'string' || token.length < 20 || token.length > 200) throw httpError(400, expired);
  const user = await User.findOne({ resetTokenHash: sha256(token), resetTokenExpires: { $gt: new Date() }, active: true });
  if (!user) throw httpError(400, expired);
  user.passwordHash = await hashPassword(password);
  user.resetTokenHash = undefined;
  user.resetTokenExpires = undefined;
  await user.save();
}