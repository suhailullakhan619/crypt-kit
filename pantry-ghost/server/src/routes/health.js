import { Router } from 'express';
import { getContext } from '../context.js';

const router = Router();

// GET /api/health — public smoke-test endpoint
router.get('/', (_req, res) => {
  const { env, config } = getContext();
  res.status(200).json({
    status: 'ok',
    app: config.appName,
    demo: env.DEMO_MODE,
    voiceProvider: env.VOICE_PROVIDER,
    timestamp: new Date().toISOString(),
  });
});

export default router;
