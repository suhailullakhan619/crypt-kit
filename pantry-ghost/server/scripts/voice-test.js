/**
 * Checks Amazon Polly with the settings in server/.env: one short sentence is spoken and saved as
 * an mp3 in the temp folder, so you can listen to it. Nothing secret is printed.
 *
 *   npm run voice:test
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadEnv, setEnvForTests } from '../src/config/env.js';
import { speak, explainAwsError } from '../src/services/speechService.js';

let env;
try {
  env = loadEnv({ ...process.env, VOICE_PROVIDER: 'polly' });
} catch (err) {
  console.error(`x ${err.message}`);
  process.exit(1);
}
setEnvForTests(env);
const { voiceId, engine, region } = env.POLLY;
console.log(`Asking Amazon Polly (voice ${voiceId}, ${engine}, ${region}) to speak one sentence ...`);
try {
  const audio = await speak('Hello. This is the Crypt Kit assistant, speaking through Amazon Polly.');
  const file = path.join(os.tmpdir(), 'crypt-kit-polly-test.mp3');
  fs.writeFileSync(file, audio);
  console.log(`ok  Polly answered with ${audio.length} bytes of audio.`);
  console.log(`    Saved to ${file}. Open it to listen.`);
  console.log('    To use it in the app, set VOICE_PROVIDER=polly in server/.env (and in your host settings).');
} catch (err) {
  const { title, action } = explainAwsError({ name: err.name, message: err.message });
  console.error(`x ${err.message}`);
  console.error(`  (${title}) ${action}`);
  process.exit(1);
}
