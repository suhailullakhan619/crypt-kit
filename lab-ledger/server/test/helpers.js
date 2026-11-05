import { setContext } from '../src/context.js';
import { setEnvForTests, loadEnv } from '../src/config/env.js';
import config from '../crypt.config.js';

export const TEST_SECRET = 'test-secret-'.padEnd(48, 'x');

/**
 * Installs a deterministic runtime context for tests.
 * @param {object} [overrides] - merged into the context ({ registry, intents, ... })
 */
export function useTestContext(overrides = {}) {
  const env = { ...loadEnv({ DEMO_MODE: 'true', JWT_SECRET: TEST_SECRET }), ...(overrides.env ?? {}) };
  setEnvForTests(env);
  const ctx = { env, config, registry: null, intents: [], ...overrides, env };
  setContext(ctx);
  return ctx;
}
