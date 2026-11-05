import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/requireRole.js';
import * as impactController from '../../controllers/impactController.js';

/**
 * Monthly impact report (Req 7.1): Coordinator and Board. The core /api/reports router has no
 * /impact path, so these requests fall through to this app router.
 */
const router = Router();
const guard = [authenticate, requireRole('Coordinator', 'Board')];

router.post('/reports/impact', ...guard, impactController.generate);
router.get('/reports/impact/preview', ...guard, impactController.preview);

export default router;
