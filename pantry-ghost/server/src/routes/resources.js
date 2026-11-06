import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { resolveResource } from '../middleware/resolveResource.js';
import { requirePermission } from '../middleware/requirePermission.js';
import * as resourceController from '../controllers/resourceController.js';

/**
 * Refuses generic actions listed in the definition's `genericDisabled`, for every role
 * (Req 16.12). Runs before the permission check, so even the Superuser gets 405.
 */
const allowGeneric = (action) => (req, res, next) => {
  if (req.resource?.def.genericDisabled?.includes(action)) {
    return res.status(405).json({ error: `${req.resource.def.label} are managed by a workflow; generic ${action} is disabled` });
  }
  return next();
};

/**
 * Generic CRUD for every registered resource, mounted at /api/r (Req 5.1).
 * Every route: authenticate → resolveResource (404 unknown key) → permission for the action.
 */
const router = Router();

router.use('/:key', authenticate, resolveResource);

router.get('/:key', requirePermission('read'), resourceController.list);
router.post('/:key', allowGeneric('create'), requirePermission('create'), resourceController.create);
router.get('/:key/:id', requirePermission('read'), resourceController.get);
router.patch('/:key/:id', allowGeneric('update'), requirePermission('update'), resourceController.update);
router.delete('/:key/:id', allowGeneric('delete'), requirePermission('delete'), resourceController.remove);
router.get('/:key/:id/activity', requirePermission('read'), resourceController.activity);

export default router;
