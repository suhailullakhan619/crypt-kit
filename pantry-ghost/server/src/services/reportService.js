import { mkdir, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { v4 as uuid } from 'uuid';
import Report from '../models/Report.js';
import { getContext } from '../context.js';
import { can } from '../core/permissions.js';
import { buildFilter, buildSort, populateSpecs } from './resourceService.js';
import { PdfBuilder } from '../utils/pdfGenerator.js';
import { httpError } from '../utils/httpError.js';
import { paginate, envelope } from '../utils/pagination.js';
import { OBJECT_ID_RE } from '../core/fieldTypes.js';

export const MAX_ROWS = 5000;
const humanise = (name) => name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
let reportDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../uploads/reports');

/** Test helper: write PDFs somewhere else. */
export function setReportDir(dir) {
  reportDir = dir;
}

function requireReadable(key, user) {
  const { registry, config } = getContext();
  const resource = registry?.get(key);
  if (!resource) throw httpError(400, `Unknown resource "${key}"`);
  if (!can(user.role, resource.def, 'read', config.roles)) throw httpError(403, 'Forbidden: insufficient permissions');
  return resource;
}

function cleanFilters(filters) {
  if (filters === undefined || filters === null) return {};
  if (typeof filters !== 'object' || Array.isArray(filters)) throw httpError(400, 'filters must be an object');
  return Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== '' && v !== null && v !== undefined));
}

/**
 * Renders a PDF via `render(doc, helpers)`, stores it and persists a Report record (Req 16.6).
 * Apps use this for custom reports (e.g. Pantry Ghost impact report).
 * @param {{ title: string, resource: string, filters?: object, user: { userId: string, name?: string }, count: number,
 *           render: (doc: PDFKit.PDFDocument, helpers: object) => (void|Promise<void>) }} opts
 * @returns {Promise<object>} the Report document (lean)
 */
export async function createReport({ title, resource, filters = {}, user, count, render }) {
  const { config } = getContext();
  const generatedAt = new Date();
  const builder = new PdfBuilder({
    appName: config.appName,
    title,
    userName: user.name,
    organization: config.reports?.organization,
    timeZone: config.reports?.timeZone ?? 'UTC',
    filters,
    generatedAt,
    count,
  });
  await render(builder.doc, builder.helpers);
  const buffer = await builder.finish();

  const fileName = `${uuid()}.pdf`;
  await mkdir(reportDir, { recursive: true });
  await writeFile(path.join(reportDir, fileName), buffer);

  const report = await Report.create({ title, resource, filters, count, fileName, generatedBy: user.userId, generatedAt });
  return report.toObject();
}

/**
 * Standard report: every record matching `filters` (max 5,000) in a table (Req 10.1, 10.2).
 * @param {{ resource: string, filters?: object, title?: string }} body
 * @param {{ userId: string, role: string, name?: string }} user
 * @throws {Error} 400 bad input, 403 no read permission
 */
export async function generate({ resource: key, filters, title } = {}, user) {
  if (typeof key !== 'string') throw httpError(400, 'resource is required');
  const resource = requireReadable(key, user);
  const { def, model } = resource;
  const { registry } = getContext();

  const f = cleanFilters(filters);
  const query = buildFilter(def, f);
  const t = typeof title === 'string' && title.trim() ? title.trim().slice(0, 120) : `${def.label} report`;

  const columnKeys = def.report?.columns ?? Object.entries(def.fields).filter(([, s]) => s.list && !s.secret).map(([n]) => n);
  const columns = columnKeys.map((k) => ({ key: k, label: def.fields[k].label ?? humanise(k), type: def.fields[k].type }));

  // Exception-style column: how long each overdue record has been past its due date.
  if (def.due) {
    const now = Date.now();
    const { field, status, to } = def.due;
    columns.push({
      key: '__overdueBy',
      label: 'Overdue By',
      type: 'duration',
      value: (row) => (row[status] === to && row[field] ? now - new Date(row[field]).getTime() : null),
    });
  }

  let q = model.find(query).sort(buildSort(def)).limit(MAX_ROWS);
  for (const p of populateSpecs(def, registry)) q = q.populate(p);
  const rows = await q.lean();

  return createReport({
    title: t,
    resource: key,
    filters: f,
    user,
    count: rows.length,
    render: (_doc, h) => h.table(columns, rows),
  });
}

/**
 * Reports for resources the user can read, newest first (Req 10.4).
 */
export async function list(query, user) {
  const { registry, config } = getContext();
  const readable = (registry?.all() ?? []).filter((r) => can(user.role, r.def, 'read', config.roles)).map((r) => r.key);
  const pg = paginate(query);
  const filter = { resource: { $in: readable } };
  const [items, total] = await Promise.all([
    Report.find(filter).sort({ generatedAt: -1, _id: -1 }).skip(pg.skip).limit(pg.limit).populate('generatedBy', 'name').lean(),
    Report.countDocuments(filter),
  ]);
  return envelope(items, total, pg);
}

/**
 * Resolves the PDF path for download (Req 10.4, 10.5).
 * @returns {Promise<{ filePath: string, report: object }>}
 * @throws {Error} 404 unknown, 403 no permission, 410 file missing
 */
export async function download(id, user) {
  if (!OBJECT_ID_RE.test(String(id))) throw httpError(404, 'Report not found');
  const report = await Report.findById(id).lean();
  if (!report) throw httpError(404, 'Report not found');
  requireReadable(report.resource, user);
  const filePath = path.join(reportDir, path.basename(report.fileName));
  try {
    await access(filePath);
  } catch {
    throw httpError(410, 'The PDF file for this report is gone — please generate it again');
  }
  return { filePath, report };
}
