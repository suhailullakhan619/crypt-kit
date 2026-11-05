import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission } from '../../middleware/requirePermission.js';
import * as distributionController from '../../controllers/distributionController.js';

/**
 * FEFO distribution (Req 5.3): needs to see households and to change stock — Coordinator and
 * Volunteer. Board fails the households check.
 */
const router = Router();
const guard = [authenticate, requirePermission('households', 'read'), requirePermission('stock-lots', 'update')];

router.post('/distributions/plan', ...guard, distributionController.plan);
router.post('/distributions', ...guard, distributionController.commit);

export default router;
