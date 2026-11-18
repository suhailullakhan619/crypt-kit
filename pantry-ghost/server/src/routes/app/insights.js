import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/requireRole.js';
import * as insights from '../../services/insightsService.js';
import asyncHandler from '../../utils/asyncHandler.js';

/**
 * Staff-only insights (donor names): Coordinator and Volunteer.
 *   GET  /api/insights?days=90 → { stock, waste }
 *   POST /api/insights/report { days } → 201 { report }  (PDF)
 */
const router = Router();
const guard = [authenticate, requireRole('Coordinator', 'Volunteer')];

router.get('/insights', ...guard, asyncHandler(async (req, res) => {
  const [stock, waste] = await Promise.all([insights.lowStock(), insights.wasteByDonor(insights.parseDays(req.query.days, 90))]);
  res.status(200).json({ stock, waste });
}));

router.post('/insights/report', ...guard, asyncHandler(async (req, res) => {
  res.status(201).json({ report: await insights.generateReport(req.body ?? {}, req.user) });
}));

export default router;
