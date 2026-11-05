import { Router } from 'express';
import config from '../../crypt.config.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import * as resourceController from '../controllers/resourceController.js';

const router = Router();

// GET /api/activity — latest 50 entries across all resources (Superuser only, Req 6.3)
router.get('/', authenticate, requireRole(config.roles[0]), resourceController.latestActivity);

export default router;
