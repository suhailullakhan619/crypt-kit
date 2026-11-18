import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/requireRole.js';
import * as insights from '../../services/insightsService.js';
import asyncHandler from '../../utils/asyncHandler.js';

/**
 * Staff-only insights (they show borrower names):
 *   GET  /api/insights?usageDays=90&lateDays=180 → { utilization, late }
 *   POST /api/insights/report { usageDays, lateDays } → 201 { report }  (PDF)
 */
const router = Router();
const guard = [authenticate, requireRole('LabManager', 'Technician')];

router.get('/insights', ...guard, asyncHandler(async (req, res) => {
  const [utilization, late] = await Promise.all([
    insights.utilization(insights.parseDays(req.query.usageDays, 90)),
    insights.lateBorrowers(insights.parseDays(req.query.lateDays, 180)),
  ]);
  res.status(200).json({ utilization, late });
}));

router.post('/insights/report', ...guard, asyncHandler(async (req, res) => {
  res.status(201).json({ report: await insights.generateReport(req.body ?? {}, req.user) });
}));

export default router;
