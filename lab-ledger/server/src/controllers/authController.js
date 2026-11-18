import * as authService from '../services/authService.js';
import asyncHandler from '../utils/asyncHandler.js';
import { httpError } from '../utils/httpError.js';
import { getContext } from '../context.js';
import config from '../../crypt.config.js';

/**
 * POST /api/auth/login
 * Body: { email, password } → 200 { token, user }
 */
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body ?? {};
  if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
    throw httpError(400, 'Email and password are required');
  }
  const result = await authService.login(email, password);
  res.status(200).json(result);
});

/**
 * POST /api/auth/demo-login
 * Body: { email } of a configured demo user → 200 { token, user }. 404 outside DEMO_MODE.
 */
export const demoLogin = asyncHandler(async (req, res) => {
  const { env } = getContext();
  if (!env.DEMO_MODE) throw httpError(404, 'Not found');
  const demo = (config.demoUsers ?? []).find((u) => u.email === String(req.body?.email ?? '').toLowerCase());
  if (!demo) throw httpError(400, 'Unknown demo user');
  res.status(200).json(await authService.login(demo.email, demo.password));
});

/**
 * GET /api/auth/me → 200 { user }
 */
export const me = asyncHandler(async (req, res) => {
  const user = await authService.getMe(req.user.userId);
  res.status(200).json({ user });
});

/**
 * POST /api/auth/change-password
 * Body: { currentPassword, newPassword } → 204
 */
export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body ?? {};
  await authService.changePassword(req.user.userId, currentPassword, newPassword);
  res.status(204).end();
});
/** POST /api/auth/signup { name, email, password } → 201 { pending: true, email } */
export const signup = asyncHandler(async (req, res) => {
  res.status(201).json(await authService.signup(req.body ?? {}));
});

/** POST /api/auth/forgot-password { email } → 200 (same answer whether or not the email exists) */
export const forgotPassword = asyncHandler(async (req, res) => {
  await authService.requestPasswordReset(req.body?.email);
  res.status(200).json({ message: 'If an account uses that email, a reset link is on its way. Check your spam folder too.' });
});

/** POST /api/auth/reset-password { token, password } → 204 */
export const resetPassword = asyncHandler(async (req, res) => {
  await authService.resetPassword(req.body?.token, req.body?.password);
  res.status(204).end();
});