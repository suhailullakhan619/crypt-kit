import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { resolveResource } from '../middleware/resolveResource.js';
import { requirePermission } from '../middleware/requirePermission.js';
import * as resourceController from '../controllers/resourceController.js';

/**
 * Generic CRUD for every registered resource, mounted at /api/r (Req 5.1).
 * Every route: authenticate → resolveResource (404 unknown key) → permission for the action.
 */
const router = Router();

router.use('/:key', authenticate, resolveResource);

router.get('/:key', requirePermission('read'), resourceController.list);
router.post('/:key', requirePermission('create'), resourceController.create);
router.get('/:key/:id', requirePermission('read'), resourceController.get);
router.patch('/:key/:id', requirePermission('update'), resourceController.update);
router.delete('/:key/:id', requirePermission('delete'), resourceController.remove);
router.get('/:key/:id/activity', requirePermission('read'), resourceController.activity);

export default router;
