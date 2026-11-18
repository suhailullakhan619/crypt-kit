import PDFDocument from 'pdfkit';
import { resolvePdfTheme } from './pdfTheme.js';

// ── Look & feel: clean corporate grid (A4 landscape) ─────────────────────────
const MARGIN = 28;
const FONT = 7.6;
const PAD_X = 4;
const PAD_Y = 4;
const SERIAL_W = 26;

// ── Formatting ───────────────────────────────────────────────────────────────

function parts(date, timeZone) {
  const f = new Intl.DateTimeFormat('en-GB', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  return Object.fromEntries(f.formatToParts(date).map((p) => [p.type, p.value]));
}

/** 04-11-2026 */
export function formatDate(value, timeZone = 'UTC') {
  const p = parts(new Date(value), timeZone);
  return `${p.day}-${p.month}-${p.year}`;
}

/** 04-11-2026 22:00 */
export function formatDateTime(value, timeZone = 'UTC') {
  const p = parts(new Date(value), timeZone);
  return `${p.day}-${p.month}-${p.year} ${p.hour}:${p.minute}`;
}

/** 193d 23h 26m · 4h 56m · 0m */
export function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const total = Math.floor(ms / 60000);
  const d = Math.floor(total / 1440);
  const h = Math.floor((total % 1440) / 60);
  const m = total % 60;
  return [d ? `${d}d` : '', d || h ? `${h}h` : '', `${m}m`].filter(Boolean).join(' ');
}

const isMidnightUtc = (d) => d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0;

/** Formats one cell value for print. */
export function formatCell(value, type, { timeZone = 'UTC' } = {}) {
  if (value === null || value === undefined || value === '') return '—';
  if (Array.isArray(value)) return value.length ? value.map((v) => formatCell(v, type, { timeZone })).join(', ') : '—';
  if (type === 'duration') return formatDuration(value);
  if (type === 'date' || type === 'datetime' || value instanceof Date) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return type === 'date' || (type !== 'datetime' && isMidnightUtc(d)) ? formatDate(d, timeZone) : formatDateTime(d, timeZone);
  }
  if (type === 'boolean' || typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') return String(value.name ?? value.title ?? value.code ?? value._id ?? '—');
  return String(value);
}

// ── Builder ──────────────────────────────────────────────────────────────────

/**
 * PDF builder over PDFKit. First page: title, "Generated on", a meta line
 * (Organization | filters | Total Records). Every page: footer "<APP> - <TITLE>" and "Page x of y".
 * Helpers for custom reports: heading, kv, text, table (grid, repeats header per page), barChart.
 */
export class PdfBuilder {
  /**
   * @param {{ appName: string, title: string, userName?: string, organization?: string, filters?: object,
   *           generatedAt?: Date, count?: number, timeZone?: string, theme?: object }} opts
   */
  constructor({ appName, title, userName, organization, filters = {}, generatedAt = new Date(), count, timeZone = 'UTC', theme }) {
    this.appName = appName;
    // Colours of the portal this report comes from (crypt.config.js reports.theme).
    this.theme = resolvePdfTheme(theme);
    this.title = title;
    this.timeZone = timeZone;
    this.doc = new PDFDocument({
      size: 'A4', layout: 'landscape', margins: { top: MARGIN, left: MARGIN, right: MARGIN, bottom: MARGIN + 18 },
      bufferPages: true, info: { Title: title, Author: appName },
    });
    this.chunks = [];
    this.doc.on('data', (c) => this.chunks.push(c));
    this.done = new Promise((resolve) => this.doc.on('end', () => resolve(Buffer.concat(this.chunks))));
    this.width = this.doc.page.width - MARGIN * 2;
    this.drawTitle({ userName, organization, filters, generatedAt, count });
    this.helpers = {
      heading: (t) => this.heading(t),
      kv: (pairs) => this.kv(pairs),
      table: (cols, rows, opts) => this.table(cols, rows, opts),
      barChart: (data, opts) => this.barChart(data, opts),
      text: (t, opts) => this.doc.font('Helvetica').fontSize(9).fillColor(this.theme.ink).text(t, MARGIN, this.doc.y, { width: this.width, ...opts }),
      formatDuration,
    };
  }

  get bottomLimit() {
    return this.doc.page.height - this.doc.page.margins.bottom;
  }

  drawTitle({ userName, organization, filters, generatedAt, count }) {
    const { doc } = this;
    const top = MARGIN;
    doc.font('Helvetica').fontSize(8).fillColor(this.theme.muted)
      .text(`Generated on: ${formatDateTime(generatedAt, this.timeZone)}`, MARGIN, top + 4, { width: this.width, align: 'right' });
    doc.font('Helvetica-Bold').fontSize(16).fillColor(this.theme.primary)
      .text(this.title.toUpperCase(), MARGIN, top, { width: this.width * 0.72 });

    const meta = [];
    if (organization) meta.push(`Organization: ${organization}`);
    for (const [k, v] of Object.entries(filters ?? {})) {
      if (v === '' || v === null || v === undefined) continue;
      const label = k.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
      meta.push(`${label}: ${String(v).replace(/([a-z])([A-Z])/g, '$1 $2').toUpperCase()}`);
    }
    if (userName) meta.push(`Generated by: ${userName}`);
    if (count !== undefined) meta.push(`Total Records: ${count}`);

    doc.font('Helvetica').fontSize(8.5).fillColor(this.theme.ink)
      .text(meta.join('   |   '), MARGIN, doc.y + 3, { width: this.width });
    doc.y += 8;
  }

