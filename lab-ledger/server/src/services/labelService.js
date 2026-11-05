import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';

// A4 portrait, 3 × 8 grid of 70 × 37 mm labels (a standard 24-up sheet).
export const COLS = 3;
export const ROWS = 8;
export const PER_PAGE = COLS * ROWS;
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const LABEL_W = PAGE_W / COLS;
const LABEL_H = PAGE_H / ROWS;
const PAD = 9;
const INK = '#111827';
const MUTED = '#4b5563';
const GUIDE = '#d1d5db';

/** The URL a label's QR code opens: `<CLIENT_URL>/scan/<assetTag>` (lab-ledger Req 5.1). */
export function scanUrl(baseUrl, assetTag) {
  return `${String(baseUrl).replace(/\/+$/, '')}/scan/${encodeURIComponent(assetTag)}`;
}

/** Grid position of the i-th label: page index plus the label's top-left corner. */
export function labelSlot(i) {
  const page = Math.floor(i / PER_PAGE);
  const k = i % PER_PAGE;
  return { page, x: (k % COLS) * LABEL_W, y: Math.floor(k / COLS) * LABEL_H };
}

/** Draws a QR code as vector rectangles (one per horizontal run of dark modules). */
function drawQr(doc, text, x, y, size) {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const n = qr.modules.size;
  const quiet = 2;
  const cell = size / (n + quiet * 2);
  doc.save().rect(x, y, size, size).fill('#ffffff');
  doc.fillColor(INK);
  for (let r = 0; r < n; r += 1) {
    let c = 0;
    while (c < n) {
      if (!qr.modules.get(r, c)) { c += 1; continue; }
      const start = c;
      while (c < n && qr.modules.get(r, c)) c += 1;
      doc.rect(x + (quiet + start) * cell, y + (quiet + r) * cell, (c - start) * cell + 0.05, cell + 0.05);
    }
  }
  doc.fill(INK).restore();
}

function drawLabel(doc, item, x, y, baseUrl, appName) {
  // light cut guide
  doc.save().lineWidth(0.4).dash(2, { space: 2 }).strokeColor(GUIDE).rect(x + 2, y + 2, LABEL_W - 4, LABEL_H - 4).stroke().undash().restore();

  const qrSize = LABEL_H - PAD * 2;
  drawQr(doc, scanUrl(baseUrl, item.assetTag), x + PAD, y + PAD, qrSize);

  const tx = x + PAD + qrSize + 6;
  const tw = LABEL_W - (tx - x) - PAD;
  let ty = y + PAD + 2;
  doc.font('Helvetica').fontSize(6.5).fillColor(MUTED).text(appName.toUpperCase(), tx, ty, { width: tw, lineBreak: false });
  ty += 10;
  doc.font('Courier-Bold').fontSize(13).fillColor(INK).text(item.assetTag, tx, ty, { width: tw, lineBreak: false, ellipsis: true });
  ty += 17;
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(INK).text(item.name, tx, ty, { width: tw, height: 22, ellipsis: true });
  ty += 24;
  const lab = item.lab?.name ?? 'No lab';
  doc.font('Helvetica').fontSize(7.5).fillColor(MUTED).text(lab, tx, ty, { width: tw, height: 18, ellipsis: true });
  doc.font('Helvetica').fontSize(6).fillColor(MUTED).text('Scan to view or borrow', tx, y + LABEL_H - PAD - 7, { width: tw, lineBreak: false });
}

/**
 * Renders label sheets for `items` (lab-ledger Req 5.1): A4, 3 × 8 grid, each label with the QR code,
 * asset tag, name and lab.
 * @param {Array<{ name: string, assetTag: string, lab?: { name?: string } }>} items
 * @param {{ baseUrl: string, appName?: string }} opts
 * @returns {Promise<Buffer>} the PDF bytes
 */
export function renderLabels(items, { baseUrl, appName = 'Lab Ledger' }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0, autoFirstPage: false, info: { Title: `${appName} equipment labels`, Producer: appName } });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    try {
      items.forEach((item, i) => {
        const slot = labelSlot(i);
        if (i % PER_PAGE === 0) doc.addPage({ size: 'A4', margin: 0 });
        drawLabel(doc, item, slot.x, slot.y, baseUrl, appName);
      });
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
