import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/requireRole.js';
import { requirePermission } from '../../middleware/requirePermission.js';
import * as equipmentController from '../../controllers/equipmentController.js';
import { STAFF_ROLES } from '../../services/checkoutService.js';

/** QR labels and scan lookup (lab-ledger Req 5). Mounted at /api. */
const router = Router();

router.get('/equipment/by-tag/:tag', authenticate, requirePermission('equipment', 'read'), equipmentController.byTag);
router.post('/equipment/labels', authenticate, requireRole(...STAFF_ROLES), equipmentController.labels);

export default router;