  /** Starts a new page if `h` points don't fit. Returns true when a page was added. */
  ensureSpace(h) {
    if (this.doc.y + h > this.bottomLimit) {
      this.doc.addPage();
      this.doc.y = MARGIN;
      return true;
    }
    return false;
  }

  heading(text) {
    this.ensureSpace(30);
    this.doc.moveDown(0.6).font('Helvetica-Bold').fontSize(11).fillColor(this.theme.primary).text(text.toUpperCase(), MARGIN, this.doc.y, { width: this.width });
    this.doc.moveDown(0.3);
  }

  kv(pairs) {
    const { doc } = this;
    for (const [k, v] of pairs) {
      this.ensureSpace(14);
      const y = doc.y;
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(this.theme.muted).text(k, MARGIN, y, { width: 140 });
      doc.font('Helvetica').fontSize(8.5).fillColor(this.theme.ink).text(String(v), MARGIN + 145, y, { width: this.width - 145 });
      doc.y = Math.max(doc.y, y + 12);
    }
  }

  /**
   * Column widths from measured text: every column first gets room for its longest word
   * (so codes like "WO-1201" never break), then leftover space is shared by average text width.
   * A column's `width` option is a relative weight that overrides the measured preference.
   */
  columnWidths(columns, cellsByRow, serial) {
    const { doc } = this;
    const avail = this.width - (serial ? SERIAL_W : 0);
    const sample = cellsByRow.slice(0, 200);
    const measure = (s, bold = false) => doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(FONT).widthOfString(s);
    const longestWordW = (s, bold) => Math.max(0, ...String(s).split(/\s+/).map((w) => measure(w, bold)));
    const MAX_WORD = measure('M'.repeat(14));

    // Dates, date-times and durations are kept on one line; other text may wrap between words.
    const noWrap = (c) => ['date', 'datetime', 'duration'].includes(c.type);
    const mins = columns.map((c, i) => {
      const cellMin = sample.map((cells) => (noWrap(c) ? measure(cells[i].text) : longestWordW(cells[i].text)));
      return Math.min(noWrap(c) ? MAX_WORD * 1.6 : MAX_WORD, Math.max(longestWordW(c.label, true), ...cellMin)) + PAD_X * 2 + 1;
    });
    const prefs = columns.map((c, i) => {
      if (c.width) return c.width * 10;
      const ws = sample.map((cells) => Math.min(measure(cells[i].text), MAX_WORD * 2.2));
      return ws.length ? ws.reduce((a, b) => a + b, 0) / ws.length : 0;
    });

    const minSum = mins.reduce((a, b) => a + b, 0);
    if (minSum >= avail) return mins.map((m) => (m / minSum) * avail);
    const extra = avail - minSum;
    const prefSum = prefs.reduce((a, b) => a + b, 0) || 1;
    return mins.map((m, i) => m + (prefs[i] / prefSum) * extra);
  }

  /**
   * Grid table: header band in the theme's primary colour (repeated on each page), bordered cells, zebra rows, optional
   * "Sl No" column, wrapped text, and per-column links rendered under the value.
   *
   * @param {Array<{ key: string, label: string, type?: string, width?: number,
   *                 value?: (row: object) => any, link?: (row: object) => string|null, linkLabel?: string }>} columns
   * @param {object[]} rows
   * @param {{ serial?: boolean, emptyText?: string }} [opts]
   */
  table(columns, rows, { serial = true, emptyText = 'No records matched these filters.' } = {}) {
    const { doc } = this;
    if (!columns.length) return;
    doc.font('Helvetica').fontSize(FONT);

    const cellsByRow = rows.map((row) =>
      columns.map((c) => {
        const raw = c.value ? c.value(row) : row[c.key];
        const url = c.link ? c.link(row) : null;
        return { text: formatCell(raw, c.type, { timeZone: this.timeZone }), url, linkLabel: c.linkLabel ?? 'Open link' };
      })
    );
    const widths = this.columnWidths(columns, cellsByRow, serial);
    const allCols = serial ? [{ label: 'Sl No', w: SERIAL_W, center: true }, ...columns.map((c, i) => ({ label: c.label, w: widths[i] }))] : columns.map((c, i) => ({ label: c.label, w: widths[i] }));

    const textH = (t, w, bold = false) => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(FONT);
      return doc.heightOfString(t, { width: w - PAD_X * 2 });
    };

