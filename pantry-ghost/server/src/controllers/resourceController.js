import * as resourceService from '../services/resourceService.js';
import * as activityService from '../services/activityService.js';
import asyncHandler from '../utils/asyncHandler.js';
import { httpError } from '../utils/httpError.js';
import { OBJECT_ID_RE } from '../core/fieldTypes.js';

/** GET /api/r/:key → 200 { items, total, page, pages } */
export const list = asyncHandler(async (req, res) => {
  res.status(200).json(await resourceService.list(req.resource, req.query, req.user));
});

/** POST /api/r/:key → 201 { item } */
export const create = asyncHandler(async (req, res) => {
  const item = await resourceService.create(req.resource, req.body, req.user);
  res.status(201).json({ item });
});

/** GET /api/r/:key/:id → 200 { item } */
export const get = asyncHandler(async (req, res) => {
  res.status(200).json({ item: await resourceService.get(req.resource, req.params.id) });
});

/** PATCH /api/r/:key/:id → 200 { item } */
export const update = asyncHandler(async (req, res) => {
  const item = await resourceService.update(req.resource, req.params.id, req.body, req.user);
  res.status(200).json({ item });
});

/** DELETE /api/r/:key/:id → 200 { item } (soft) or 204 (hard) */
export const remove = asyncHandler(async (req, res) => {
  const result = await resourceService.remove(req.resource, req.params.id, req.user);
  if (result.soft) return res.status(200).json({ item: result.item });
  return res.status(204).end();
});

/** GET /api/r/:key/:id/activity → 200 { items } newest first */
export const activity = asyncHandler(async (req, res) => {
  if (!OBJECT_ID_RE.test(req.params.id)) throw httpError(404, 'Record not found');
  res.status(200).json({ items: await activityService.forRecord(req.resource.key, req.params.id) });
});

/** GET /api/activity → 200 { items } latest 50 (Superuser) */
export const latestActivity = asyncHandler(async (_req, res) => {
  res.status(200).json({ items: await activityService.latest({ limit: 50 }) });
});
