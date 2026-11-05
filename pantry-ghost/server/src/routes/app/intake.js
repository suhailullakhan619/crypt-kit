import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission } from '../../middleware/requirePermission.js';
import * as intakeController from '../../controllers/intakeController.js';

/** Intake (Req 4.5): whoever may create stock lots (Coordinator, Volunteer). Parse never saves. */
const router = Router();

router.post('/intake/parse', authenticate, requirePermission('stock-lots', 'create'), intakeController.parse);
router.post('/intake', authenticate, requirePermission('stock-lots', 'create'), intakeController.save);

export default router;
