import { Router } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadModules } from '../utils/loadModules.js';
import healthRouter from './health.js';
import authRouter from './auth.js';
import usersRouter from './users.js';
import metaRouter from './meta.js';
import resourcesRouter from './resources.js';
import activityRouter from './activity.js';
import dashboardRouter from './dashboard.js';
import reportsRouter from './reports.js';
import voiceRouter from './voice.js';

const APP_ROUTES_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'app');

/**
 * Builds the /api router: core routers, then app routers from src/routes/app/*.js
 * (each default-exports an express Router, mounted at /api — Req 16.5).
 * @returns {Promise<import('express').Router>}
 */
export async function buildApiRouter() {
  const api = Router();
  api.use('/health', healthRouter);
  api.use('/auth', authRouter);
  api.use('/users', usersRouter);
  api.use('/meta', metaRouter);
  api.use('/r', resourcesRouter);
  api.use('/activity', activityRouter);
  api.use('/dashboard', dashboardRouter);
  api.use('/reports', reportsRouter);
  api.use('/voice', voiceRouter);

  for (const { file, value } of await loadModules(APP_ROUTES_DIR)) {
    if (typeof value !== 'function') throw new Error(`routes/app/${file} must default-export an express Router`);
    api.use(value);
  }
  return api;
}
