import zlib from 'node:zlib';

/**
 * Every fill and stroke colour a PDF sets in its content streams, as `#rrggbb`. Used to prove a
 * report is drawn in its portal's colours.
 * @param {Buffer} pdf
 * @returns {Set<string>}
 */
export function pdfColours(pdf) {
  const raw = pdf.toString('latin1');
  const out = new Set();
  const re = /stream\r?\n/g;
  let m;
  while ((m = re.exec(raw))) {
    const start = m.index + m[0].length;
    const end = raw.indexOf('endstream', start);
    if (end < 0) break;
    let content;
    try { content = zlib.inflateSync(pdf.subarray(start, end)).toString('latin1'); } catch { content = raw.slice(start, end); }
    // PDFKit sets colours with `cs`/`CS` + `scn`/`SCN`; plain `rg`/`RG` is accepted too.
    for (const c of content.matchAll(/([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+(scn|SCN|rg|RG)\b/g)) {
      out.add(`#${[c[1], c[2], c[3]].map((v) => Math.round(Number(v) * 255).toString(16).padStart(2, '0')).join('')}`);
    }
    re.lastIndex = end + 9;
  }
  return out;
}
