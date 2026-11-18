import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/requireRole.js';
import * as donorReceipts from '../../services/donorReceiptService.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { getContext } from '../../context.js';

/**
 * Donor receipts: Coordinator and Volunteer only (the Board cannot read donors).
 *   GET  /api/donors/:id/receipt/preview?from=YYYY-MM-DD&to=YYYY-MM-DD → { receipt }
 *   POST /api/donors/:id/receipt { from, to }                           → 201 { report }
 */
const router = Router();
const guard = [authenticate, requireRole('Coordinator', 'Volunteer')];

router.get('/donors/:id/receipt/preview', ...guard, asyncHandler(async (req, res) => {
  res.status(200).json({ receipt: await donorReceipts.donations(req.params.id, req.query.from, req.query.to) });
}));

router.post('/donors/:id/receipt', ...guard, asyncHandler(async (req, res) => {
  const organization = getContext().config.reports?.organization;
  const report = await donorReceipts.generate(req.params.id, req.body ?? {}, req.user, { organization });
  res.status(201).json({ report });
}));

export default router;
