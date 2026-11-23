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


/**
 * Validates a raw environment object and returns a frozen, typed config.
 * Pure apart from random JWT secret generation in demo mode, so it is unit-testable.
 *
 * @param {Record<string, string | undefined>} src - usually process.env
 * @returns {Readonly<{PORT:number, MONGODB_URI:string|null, JWT_SECRET:string, CLIENT_URL:string,
 *   DEMO_MODE:boolean, VOICE_PROVIDER:'browser'}>}
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

  // Answers are read aloud by the browser's own speech synthesis, so there is nothing to configure or pay for.
  const VOICE_PROVIDER = 'browser';

  // Optional database-name override. Mongoose uses it instead of the name in MONGODB_URI, so the same
  // cluster URI can serve a separate "<app>_test" database and the original database is never touched.
  const MONGODB_DB_NAME = str('MONGODB_DB_NAME');
  if (MONGODB_DB_NAME && !/^[A-Za-z0-9_-]{1,63}$/.test(MONGODB_DB_NAME)) {
    throw new EnvError('MONGODB_DB_NAME may only contain letters, digits, "_" and "-" (max 63 characters)');
  }

  // Seeding a real (non-demo) database is opt-in and only allowed into a database whose name ends in "_test".
  const SEED_ON_BOOT = str('SEED_ON_BOOT')?.toLowerCase() === 'true';
  if (SEED_ON_BOOT && !DEMO_MODE && !(MONGODB_DB_NAME && MONGODB_DB_NAME.endsWith('_test'))) {
    throw new EnvError('SEED_ON_BOOT=true requires MONGODB_DB_NAME ending in "_test" (protects real data)');
  }

  // DEMO_PERSIST=true keeps demo data in MONGODB_URI instead of an in-memory server (for hosts that
  // cannot run mongod). Demo mode seeds and allows one-click logins, so only a "_demo"/"_test" database.
  const DEMO_PERSIST = DEMO_MODE && str('DEMO_PERSIST')?.toLowerCase() === 'true';
  if (DEMO_PERSIST && !MONGODB_URI) {
    throw new EnvError('DEMO_PERSIST=true requires MONGODB_URI');
  }
  if (DEMO_PERSIST && !(MONGODB_DB_NAME && /_(demo|test)$/.test(MONGODB_DB_NAME))) {
    throw new EnvError('DEMO_PERSIST=true requires MONGODB_DB_NAME ending in "_demo" or "_test" (protects real data)');
  }
  const useUri = !DEMO_MODE || DEMO_PERSIST;

  // Behind a reverse proxy (Render, Railway, Heroku...) set TRUST_PROXY=true so rate limits see the
  // visitor's address from X-Forwarded-For instead of the proxy's. Trusts exactly one hop.
  const TRUST_PROXY = str('TRUST_PROXY')?.toLowerCase() === 'true';

  // Optional email. All of host, user, password and sender are needed; otherwise email stays off and
  // notifications remain in-app only. A half-filled setup is reported, not silently ignored.
  const smtp = { host: str('SMTP_HOST'), user: str('SMTP_USER'), pass: str('SMTP_PASS'), from: str('MAIL_FROM') };
  const smtpSet = Object.values(smtp).filter(Boolean).length;
  if (smtpSet > 0 && smtpSet < 4) {
    const missing = Object.entries({ SMTP_HOST: smtp.host, SMTP_USER: smtp.user, SMTP_PASS: smtp.pass, MAIL_FROM: smtp.from }).filter(([, v]) => !v).map(([k]) => k);
    throw new EnvError('Email is partly configured. Also set: ' + missing.join(', ') + ' (or clear the other SMTP_* / MAIL_FROM values)');
  }
  const smtpPort = Number(str('SMTP_PORT') ?? '587');
  if (smtpSet === 4 && (!Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535)) {
    throw new EnvError('SMTP_PORT must be an integer between 1 and 65535');
  }
  // MAIL_ALLOW_TEST_DOMAINS=true only for a local fake mail server: lets .test/.example addresses through.
  const MAIL = smtpSet === 4
    ? { host: smtp.host, port: smtpPort, user: smtp.user, pass: smtp.pass, from: smtp.from, replyTo: str('MAIL_REPLY_TO'), allowTestDomains: str('MAIL_ALLOW_TEST_DOMAINS')?.toLowerCase() === 'true' }
    : null;
  // Optional owner account created by the seed (the superuser role). Kept in .env, never in code,
  // so the password is not committed. Both email and password are needed.
  const adminEmail = str('SEED_ADMIN_EMAIL');
  const adminPassword = str('SEED_ADMIN_PASSWORD');
  if (!!adminEmail !== !!adminPassword) {
    throw new EnvError('Set both SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD, or neither');
  }
  if (adminEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) {
    throw new EnvError(`SEED_ADMIN_EMAIL is not a valid email address (got "${adminEmail}")`);
  }
  if (adminPassword && adminPassword.length < 8) {
    throw new EnvError('SEED_ADMIN_PASSWORD must be at least 8 characters');
  }
  const SEED_ADMIN = adminEmail
    ? { email: adminEmail.toLowerCase(), password: adminPassword, name: str('SEED_ADMIN_NAME') ?? adminEmail.split('@')[0] }
    : null;

  return Object.freeze({
    PORT,
    MAIL,
    SEED_ADMIN,
    MONGODB_DB_NAME: useUri ? MONGODB_DB_NAME : null,
    SEED_ON_BOOT,
    // Demo mode uses the in-memory server (MONGODB_URI null) unless DEMO_PERSIST=true.
    MONGODB_URI: useUri ? MONGODB_URI : null,
    DEMO_PERSIST,
    TRUST_PROXY,
    JWT_SECRET,
    CLIENT_URL: str('CLIENT_URL') ?? 'http://localhost:5173',
    DEMO_MODE,
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
