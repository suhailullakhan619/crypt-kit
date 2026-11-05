import dotenv from 'dotenv';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Load server/.env regardless of the process working directory (e.g. `npm --prefix`).
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.env') });

/**
 * Error thrown when the environment is invalid. `server.js` prints the message and exits.
 */
export class EnvError extends Error {
  constructor(message) {
    super(message);
    this.name = 'EnvError';
  }
}

const VOICE_PROVIDERS = ['openai', 'browser'];

/**
 * Validates a raw environment object and returns a frozen, typed config.
 * Pure apart from random JWT secret generation in demo mode, so it is unit-testable.
 *
 * @param {Record<string, string | undefined>} src - usually process.env
 * @returns {Readonly<{PORT:number, MONGODB_URI:string|null, JWT_SECRET:string, CLIENT_URL:string,
 *   DEMO_MODE:boolean, OPENAI_API_KEY:string|null, VOICE_PROVIDER:'openai'|'browser'}>}
 * @throws {EnvError} naming the offending variable
 */
export function loadEnv(src = {}) {
  const str = (k) => (typeof src[k] === 'string' && src[k].trim() !== '' ? src[k].trim() : null);

  const DEMO_MODE = str('DEMO_MODE')?.toLowerCase() === 'true';

  const portRaw = str('PORT') ?? '5000';
  const PORT = Number(portRaw);
  if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
    throw new EnvError(`PORT must be an integer between 1 and 65535 (got "${portRaw}")`);
  }

  let JWT_SECRET = str('JWT_SECRET');
  if (!DEMO_MODE && (!JWT_SECRET || JWT_SECRET.length < 32)) {
    throw new EnvError('JWT_SECRET is required and must be at least 32 characters (or set DEMO_MODE=true)');
  }
  if (!JWT_SECRET) JWT_SECRET = crypto.randomBytes(48).toString('hex');

  const MONGODB_URI = str('MONGODB_URI');
  if (!DEMO_MODE && !MONGODB_URI) {
    throw new EnvError('MONGODB_URI is required (or set DEMO_MODE=true)');
  }

  const OPENAI_API_KEY = str('OPENAI_API_KEY');
  const voiceRaw = str('VOICE_PROVIDER')?.toLowerCase() ?? null;
  if (voiceRaw && !VOICE_PROVIDERS.includes(voiceRaw)) {
    throw new EnvError(`VOICE_PROVIDER must be one of ${VOICE_PROVIDERS.join(', ')} (got "${voiceRaw}")`);
  }
  if (voiceRaw === 'openai' && !OPENAI_API_KEY) {
    throw new EnvError('VOICE_PROVIDER=openai requires OPENAI_API_KEY');
  }
  const VOICE_PROVIDER = voiceRaw ?? (OPENAI_API_KEY ? 'openai' : 'browser');

  return Object.freeze({
    PORT,
    // In demo mode the in-memory server is used unless a URI is given explicitly AND DEMO_MODE is off.
    MONGODB_URI: DEMO_MODE ? null : MONGODB_URI,
    JWT_SECRET,
    CLIENT_URL: str('CLIENT_URL') ?? 'http://localhost:5173',
    DEMO_MODE,
    OPENAI_API_KEY,
    VOICE_PROVIDER,
  });
}

let cached = null;

/**
 * Returns the validated environment for this process (validated once, then cached).
 * @throws {EnvError}
 */
export function getEnv() {
  if (!cached) cached = loadEnv(process.env);
  return cached;
}

/** Test helper: replace the cached env. */
export function setEnvForTests(env) {
  cached = env ? Object.freeze({ ...env }) : null;
}
