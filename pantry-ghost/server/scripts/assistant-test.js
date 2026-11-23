/**
 * Checks the optional Bedrock chat assistant before you rely on it:
 *
 *   npm run assistant:test
 *   npm run assistant:test -- "what needs my attention"
 *
 * 1. reads BEDROCK_MODEL_ID / AWS_REGION from server/.env (credentials come from the usual AWS sources),
 * 2. makes one tiny model call (proves model ID, region, model access and credentials),
 * 3. asks a real question against an in-memory copy of the demo data, so you see the assistant call its
 *    read-only tools and answer from records.
 * It never prints credentials, and it never touches your real database.
 */
import { getEnv, EnvError } from '../src/config/env.js';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { setContext } from '../src/context.js';
import { loadResources } from '../src/core/registry.js';
import { buildIntents } from '../src/core/intentRegistry.js';
import { runSeed } from '../src/seed/index.js';
import { askAssistant, explainAwsError, pingModel } from '../src/services/assistantService.js';
import config from '../crypt.config.js';

const question = process.argv.slice(2).join(' ').trim() || 'Give me a short rundown of anything urgent, and who it belongs to.';
const fail = (title, action) => {
  console.error(`\n✖ ${title}\n  → ${action}`);
  process.exitCode = 1;
};
const step = (text) => console.log(`\n${text}`);

let env;
try {
  env = getEnv();
} catch (err) {
  fail('The server configuration is not valid', err instanceof EnvError ? err.message : String(err));
  process.exit(1);
}

if (!env.ASSISTANT) {
  console.error('✖ The assistant is off: BEDROCK_MODEL_ID is not set.');
  console.error('  Add to server/.env (keep it out of git):');
  console.error('    BEDROCK_MODEL_ID=<model or inference-profile ID from the Bedrock console>');
  console.error('    AWS_REGION=us-east-1');
  console.error('    AWS_ACCESS_KEY_ID=...   AWS_SECRET_ACCESS_KEY=...');
  console.error('  See docs/BEDROCK.md.');
  process.exit(1);
}

const { modelId, region } = env.ASSISTANT;
console.log(`Model:  ${modelId}\nRegion: ${region}\nKeys:   ${process.env.AWS_ACCESS_KEY_ID ? `access key ${process.env.AWS_ACCESS_KEY_ID.slice(0, 4)}… found in the environment` : process.env.AWS_PROFILE ? `profile ${process.env.AWS_PROFILE}` : 'none in the environment (a role or the default profile will be tried)'}`);

step('1/2  Calling the model …');
try {
  const reply = await pingModel(env.ASSISTANT);
  console.log(`✔ The model answered: "${reply.slice(0, 60)}"`);
} catch (err) {
  const { title, action } = explainAwsError(err);
  fail(title, action);
  process.exit(1);
}

step('2/2  Asking a real question against demo data (in memory, nothing is saved) …');
try {
  const demoEnv = Object.freeze({ ...env, DEMO_MODE: true, MONGODB_URI: null, MONGODB_DB_NAME: null });
  await connectDB(demoEnv);
  const registry = await loadResources();
  setContext({ env: demoEnv, config, registry, intents: [] });
  await runSeed(registry, { log: () => {} });
  const intents = await buildIntents(registry);
  setContext({ env: demoEnv, config, registry, intents });
  const user = { userId: '000000000000000000000000', role: config.roles[0], name: 'Assistant check' };
  console.log(`  Question: "${question}"`);
  const started = Date.now();
  const res = await askAssistant(question, user, { env: demoEnv, config, registry, intents, now: new Date(), tz: 0 });
  if (!res) {
    fail('The model answered the ping but not the question', 'Run it again; if it repeats, the tool-use call failed: check the server log above and that this model supports tool use on Bedrock (the Converse API).');
  } else {
    console.log(`\n  ${res.answer}\n`);
    console.log(`✔ Answered in ${((Date.now() - started) / 1000).toFixed(1)}s using ${res.data?.items?.length ?? 0} record(s) from the demo data.`);
  }
} catch (err) {
  const { title, action } = explainAwsError(err);
  fail(title, action);
} finally {
  await disconnectDB().catch(() => {});
}

if (!process.exitCode) console.log('\nAll good. Set the same BEDROCK_MODEL_ID, AWS_REGION and AWS keys on your host (Render) and the live chat will use it for questions the built-in parser cannot read.');
process.exit(process.exitCode ?? 0);
