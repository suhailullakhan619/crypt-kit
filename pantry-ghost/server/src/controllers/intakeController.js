import * as intakeService from '../services/intakeService.js';
import asyncHandler from '../utils/asyncHandler.js';

/** POST /api/intake/parse — { text } → 200 { draft } (never saves) */
export const parse = asyncHandler(async (req, res) => {
  res.status(200).json(await intakeService.parse(req.body?.text));
});

/** POST /api/intake — { lots: [...] } → 201 { items } */
export const save = asyncHandler(async (req, res) => {
  const items = await intakeService.save(req.body ?? {}, req.user);
  res.status(201).json({ items });
});
