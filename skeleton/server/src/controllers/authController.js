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
