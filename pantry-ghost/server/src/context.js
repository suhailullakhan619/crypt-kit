/**
 * Process-wide runtime context assembled at boot by server.js (or by tests):
 *   { env, config, registry, intents, clock? }
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

/**
 * Current time. Reads `ctx.clock()` when one is installed, so tests can inject a fixed time
 * (skeleton Req 16.11). Used by hooks, the sweeper, voice answers and the dashboard.
 * @returns {Date}
 */
export function now() {
  const t = ctx?.clock ? ctx.clock() : new Date();
  return t instanceof Date ? t : new Date(t);
}
