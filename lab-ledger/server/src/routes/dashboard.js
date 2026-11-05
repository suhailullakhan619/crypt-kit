import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import asyncHandler from '../utils/asyncHandler.js';
import { getDashboard } from '../services/dashboardService.js';

const router = Router();

// GET /api/dashboard — per readable resource stats, recent activity, app panels
router.get('/', authenticate, asyncHandler(async (req, res) => {
  res.status(200).json(await getDashboard(req.user));
}));

export default router;
