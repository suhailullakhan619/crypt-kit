/**
 * `npm run seed` — seeds the database named by MONGODB_URI (idempotent).
 * In DEMO_MODE the server seeds itself on boot, so this is for real databases.
 */
import { getEnv, EnvError } from '../config/env.js';
import { connectDB, disconnectDB } from '../config/db.js';
import { loadResources } from '../core/registry.js';
import { setContext } from '../context.js';
import config from '../../crypt.config.js';
import { runSeed } from './index.js';

try {
  const env = getEnv();
  if (env.DEMO_MODE) {
    console.log('DEMO_MODE=true: the server seeds its database automatically on boot. Nothing to do.');
    process.exit(0);
  }
  await connectDB(env);
  const registry = await loadResources();
  setContext({ env, config, registry, intents: [] });
  await runSeed(registry, { log: console.log });
  await disconnectDB();
} catch (err) {
  console.error(err instanceof EnvError ? `✖ Configuration error: ${err.message}` : err);
  process.exit(1);
}
