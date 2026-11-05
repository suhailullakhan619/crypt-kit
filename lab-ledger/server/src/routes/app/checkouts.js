import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/requireRole.js';
import { requirePermission } from '../../middleware/requirePermission.js';
import * as checkoutController from '../../controllers/checkoutController.js';
import { STAFF_ROLES } from '../../services/checkoutService.js';

/**
 * Checkout workflow (lab-ledger Req 3). Mounted at /api by the skeleton's app-route loader.
 * Generic /api/r/checkouts mutations stay LabManager-only; every state change goes through here.
 */
const router = Router();
const staff = requireRole(...STAFF_ROLES);
const reader = requirePermission('checkouts', 'read');

router.get('/checkouts/mine', authenticate, reader, checkoutController.mine);
router.post('/checkouts', authenticate, reader, checkoutController.request);
router.post('/checkouts/:id/approve', authenticate, staff, checkoutController.approve);
router.post('/checkouts/:id/reject', authenticate, staff, checkoutController.reject);
router.post('/checkouts/:id/cancel', authenticate, reader, checkoutController.cancel); // borrower or staff (service)
router.post('/checkouts/:id/return', authenticate, staff, checkoutController.returnItem);

export default router;
