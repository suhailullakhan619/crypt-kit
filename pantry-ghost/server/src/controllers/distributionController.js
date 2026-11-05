import * as distributionService from '../services/distributionService.js';
import asyncHandler from '../utils/asyncHandler.js';

/** POST /api/distributions/plan — { householdId, items } → 200 { household, lines, shortfalls } */
export const plan = asyncHandler(async (req, res) => {
  res.status(200).json(await distributionService.plan(req.body ?? {}));
});

/** POST /api/distributions — { householdId, lines } → 201 { distribution } · 409 { error, short } */
export const commit = asyncHandler(async (req, res) => {
  const distribution = await distributionService.commit(req.body ?? {}, req.user);
  res.status(201).json({ distribution });
});
