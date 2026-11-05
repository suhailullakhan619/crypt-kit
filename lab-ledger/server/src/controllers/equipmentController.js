import asyncHandler from '../utils/asyncHandler.js';
import * as equipmentService from '../services/equipmentService.js';

/** GET /api/equipment/by-tag/:tag → 200 { item, activeCheckout, pendingRequests } */
export const byTag = asyncHandler(async (req, res) => {
  res.status(200).json(await equipmentService.byTag(req.params.tag, req.user));
});

/** POST /api/equipment/labels — body { ids } → application/pdf */
export const labels = asyncHandler(async (req, res) => {
  const { buffer, count } = await equipmentService.labels(req.body?.ids);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="equipment-labels-${count}.pdf"`);
  res.status(200).send(buffer);
});
