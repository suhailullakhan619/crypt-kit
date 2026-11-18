import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import * as authController from '../controllers/authController.js';
import { rateLimit } from '../middleware/rateLimit.js';

const router = Router();

// Brute-force protection: LOGIN_RATE_MAX attempts per 15 minutes per IP + email (default 10).
// Disabled under NODE_ENV=test unless LOGIN_RATE_MAX is set explicitly.
const explicitMax = Number(process.env.LOGIN_RATE_MAX);
const loginLimiter =
  process.env.NODE_ENV === 'test' && !explicitMax
    ? (_req, _res, next) => next()
    : rateLimit({
        max: explicitMax > 0 ? explicitMax : 10,
        keyFn: (req) => String(req.body?.email ?? '').toLowerCase(),
        message: 'Too many sign-in attempts. Please wait a few minutes and try again.',
      });

// POST /api/auth/login — public
router.post('/login', loginLimiter, authController.login);

// Public account endpoints, rate limited per IP (sign-up spam, reset-link guessing).
// Disabled under NODE_ENV=test unless AUTH_RATE_MAX is set, like the login limiter.
const authMax = Number(process.env.AUTH_RATE_MAX);
const publicLimiter = (max, message) =>
  process.env.NODE_ENV === 'test' && !authMax ? (_req, _res, next) => next() : rateLimit({ max: authMax > 0 ? authMax : max, message });

// POST /api/auth/signup — public; creates an account that waits for approval
router.post('/signup', publicLimiter(5, 'Too many sign-ups from here. Please try again later.'), authController.signup);

// POST /api/auth/forgot-password — public; emails a one-time reset link
router.post('/forgot-password', publicLimiter(5, 'Too many reset requests. Please wait a few minutes.'), authController.forgotPassword);

// POST /api/auth/reset-password — public; sets a new password from the link
router.post('/reset-password', publicLimiter(10, 'Too many attempts. Please wait a few minutes.'), authController.resetPassword);

// POST /api/auth/demo-login — public, DEMO_MODE only (one-click demo sign-in, Req 15.3)
router.post('/demo-login', authController.demoLogin);

// POST /api/auth/change-password — any authenticated user (rate limited per IP + user)
router.post('/change-password', authenticate, rateLimit({ max: 10, keyFn: (req) => req.user?.userId ?? '', message: 'Too many attempts. Please wait a few minutes.' }), authController.changePassword);

// GET /api/auth/me — any authenticated user
router.get('/me', authenticate, authController.me);

export default router;
