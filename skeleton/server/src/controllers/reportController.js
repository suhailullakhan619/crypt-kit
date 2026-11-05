import * as reportService from '../services/reportService.js';
import asyncHandler from '../utils/asyncHandler.js';

/** POST /api/reports — body { resource, filters, title } → 201 { report } */
export const generate = asyncHandler(async (req, res) => {
  const report = await reportService.generate(req.body ?? {}, req.user);
  res.status(201).json({ report });
});

/** GET /api/reports?page&limit → 200 { items, total, page, pages } */
export const list = asyncHandler(async (req, res) => {
  res.status(200).json(await reportService.list(req.query, req.user));
});

/** GET /api/reports/:id/download → application/pdf */
export const download = asyncHandler(async (req, res) => {
  const { filePath, report } = await reportService.download(req.params.id, req.user);
  const safeTitle = report.title.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'report';
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}.pdf"`);
  res.sendFile(filePath);
});
