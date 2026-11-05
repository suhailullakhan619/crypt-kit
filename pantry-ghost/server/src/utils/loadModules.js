import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Imports the default export of every `*.js` file (tests excluded) in `dir`, sorted by name.
 * A missing directory yields []. Used by the extension-point loaders (Req 16.5).
 * @param {string} dir - absolute path
 * @returns {Promise<Array<{ file: string, value: any }>>}
 */
export async function loadModules(dir) {
  let files;
  try {
    files = await readdir(dir);
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  const out = [];
  for (const f of files.filter((x) => x.endsWith('.js') && !x.includes('.test.')).sort()) {
    const mod = await import(pathToFileURL(path.join(dir, f)).href);
    if (mod.default === undefined) throw new Error(`${path.join(dir, f)} must have a default export`);
    out.push({ file: f, value: mod.default });
  }
  return out;
}
