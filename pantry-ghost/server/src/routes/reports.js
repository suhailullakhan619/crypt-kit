import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import * as reportController from '../controllers/reportController.js';

const router = Router();

// Read permission on the report's resource is checked inside the service.
router.post('/', authenticate, reportController.generate);
router.get('/', authenticate, reportController.list);
router.get('/:id/download', authenticate, reportController.download);

export default router;
