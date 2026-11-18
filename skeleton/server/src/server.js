import { getEnv, EnvError } from './config/env.js';
import { connectDB } from './config/db.js';
import { setContext } from './context.js';
import { createApp } from './app.js';
import { runSeed } from './seed/index.js';
import { loadResources } from './core/registry.js';
import { startJobs } from './jobs/index.js';
import { buildIntents } from './core/intentRegistry.js';
import config from '../crypt.config.js';

/**
 * Boot sequence (design § Boot Sequence):
 *  1. validate env  2. connect DB (memory replica set in DEMO_MODE)
 *  3. load resources  4. build intents  5. seed (DEMO_MODE)  6. start jobs  7. listen
 */
async function main() {
  let env;
  try {
    env = getEnv();
  } catch (err) {
    if (err instanceof EnvError) {
      console.error(`✖ Configuration error: ${err.message}`);
      process.exit(1);
    }
    throw err;
  }

  const uri = await connectDB(env);
  console.log(`🪦 MongoDB connected: ${env.DEMO_MODE && !env.MONGODB_URI ? 'in-memory (demo mode)' : uri}`);

  const registry = await loadResources();
  console.log(`📜 Resources: ${registry.keys().join(', ') || '(none)'}`);
  const intents = await buildIntents(registry);
  console.log(`🔮 Voice intents: ${intents.length}`);
  setContext({ env, config, registry, intents });

  if (env.DEMO_MODE || env.SEED_ON_BOOT) {
    await runSeed(registry, { log: (m) => console.log(m) });
  }

  await startJobs({ registry });

  const app = await createApp();
  app.listen(env.PORT, () => {
    console.log(`🦴 ${config.appName} API listening on http://localhost:${env.PORT}  (voice: ${env.VOICE_PROVIDER})`);
  });
}

main().catch((err) => {
  console.error('✖ Failed to start:', err);
  process.exit(1);
});
