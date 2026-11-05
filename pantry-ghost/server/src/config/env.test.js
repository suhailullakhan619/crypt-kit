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

  test('VOICE_PROVIDER defaults from OPENAI_API_KEY', () => {
    expect(loadEnv({ DEMO_MODE: 'true' }).VOICE_PROVIDER).toBe('browser');
    expect(loadEnv({ DEMO_MODE: 'true', OPENAI_API_KEY: 'sk-test' }).VOICE_PROVIDER).toBe('openai');
    expect(loadEnv({ DEMO_MODE: 'true', OPENAI_API_KEY: 'sk-test', VOICE_PROVIDER: 'browser' }).VOICE_PROVIDER).toBe('browser');
  });

  test('VOICE_PROVIDER=openai without a key, or an unknown provider, is rejected', () => {
    expect(() => loadEnv({ DEMO_MODE: 'true', VOICE_PROVIDER: 'openai' })).toThrow(/OPENAI_API_KEY/);
    expect(() => loadEnv({ DEMO_MODE: 'true', VOICE_PROVIDER: 'carrier-pigeon' })).toThrow(/VOICE_PROVIDER/);
  });

  test('invalid PORT is rejected', () => {
    expect(() => loadEnv({ DEMO_MODE: 'true', PORT: 'abc' })).toThrow(/PORT/);
    expect(() => loadEnv({ DEMO_MODE: 'true', PORT: '70000' })).toThrow(/PORT/);
  });
});
