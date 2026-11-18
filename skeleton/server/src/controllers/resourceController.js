import * as resourceService from '../services/resourceService.js';
import * as activityService from '../services/activityService.js';
import * as csvService from '../services/csvService.js';
import * as csvImportService from '../services/csvImportService.js';
import asyncHandler from '../utils/asyncHandler.js';
import { httpError } from '../utils/httpError.js';
import { OBJECT_ID_RE } from '../core/fieldTypes.js';

/** GET /api/r/:key → 200 { items, total, page, pages } */
export const list = asyncHandler(async (req, res) => {
  res.status(200).json(await resourceService.list(req.resource, req.query, req.user));
});

/** GET /api/r/:key/export → 200 text/csv attachment (same filters/search/sort as the list) */
export const exportCsv = asyncHandler(async (req, res) => {
  const { csv } = await csvService.exportCsv(req.resource, req.query, req.user);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${req.resource.key}.csv"`);
  res.status(200).send(csv);
});

/**
 * POST /api/r/:key/import  body { csv, dryRun? } → 200 report. `dryRun` defaults to true, so a
 * caller must pass `dryRun: false` explicitly to write anything.
 */
export const importCsv = asyncHandler(async (req, res) => {
  const { csv, dryRun } = req.body ?? {};
  if (typeof csv !== 'string' || !csv.trim()) throw httpError(400, 'Body must include a "csv" string');
  res.status(200).json(await csvImportService.importCsv(req.resource, csv, req.user, { dryRun: dryRun !== false }));
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
