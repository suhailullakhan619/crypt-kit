import asyncHandler from '../utils/asyncHandler.js';
import * as checkoutService from '../services/checkoutService.js';

/** POST /api/checkouts — body { equipmentId, dueBack, purpose } → 201 { checkout } */
export const request = asyncHandler(async (req, res) => {
  const checkout = await checkoutService.request(req.body ?? {}, req.user);
  res.status(201).json({ checkout });
});

/** POST /api/checkouts/:id/approve → 200 { checkout } */
export const approve = asyncHandler(async (req, res) => {
  res.status(200).json({ checkout: await checkoutService.approve(req.params.id, req.user) });
});

/** POST /api/checkouts/:id/reject — body { reason } → 200 { checkout } */
export const reject = asyncHandler(async (req, res) => {
  res.status(200).json({ checkout: await checkoutService.reject(req.params.id, req.body?.reason, req.user) });
});

/** POST /api/checkouts/:id/cancel → 200 { checkout } */
export const cancel = asyncHandler(async (req, res) => {
  res.status(200).json({ checkout: await checkoutService.cancel(req.params.id, req.user) });
});

/** POST /api/checkouts/:id/return — body { condition, notes } → 200 { checkout } */
export const returnItem = asyncHandler(async (req, res) => {
  res.status(200).json({ checkout: await checkoutService.returnItem(req.params.id, req.body ?? {}, req.user) });
});

/** GET /api/checkouts/mine?status&page&limit → 200 { items, total, page, pages } */
export const mine = asyncHandler(async (req, res) => {
  res.status(200).json(await checkoutService.mine(req.user, req.query));
});
