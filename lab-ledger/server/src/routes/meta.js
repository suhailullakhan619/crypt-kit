import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { getContext } from '../context.js';
import { buildMeta, buildPublicMeta } from '../services/metaService.js';

const router = Router();

// GET /api/meta/public — no auth: app name, theme, demo flag (+ demo users in DEMO_MODE)
router.get('/public', (_req, res) => {
  const { config, env } = getContext();
  res.status(200).json(buildPublicMeta(config, env));
});

// GET /api/meta — resources the current user may read, with per-action permission flags
router.get('/', authenticate, (req, res) => {
  const { registry, config } = getContext();
  res.status(200).json(buildMeta(registry, config, req.user));
});

export default router;
