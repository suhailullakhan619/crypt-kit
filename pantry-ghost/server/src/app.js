import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { getContext } from './context.js';
import { buildApiRouter } from './routes/index.js';
import { errorHandler, apiNotFound } from './middleware/errorHandler.js';

/**
 * Express app factory. Requires the runtime context to be set (see context.js).
 * @returns {Promise<import('express').Express>}
 */
export async function createApp() {
  const { env } = getContext();
  const app = express();

  // ── Security headers ────────────────────────────────────────────────────────
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }));

  // ── CORS ────────────────────────────────────────────────────────────────────
  app.use(
    cors({
      origin: env.CLIENT_URL,
      credentials: true,
      exposedHeaders: ['X-Transcript', 'X-Answer', 'Content-Disposition'],
    })
  );

  // ── Body parsing ────────────────────────────────────────────────────────────
  app.use(express.json({ limit: '1mb' }));

  // ── API ─────────────────────────────────────────────────────────────────────
  app.use('/api', await buildApiRouter());
  app.use('/api', apiNotFound);

  // ── Global error handler (last) ─────────────────────────────────────────────
  app.use(errorHandler);

  return app;
}

export default createApp;