    const drawRowCells = (cells, y, h, { header = false, zebra = false } = {}) => {
      let x = MARGIN;
      if (header) doc.rect(MARGIN, y, this.width, h).fill(this.theme.primary);
      else if (zebra) doc.rect(MARGIN, y, this.width, h).fill(this.theme.zebra);
      allCols.forEach((col, i) => {
        const cell = cells[i];
        const w = col.w - PAD_X * 2;
        doc.font(header ? 'Helvetica-Bold' : 'Helvetica').fontSize(FONT).fillColor(header ? this.theme.primaryForeground : this.theme.ink)
          .text(cell.text, x + PAD_X, y + PAD_Y, { width: w, align: col.center && !header ? 'center' : 'left' });
        if (!header && cell.url) {
          doc.font('Helvetica').fontSize(FONT).fillColor(this.theme.link)
            .text(cell.linkLabel, x + PAD_X, doc.y, { width: w, link: cell.url, underline: true });
        }
        if (!header) doc.lineWidth(0.5).strokeColor(this.theme.border).rect(x, y, col.w, h).stroke();
        x += col.w;
      });
    };

    const headerCells = allCols.map((c) => ({ text: c.label }));
    const headerH = Math.max(...allCols.map((c) => textH(c.label, c.w, true))) + PAD_Y * 2;
    const drawHeader = () => {
      const y = doc.y;
      drawRowCells(headerCells, y, headerH, { header: true });
      doc.y = y + headerH;
    };

    this.ensureSpace(headerH + 24);
    drawHeader();

    if (!rows.length) {
      const y = doc.y;
      doc.lineWidth(0.5).strokeColor(this.theme.border).rect(MARGIN, y, this.width, 22).stroke();
      doc.font('Helvetica-Oblique').fontSize(8.5).fillColor(this.theme.muted).text(emptyText, MARGIN + PAD_X, y + 7, { width: this.width - PAD_X * 2, align: 'center' });
      doc.y = y + 22;
      return;
    }

    cellsByRow.forEach((cells, idx) => {
      const rowCells = serial ? [{ text: String(idx + 1) }, ...cells] : cells;
      const h = Math.max(
        16,
        ...allCols.map((col, i) => textH(rowCells[i].text, col.w) + (rowCells[i].url ? FONT * 1.3 : 0))
      ) + PAD_Y * 2;
      if (this.ensureSpace(h)) drawHeader();
      const y = doc.y;
      drawRowCells(rowCells, y, h, { zebra: idx % 2 === 1 });
      doc.y = y + h;
    });
    doc.x = MARGIN;
    doc.y += 6;
  }

  /** @param {Array<{ label: string, value: number }>} data */
  barChart(data, { title, height = 150 } = {}) {
    const { doc } = this;
    if (title) this.heading(title);
    this.ensureSpace(height + 30);
    const top = doc.y;
    const max = Math.max(1, ...data.map((d) => d.value));
    const slot = this.width / Math.max(1, data.length);
    const barW = Math.min(44, slot * 0.6);
    doc.moveTo(MARGIN, top + height).lineTo(MARGIN + this.width, top + height).strokeColor(this.theme.border).lineWidth(0.7).stroke();
    data.forEach((d, i) => {
      const h = (d.value / max) * (height - 16);
      const x = MARGIN + i * slot + (slot - barW) / 2;
      doc.rect(x, top + height - h, barW, h).fill(this.theme.primary);
      doc.font('Helvetica-Bold').fontSize(8).fillColor(this.theme.ink).text(String(d.value), x - 10, top + height - h - 11, { width: barW + 20, align: 'center' });
      doc.font('Helvetica').fontSize(7.5).fillColor(this.theme.muted).text(d.label, MARGIN + i * slot, top + height + 4, { width: slot, align: 'center' });
    });
    doc.y = top + height + 22;
    doc.x = MARGIN;
  }

  /** Adds "<APP> - <TITLE>" and "Page x of y" footers to every page and returns the PDF bytes. */
  async finish() {
    const { doc } = this;
    const range = doc.bufferedPageRange();
    const label = `${this.appName} - ${this.title}`.toUpperCase();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      // Thin bar in the portal's colour across the top of every page.
      doc.save().rect(0, 0, doc.page.width, 4).fill(this.theme.primary).restore();
      const bottom = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      const y = doc.page.height - MARGIN - 4;
      doc.font('Helvetica').fontSize(7).fillColor(this.theme.muted);
      doc.text(label, MARGIN, y, { width: this.width / 2, lineBreak: false });
      doc.text(`Page ${i - range.start + 1} of ${range.count}`, MARGIN + this.width / 2, y, { width: this.width / 2, align: 'right', lineBreak: false });
      doc.page.margins.bottom = bottom;
    }
    doc.end();
    return this.done;
  }
}

/**
 * Convenience: a standard tabular report.
 * @returns {Promise<Buffer>}
 */
export async function renderReport({ appName, title, userName, organization, filters, columns, rows, generatedAt, timeZone, theme }) {
  const b = new PdfBuilder({ appName, title, userName, organization, filters, generatedAt, count: rows.length, timeZone, theme });
  b.table(columns, rows);
  return b.finish();
}
