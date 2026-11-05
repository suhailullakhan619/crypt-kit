import { getContext } from '../context.js';

/**
 * Looks up a Pantry Ghost resource in the runtime registry.
 *
 * App services never import resource definitions directly: models are resolved at call time, so
 * modules loaded by the skeleton at boot (routes/app, dashboard, intents, jobs) stay import-safe.
 * @param {'donors'|'stock-lots'|'households'|'distributions'} key
 * @returns {{ key: string, def: object, model: import('mongoose').Model }}
 */
export function resourceOf(key) {
  const r = getContext().registry?.get(key);
  if (!r) throw new Error(`Resource "${key}" is not registered`);
  return r;
}

export const modelOf = (key) => resourceOf(key).model;
