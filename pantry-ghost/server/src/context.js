/**
 * Process-wide runtime context assembled at boot by server.js (or by tests):
 *   { env, config, registry, intents }
 *
 * Kept in one place so services don't need long parameter chains, and tests can
 * swap in a fake context with setContext().
 */
let ctx = null;

export function setContext(next) {
  ctx = next;
}

export function getContext() {
  if (!ctx) throw new Error('Runtime context not initialised — call setContext() at boot');
  return ctx;
}
