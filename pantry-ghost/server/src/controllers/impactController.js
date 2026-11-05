import * as impactService from '../services/impactService.js';
import asyncHandler from '../utils/asyncHandler.js';

/** POST /api/reports/impact — { month: 'YYYY-MM' } → 201 { report } */
export const generate = asyncHandler(async (req, res) => {
  const report = await impactService.generate(req.body?.month, req.user);
  res.status(201).json({ report });
});

/** GET /api/reports/impact/preview?month=YYYY-MM → 200 { impact } */
export const preview = asyncHandler(async (req, res) => {
  res.status(200).json({ impact: await impactService.preview(req.query.month) });
});
