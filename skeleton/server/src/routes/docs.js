import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { getContext } from '../context.js';
import { buildOpenApi } from '../services/openapiService.js';

const router = Router();

// GET /api/docs → OpenAPI 3.0 JSON generated from the resource definitions (any signed-in user)
router.get('/', authenticate, (_req, res) => {
  const { registry, config } = getContext();
  res.status(200).json(buildOpenApi(registry, config));
});

export default router;
