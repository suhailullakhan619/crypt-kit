import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isResourceRef } from './fieldTypes.js';

const DEFAULT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../resources');

/**
 * Creates a registry from already-defined resources.
 * @param {Array<{ key: string, def: object, model: any }>} resources
 * @throws {Error} on duplicate keys or refs to unknown resources (Req 4.5)
 */
export function createRegistry(resources) {
  const map = new Map();
  for (const r of resources) {
    if (map.has(r.key)) throw new Error(`Duplicate resource key "${r.key}"`);
    map.set(r.key, r);
  }
  for (const r of map.values()) {
    for (const [fname, f] of Object.entries(r.def.fields)) {
      if (f.type === 'ref' && isResourceRef(f.ref) && !map.has(f.ref)) {
        throw new Error(`Resource "${r.key}": field "${fname}" references unknown resource "${f.ref}"`);
      }
    }
  }

  return Object.freeze({
    get: (key) => map.get(key) ?? null,
    has: (key) => map.has(key),
    all: () => [...map.values()],
    keys: () => [...map.keys()],
    withDue: () => [...map.values()].filter((r) => r.def.due),
    /** Title field used when populating refs to this target. */
    titleFieldFor: (ref) => (isResourceRef(ref) ? map.get(ref)?.def.titleField ?? 'name' : 'name'),
  });
}

/**
 * Imports every `*.js` file (except tests) in the resources folder and builds the registry.
 * @param {string} [dir]
 */
export async function loadResources(dir = DEFAULT_DIR) {
  const files = (await readdir(dir)).filter((f) => f.endsWith('.js') && !f.includes('.test.')).sort();
  const resources = [];
  for (const f of files) {
    const mod = await import(pathToFileURL(path.join(dir, f)).href);
    if (!mod.default?.key) throw new Error(`${f} must default-export defineResource(...)`);
    resources.push(mod.default);
  }
  return createRegistry(resources);
}
