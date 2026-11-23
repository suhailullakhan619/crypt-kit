import { loadEnv, EnvError } from './env.js';

const SECRET = 'x'.repeat(32);

describe('loadEnv', () => {
  test('production mode requires JWT_SECRET of at least 32 chars', () => {
    expect(() => loadEnv({ MONGODB_URI: 'mongodb://h/db' })).toThrow(/JWT_SECRET/);
    expect(() => loadEnv({ MONGODB_URI: 'mongodb://h/db', JWT_SECRET: 'short' })).toThrow(EnvError);
  });

  test('production mode requires MONGODB_URI', () => {
    expect(() => loadEnv({ JWT_SECRET: SECRET })).toThrow(/MONGODB_URI/);
  });

  test('valid production env is frozen and typed', () => {
    const env = loadEnv({ MONGODB_URI: 'mongodb://h/db', JWT_SECRET: SECRET, PORT: '8080' });
    expect(env.PORT).toBe(8080);
    expect(env.DEMO_MODE).toBe(false);
    expect(env.MONGODB_URI).toBe('mongodb://h/db');
    expect(Object.isFrozen(env)).toBe(true);
  });

  test('demo mode needs nothing and generates a long random secret', () => {
    const a = loadEnv({ DEMO_MODE: 'true' });
    const b = loadEnv({ DEMO_MODE: 'TRUE' });
    expect(a.DEMO_MODE).toBe(true);
    expect(a.JWT_SECRET.length).toBeGreaterThanOrEqual(32);
    expect(a.JWT_SECRET).not.toBe(b.JWT_SECRET);
    expect(a.MONGODB_URI).toBeNull();
  });

  test('VOICE_PROVIDER defaults to the browser voice and has no Polly settings', () => {
    const env = loadEnv({ DEMO_MODE: 'true' });
    expect(env.VOICE_PROVIDER).toBe('browser');
    expect(env.POLLY).toBeNull();
  });
  test('VOICE_PROVIDER=polly reads voice, engine and region, with defaults', () => {
    expect(loadEnv({ DEMO_MODE: 'true', VOICE_PROVIDER: 'polly' }).POLLY).toEqual({ voiceId: 'Joanna', engine: 'neural', region: 'us-east-1' });
    expect(loadEnv({ DEMO_MODE: 'true', VOICE_PROVIDER: 'Polly', POLLY_VOICE_ID: 'Matthew', POLLY_ENGINE: 'Standard', AWS_REGION: 'eu-west-2' }).POLLY)
      .toEqual({ voiceId: 'Matthew', engine: 'standard', region: 'eu-west-2' });
    expect(loadEnv({ DEMO_MODE: 'true', VOICE_PROVIDER: 'polly', AWS_REGION: 'eu-west-2', POLLY_REGION: 'us-west-2' }).POLLY.region).toBe('us-west-2');
  });
  test('unknown providers and bad Polly settings are rejected', () => {
    expect(() => loadEnv({ DEMO_MODE: 'true', VOICE_PROVIDER: 'carrier-pigeon' })).toThrow(/VOICE_PROVIDER/);
    expect(() => loadEnv({ DEMO_MODE: 'true', VOICE_PROVIDER: 'openai' })).toThrow(/VOICE_PROVIDER/);
    expect(() => loadEnv({ DEMO_MODE: 'true', VOICE_PROVIDER: 'polly', POLLY_ENGINE: 'loud' })).toThrow(/POLLY_ENGINE/);
    expect(() => loadEnv({ DEMO_MODE: 'true', VOICE_PROVIDER: 'polly', POLLY_VOICE_ID: 'Jo anna!' })).toThrow(/POLLY_VOICE_ID/);
    expect(() => loadEnv({ DEMO_MODE: 'true', VOICE_PROVIDER: 'polly', POLLY_REGION: 'mars' })).toThrow(/POLLY_REGION/);
  });
  test('invalid PORT is rejected', () => {
    expect(() => loadEnv({ DEMO_MODE: 'true', PORT: 'abc' })).toThrow(/PORT/);
    expect(() => loadEnv({ DEMO_MODE: 'true', PORT: '70000' })).toThrow(/PORT/);
  });
});

