import { getEnv } from '../config/env.js';
import { httpError } from '../utils/httpError.js';

let client = null;

/** Lazily creates the OpenAI client so the server starts without a key (Req 2.6). */
async function openai() {
  if (!client) {
    const { default: OpenAI } = await import('openai');
    client = new OpenAI({ apiKey: getEnv().OPENAI_API_KEY });
  }
  return client;
}

/** Test helper. */
export function setSpeechClientForTests(fake) {
  client = fake;
}

/**
 * Speech-to-text with Whisper (`whisper-1`).
 * @param {Buffer} buffer
 * @param {string} [filename]
 * @param {string} [mimetype]
 * @returns {Promise<string>}
 * @throws {Error} 502 on any OpenAI failure (Req 11.6)
 */
export async function transcribe(buffer, filename = 'audio.webm', mimetype = 'audio/webm') {
  try {
    const { toFile } = await import('openai');
    const file = await toFile(buffer, filename, { type: mimetype });
    const result = await (await openai()).audio.transcriptions.create({ model: 'whisper-1', file });
    return result.text ?? '';
  } catch (err) {
    throw httpError(502, `Speech service error (transcription): ${err.message ?? 'unknown error'}`);
  }
}

/**
 * Text-to-speech with `tts-1`, voice `alloy`.
 * @param {string} text
 * @returns {Promise<Buffer>} audio/mpeg bytes
 * @throws {Error} 502 on any OpenAI failure
 */
export async function speak(text) {
  try {
    const res = await (await openai()).audio.speech.create({ model: 'tts-1', voice: 'alloy', input: text.slice(0, 4000) });
    return Buffer.from(await res.arrayBuffer());
  } catch (err) {
    throw httpError(502, `Speech service error (synthesis): ${err.message ?? 'unknown error'}`);
  }
}
