import { absoluteUrl } from './RecordQrCard';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const MAX_LABELS = 120;

/**
 * Builds the HTML of an A4 label sheet: 3 × 8 labels per page (a standard 24-up sheet), each with
 * the QR code, the item name and its ID. Pure, so it can be tested without a printer.
 * @param {{ appName: string, labels: Array<{ title: string, caption?: string, svg: string }> }} opts
 */
export function labelSheetHtml({ appName, labels }) {
  const cells = labels.map((l) => `<div class="l"><div class="q">${l.svg}</div><div class="t"><div class="a">${esc(appName)}</div>`
    + `${l.caption ? `<div class="c">${esc(l.caption)}</div>` : ''}<div class="n">${esc(l.title)}</div><div class="s">Scan to open</div></div></div>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(appName)} QR labels</title><style>
@page{size:A4;margin:0}*{box-sizing:border-box}body{margin:0;font-family:Arial,Helvetica,sans-serif;color:#111827}
.sheet{display:grid;grid-template-columns:repeat(3,70mm);grid-auto-rows:37.125mm;width:210mm}
.l{display:flex;gap:2.5mm;align-items:center;padding:3mm;border:0.2mm dashed #d1d5db;overflow:hidden;break-inside:avoid}
.q{flex:0 0 29mm;height:29mm}.q svg{width:29mm;height:29mm}.t{min-width:0;display:flex;flex-direction:column;gap:0.8mm}
.a{font-size:6pt;letter-spacing:.06em;color:#4b5563;text-transform:uppercase}.c{font-family:'Courier New',monospace;font-weight:700;font-size:11pt}
.n{font-size:8pt;font-weight:700;line-height:1.15;max-height:3.4em;overflow:hidden}.s{font-size:5.5pt;color:#6b7280}
@media print{.l{border-color:#eee}}</style></head><body><div class="sheet">${cells}</div>
<script>window.onload=function(){window.focus();window.print()}</script></body></html>`;
}

/**
 * Opens a printable QR label sheet for `items` (rows of a list page), using qrCodes.js to know
 * where each code leads. Returns a message for the toast.
 */
export async function printLabelSheet({ items, config, appName, titleOf }) {
  if (!items.length) throw new Error('Select at least one row first');
  if (items.length > MAX_LABELS) throw new Error(`Select at most ${MAX_LABELS} items per sheet`);
  const win = window.open('', '_blank');
  if (!win) throw new Error('Allow pop-ups for this site to print labels');
  const QR = await import('qrcode');
  const labels = await Promise.all(items.map(async (item) => {
    const { path, caption } = config.target(item);
    const svg = await QR.toString(absoluteUrl(path), { type: 'svg', errorCorrectionLevel: 'M', margin: 2, color: { dark: '#111827', light: '#ffffff' } });
    return { svg, caption, title: titleOf(item) };
  }));
  win.document.write(labelSheetHtml({ appName, labels }));
  win.document.close();
  return `Label sheet for ${items.length} item${items.length === 1 ? '' : 's'} opened. Print it on A4 (24 labels per page).`;
}
