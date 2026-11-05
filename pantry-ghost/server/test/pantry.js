import zlib from 'node:zlib';
import jwt from 'jsonwebtoken';
import { startDb } from './db.js';
import { TEST_SECRET } from './helpers.js';
import { createApp } from '../src/app.js';
import { buildIntents } from '../src/core/intentRegistry.js';
import User from '../src/models/User.js';
import donors from '../src/resources/donors.js';
import stockLots from '../src/resources/stock-lots.js';
import households from '../src/resources/households.js';
import distributions from '../src/resources/distributions.js';

export const RESOURCES = [donors, stockLots, households, distributions];
export { donors, stockLots, households, distributions };

/**
 * In-memory replica set + the four Pantry Ghost resources + app intents + the Express app.
 * @returns {Promise<{ db: object, app: import('express').Express }>}
 */
export async function startPantry() {
  const db = await startDb(RESOURCES);
  db.ctx.intents = await buildIntents(db.registry);
  const app = await createApp();
  return { db, app };
}

/** A real user of `role` plus a signed token for it. */
export async function userWithToken(role, name = role) {
  const u = await User.create({ name, email: `${role.toLowerCase()}-${Date.now()}-${Math.random()}@pantry.test`, role, passwordHash: 'x' });
  const actor = { userId: String(u._id), role, name };
  return { actor, token: jwt.sign(actor, TEST_SECRET, { expiresIn: '1h' }) };
}

/**
 * Extracts the text drawn on a PDFKit document: inflates every FlateDecode stream and decodes the
 * hex / literal strings of TJ and Tj operators (PDFKit writes WinAnsi-encoded hex strings).
 * @param {Buffer} pdf
 * @returns {string}
 */
export function pdfText(pdf) {
  const raw = pdf.toString('latin1');
  const out = [];
  const re = /stream\r?\n/g;
  let m;
  while ((m = re.exec(raw))) {
    const start = m.index + m[0].length;
    const end = raw.indexOf('endstream', start);
    if (end < 0) break;
    const bytes = pdf.subarray(start, end);
    let content;
    try { content = zlib.inflateSync(bytes).toString('latin1'); } catch { content = bytes.toString('latin1'); }
    for (const op of content.matchAll(/\[(.*?)\]\s*TJ|(<[0-9a-fA-F]*>|\((?:\\.|[^\\)])*\))\s*Tj/gs)) {
      const body = op[1] ?? op[2];
      let line = '';
      for (const s of body.matchAll(/<([0-9a-fA-F]*)>|\(((?:\\.|[^\\)])*)\)/g)) {
        line += s[1] !== undefined ? Buffer.from(s[1], 'hex').toString('latin1') : s[2].replace(/\\(.)/g, '$1');
      }
      out.push(line);
    }
    re.lastIndex = end + 'endstream'.length; // don't re-match the "stream" inside "endstream"
  }
  return out.join('\n');
}

export const HOUSEHOLD_CODE = /H-\d{4}/;
