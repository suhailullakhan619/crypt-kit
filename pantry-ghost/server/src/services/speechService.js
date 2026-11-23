import { getEnv } from '../config/env.js';
import { httpError } from '../utils/httpError.js';

/**
 * Speech output with Amazon Polly. The AWS SDK is loaded on first use, so the server starts (and the
 * tests run) without AWS credentials. Credentials come from the standard AWS sources
 * (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY, or an IAM role). Nothing here ever logs them.
 */
let client = null;
let PollyCommand = null;

/** Test helper: `fake` is `{ send(command) => { AudioStream } }`; pass null to reset. */
export function setSpeechClientForTests(fake) {
  client = fake;
  PollyCommand = fake ? class { constructor(input) { this.input = input; } } : null;
}

async function polly(cfg) {
  if (!client) {
    const sdk = await import('@aws-sdk/client-polly');
    client = new sdk.PollyClient({ region: cfg.region });
    PollyCommand = sdk.SynthesizeSpeechCommand;
  }
  return client;
}

/**
 * Turns an AWS error into what the owner should do about it. Pure, so it is unit tested.
 * @param {{ name?: string, message?: string }} err
 * @returns {{ title: string, action: string }}
 */
export function explainAwsError(err) {
  const name = String(err?.name ?? '');
  const msg = String(err?.message ?? '');
  const has = (re) => re.test(name) || re.test(msg);
  if (has(/could not load credentials|CredentialsProviderError|no credentials/i)) {
    return { title: 'No AWS credentials found', action: "Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in server/.env, or in the host's environment settings. Do not commit them." };
  }
  if (has(/ExpiredToken|security token.*expired|token.*expired/i)) {
    return { title: 'The AWS credentials have expired', action: "Temporary keys stop working after a while. Create fresh keys (or use an IAM user's long-lived access key) and update them." };
  }
  if (has(/UnrecognizedClient|InvalidSignature|InvalidClientTokenId|SignatureDoesNotMatch|security token included in the request is invalid/i)) {
    return { title: 'AWS rejected the credentials', action: 'The access key or secret is wrong (a stray space or quote is common). Re-copy both values, and check POLLY_REGION or AWS_REGION is a real region.' };
  }
  if (has(/AccessDenied|not authorized to perform/i)) {
    return { title: 'The IAM user may not call Polly', action: 'Attach a policy allowing polly:SynthesizeSpeech (see docs/POLLY.md for the smallest one).' };
  }
  if (has(/voice.*(not found|invalid)|InvalidVoiceId|Voice ID/i)) {
    return { title: 'Polly does not know that voice', action: 'Check POLLY_VOICE_ID for typos (for example Joanna, Matthew, Ruth).' };
  }
  if (has(/engine.*not supported|not supported.*engine|InvalidEngine|neural.*not supported/i)) {
    return { title: 'That voice does not support this engine', action: 'Set POLLY_ENGINE=standard, or choose a voice that has a neural version in this region.' };
  }
  if (has(/Throttling|TooManyRequests|rate exceeded|quota|ServiceFailure/i)) {
    return { title: 'Polly is rate limiting this account', action: 'Wait a minute and retry. Check Service Quotas if it persists.' };
  }
  if (has(/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|getaddrinfo/i)) {
    return { title: 'Could not reach AWS', action: 'Check the network connection, a proxy or firewall, and that the region is correct.' };
  }
  return { title: 'Polly returned an error', action: `${name || 'Error'}: ${msg.slice(0, 200)}` };
}

async function toBuffer(stream) {
  if (!stream) return Buffer.alloc(0);
  if (Buffer.isBuffer(stream)) return stream;
  if (stream instanceof Uint8Array) return Buffer.from(stream);
  if (typeof stream.transformToByteArray === 'function') return Buffer.from(await stream.transformToByteArray());
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

/**
 * Text-to-speech with Amazon Polly.
 * @param {string} text plain text, already length-checked by the caller
 * @returns {Promise<Buffer>} audio/mpeg bytes
 * @throws {Error} 502 with a plain-language message on any Polly failure
 */
export async function speak(text) {
  const cfg = getEnv().POLLY;
  if (!cfg) throw httpError(400, 'Server-side voice is disabled; the browser speech provider is in use');
  try {
    const c = await polly(cfg);
    const out = await c.send(new PollyCommand({
      Text: text.slice(0, 1500),
      OutputFormat: 'mp3',
      VoiceId: cfg.voiceId,
      Engine: cfg.engine,
      TextType: 'text',
    }));
    const audio = await toBuffer(out?.AudioStream);
    if (!audio.length) throw new Error('Polly returned no audio');
    return audio;
  } catch (err) {
    if (err.status) throw err;
    const { title, action } = explainAwsError(err);
    console.error('polly failed:', err?.name ?? 'Error', String(err?.message ?? err).slice(0, 200));
    throw httpError(502, `Speech service error: ${title}. ${action}`);
  }
}
