import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadModules } from '../utils/loadModules.js';
import { builtinIntents } from './builtinIntents.js';
import { normaliseUtterance } from './utterance.js';

export { normaliseUtterance };

const APP_INTENTS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../intents');

/**
 * Pure intent parser (Req 11.3). First matching intent wins; app intents come first.
 * @param {string} text
 * @param {Array<{ name: string, match: (t: string) => object|null }>} intents
 * @returns {{ intent: string, params: object, entry: object|null }}
 */
export function parseIntent(text, intents) {
  const t = normaliseUtterance(text);
  if (t) {
    for (const entry of intents) {
      const params = entry.match(t);
      if (params) return { intent: entry.name, params, entry };
    }
  }
  return { intent: 'UNKNOWN', params: {}, entry: null };
}

/** Validates an app intent's shape. */
function assertIntent(i, file) {
  for (const k of ['name', 'match', 'handle', 'respond']) {
    if (!i?.[k]) throw new Error(`intents/${file}: intent is missing "${k}"`);
  }
  if (i.aggregateOnly && !Array.isArray(i.requires)) throw new Error(`intents/${file}: aggregateOnly intents need "requires"`);
}

/**
 * Loads app intents from src/intents/*.js. A file default-exports an intent, an array of
 * intents, or a function `(registry) => intent | intent[]`.
 */
export async function loadAppIntents(registry, dir = APP_INTENTS_DIR) {
  const out = [];
  for (const { file, value } of await loadModules(dir)) {
    const v = typeof value === 'function' ? await value(registry) : value;
    for (const i of Array.isArray(v) ? v : [v]) {
      assertIntent(i, file);
      out.push(i);
    }
  }
  return out;
}

/**
 * Ordered registry: app intents first, then built-ins (Req 11.2).
 */
export async function buildIntents(registry, { appIntents } = {}) {
  const app = appIntents ?? (await loadAppIntents(registry));
  return [...app, ...builtinIntents(registry)];
}
