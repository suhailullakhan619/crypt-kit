import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { getContext } from '../context.js';
import { buildMeta, buildPublicMeta } from '../services/metaService.js';
import { mailEnabled } from '../services/mailService.js';

const router = Router();

// GET /api/meta/public — no auth: app name, theme, demo flag (+ demo users in DEMO_MODE)
router.get('/public', (_req, res) => {
  const { config, env } = getContext();
  // "Forgot password" is offered exactly when the reset email can really be sent.
  res.status(200).json({ ...buildPublicMeta(config, env), passwordReset: mailEnabled() });
});

// GET /api/meta — resources the current user may read, with per-action permission flags
router.get('/', authenticate, (req, res) => {
  const { registry, config } = getContext();
  res.status(200).json(buildMeta(registry, config, req.user));
});

export default router;
