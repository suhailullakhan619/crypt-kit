import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import asyncHandler from '../utils/asyncHandler.js';
import { searchAll } from '../services/searchService.js';

const router = Router();

/** GET /api/search?q=text → 200 { results: [{ key, label, icon, items: [{ _id, title, subtitle }] }] } */
router.get('/', authenticate, asyncHandler(async (req, res) => {
  res.status(200).json({ results: await searchAll(req.query.q, req.user) });
}));

export default router;
