import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { resolveResource } from '../middleware/resolveResource.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { rateLimit } from '../middleware/rateLimit.js';
import * as resourceController from '../controllers/resourceController.js';
import * as commentController from '../controllers/commentController.js';

/** Comments are on for every resource unless its definition says `comments: false` (405 otherwise). */
const commentsEnabled = (req, res, next) => {
  if (req.resource?.def.comments === false) return res.status(405).json({ error: `Comments are turned off for ${req.resource.def.label}` });
  return next();
};

/** 30 new comments per 15 minutes per user. */
export const commentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  keyFn: (req) => req.user?.userId ?? '',
  message: 'You are commenting too fast. Please wait a few minutes.',
});

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
router.get('/:key/export', requirePermission('read'), resourceController.exportCsv);
router.post('/:key/import', allowGeneric('create'), requirePermission('create'), resourceController.importCsv);
router.post('/:key', allowGeneric('create'), requirePermission('create'), resourceController.create);
router.get('/:key/:id', requirePermission('read'), resourceController.get);
router.patch('/:key/:id', allowGeneric('update'), requirePermission('update'), resourceController.update);
router.delete('/:key/:id', allowGeneric('delete'), requirePermission('delete'), resourceController.remove);
router.get('/:key/:id/activity', requirePermission('read'), resourceController.activity);
router.get('/:key/:id/comments', commentsEnabled, requirePermission('read'), commentController.list);
router.post('/:key/:id/comments', commentsEnabled, requirePermission('read'), commentLimiter, commentController.add);
router.delete('/:key/:id/comments/:commentId', commentsEnabled, requirePermission('read'), commentController.remove);

export default router;
