import { listRecords, getRecord } from '../api/resources';

const OBJECT_ID = /^[0-9a-f]{24}$/i;

/**
 * Works out what a scanned or typed value means:
 *  - `{ kind: 'code', code }`   an item ID (SL-0001), also from a `/scan/<id>` link of any address
 *  - `{ kind: 'path', path }`   another link inside this portal (opened directly)
 *  - `{ kind: 'foreign', url }` a link to some other website (never opened automatically)
 *  - `{ kind: 'empty' }`
 * @param {string} text
 * @param {string} origin this portal's address, e.g. window.location.origin
 */
export function parseScan(text, origin) {
  const value = String(text ?? '').trim();
  if (!value) return { kind: 'empty' };
  let url = null;
  try { url = new URL(value, value.startsWith('/') ? origin : undefined); } catch { /* not a link */ }
  if (url && /^https?:$/.test(url.protocol)) {
    const m = url.pathname.match(/^\/scan\/([^/?#]+)\/?$/);
    // Labels printed from another copy of this portal (e.g. the live site) still carry a usable ID.
    if (m) return { kind: 'code', code: decodeURIComponent(m[1]).trim() };
    if (url.origin === origin) return { kind: 'path', path: `${url.pathname}${url.search}` };
    return { kind: 'foreign', url: value };
  }
  return { kind: 'code', code: value };
}

/**
 * Finds the record an ID belongs to, across every resource configured in qrCodes.js.
 * Matches the ID field exactly (ignoring case); a 24-character database id also works.
 * @returns {Promise<{ key: string, item: object } | null>}
 */
export async function findByCode(api, allCodes, code, canRead = () => true) {
  const wanted = String(code).trim();
  if (!wanted) return null;
  // Only look in resources this user may read (no "permission denied" noise for the rest).
  const qrCodes = Object.fromEntries(Object.entries(allCodes).filter(([key]) => canRead(key)));
  for (const [key, cfg] of Object.entries(qrCodes)) {
    if (cfg.idField) {
      const page = await listRecords(api, key, { q: wanted, limit: 20 }).catch(() => null);
      const hit = page?.items?.find((i) => String(i[cfg.idField] ?? '').toLowerCase() === wanted.toLowerCase());
      if (hit) return { key, item: hit };
    }
  }
  if (OBJECT_ID.test(wanted)) {
    for (const key of Object.keys(qrCodes)) {
      const item = await getRecord(api, key, wanted).catch(() => null);
      if (item) return { key, item };
    }
  }
  return null;
}