describe('loadEnv: database isolation', () => {
  const base = { MONGODB_URI: 'mongodb://h/real', JWT_SECRET: SECRET };

  test('MONGODB_DB_NAME is passed through and validated', () => {
    expect(loadEnv({ ...base, MONGODB_DB_NAME: 'lab_ledger_test' }).MONGODB_DB_NAME).toBe('lab_ledger_test');
    expect(loadEnv(base).MONGODB_DB_NAME).toBeNull();
    expect(() => loadEnv({ ...base, MONGODB_DB_NAME: 'bad/name' })).toThrow(/MONGODB_DB_NAME/);
  });

  test('SEED_ON_BOOT on a real database requires a *_test database name', () => {
    expect(() => loadEnv({ ...base, SEED_ON_BOOT: 'true' })).toThrow(/_test/);
    expect(() => loadEnv({ ...base, SEED_ON_BOOT: 'true', MONGODB_DB_NAME: 'real' })).toThrow(/_test/);
    expect(loadEnv({ ...base, SEED_ON_BOOT: 'true', MONGODB_DB_NAME: 'real_test' }).SEED_ON_BOOT).toBe(true);
  });
  test('demo mode ignores MONGODB_URI unless DEMO_PERSIST=true', () => {
    const env = loadEnv({ DEMO_MODE: 'true', MONGODB_URI: 'mongodb://h/real', MONGODB_DB_NAME: 'app_test' });
    expect(env.MONGODB_URI).toBeNull();
    expect(env.MONGODB_DB_NAME).toBeNull();
    expect(env.DEMO_PERSIST).toBe(false);
  });
  test('DEMO_PERSIST uses the URI, but only with a *_demo or *_test database name', () => {
    const demo = { DEMO_MODE: 'true', DEMO_PERSIST: 'true', MONGODB_URI: 'mongodb://h/real' };
    expect(() => loadEnv({ DEMO_MODE: 'true', DEMO_PERSIST: 'true' })).toThrow(/requires MONGODB_URI/);
    expect(() => loadEnv(demo)).toThrow(/_demo/);
    expect(() => loadEnv({ ...demo, MONGODB_DB_NAME: 'real' })).toThrow(/_demo/);
    expect(() => loadEnv({ ...demo, MONGODB_DB_NAME: 'demo_real' })).toThrow(/_demo/);
    const env = loadEnv({ ...demo, MONGODB_DB_NAME: 'lab_ledger_demo' });
    expect(env).toMatchObject({ DEMO_MODE: true, DEMO_PERSIST: true, MONGODB_URI: 'mongodb://h/real', MONGODB_DB_NAME: 'lab_ledger_demo' });
    expect(loadEnv({ ...demo, MONGODB_DB_NAME: 'lab_ledger_test' }).MONGODB_DB_NAME).toBe('lab_ledger_test');
  });
  test('DEMO_PERSIST has no effect outside demo mode', () => {
    expect(loadEnv({ ...base, DEMO_PERSIST: 'true' }).DEMO_PERSIST).toBe(false);
  });
});

describe('loadEnv: TRUST_PROXY', () => {
  test('defaults to false and is enabled by "true"', () => {
    expect(loadEnv({ DEMO_MODE: 'true' }).TRUST_PROXY).toBe(false);
    expect(loadEnv({ DEMO_MODE: 'true', TRUST_PROXY: 'TRUE' }).TRUST_PROXY).toBe(true);
    expect(loadEnv({ DEMO_MODE: 'true', TRUST_PROXY: 'yes' }).TRUST_PROXY).toBe(false);
  });
});

describe('loadEnv: optional owner account', () => {
  const base = { DEMO_MODE: 'true' };
  test('is off unless both email and password are set', () => {
    expect(loadEnv(base).SEED_ADMIN).toBeNull();
    expect(() => loadEnv({ ...base, SEED_ADMIN_EMAIL: 'me@x.test' })).toThrow(/both SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD/);
    expect(() => loadEnv({ ...base, SEED_ADMIN_PASSWORD: 'long-enough-1' })).toThrow(/both/);
  });
  test('validates the email and password length, and lower-cases the email', () => {
    expect(() => loadEnv({ ...base, SEED_ADMIN_EMAIL: 'not-an-email', SEED_ADMIN_PASSWORD: 'long-enough-1' })).toThrow(/valid email/);
    expect(() => loadEnv({ ...base, SEED_ADMIN_EMAIL: 'me@x.test', SEED_ADMIN_PASSWORD: 'short' })).toThrow(/at least 8/);
    expect(loadEnv({ ...base, SEED_ADMIN_EMAIL: 'Me@X.test', SEED_ADMIN_PASSWORD: 'long-enough-1', SEED_ADMIN_NAME: 'Me' }).SEED_ADMIN)
      .toEqual({ email: 'me@x.test', password: 'long-enough-1', name: 'Me' });
    expect(loadEnv({ ...base, SEED_ADMIN_EMAIL: 'me@x.test', SEED_ADMIN_PASSWORD: 'long-enough-1' }).SEED_ADMIN.name).toBe('me');
  });
});