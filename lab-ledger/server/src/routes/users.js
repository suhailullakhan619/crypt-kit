import { Router } from 'express';
import config from '../../crypt.config.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import * as userController from '../controllers/userController.js';

const router = Router();
const superuser = requireRole(config.roles[0]);

// GET /api/users/search — any authenticated user (ref pickers need names)
router.get('/search', authenticate, userController.search);

// Superuser-only user management
router.get('/', authenticate, superuser, userController.list);
router.post('/', authenticate, superuser, userController.create);
router.patch('/:id', authenticate, superuser, userController.update);

export default router;
