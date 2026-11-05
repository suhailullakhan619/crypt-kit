import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import * as authController from '../controllers/authController.js';

const router = Router();

// POST /api/auth/login — public
router.post('/login', authController.login);

// POST /api/auth/demo-login — public, DEMO_MODE only (one-click demo sign-in, Req 15.3)
router.post('/demo-login', authController.demoLogin);

// GET /api/auth/me — any authenticated user
router.get('/me', authenticate, authController.me);

export default router;
