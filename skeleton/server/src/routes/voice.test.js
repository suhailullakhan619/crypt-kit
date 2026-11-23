// Voice HTTP endpoints. Polly is faked, so tests never need AWS credentials.
import { jest } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../app.js';
import { useTestContext, TEST_SECRET } from '../../test/helpers.js';
import { speakLimit } from './voice.js';
import { setSpeechClientForTests } from '../services/speechService.js';

const token = jwt.sign({ userId: 'a'.repeat(24), role: 'Admin', name: 'Morticia' }, TEST_SECRET);
const auth = { Authorization: `Bearer ${token}` };
const POLLY = { voiceId: 'Joanna', engine: 'neural', region: 'us-east-1' };
const pollyEnv = { VOICE_PROVIDER: 'polly', POLLY };

function fakePolly({ fail } = {}) {
  const seen = [];
  return {
    seen,
    send: async (cmd) => {
      seen.push(cmd.input);
      if (fail) throw fail;
      return { AudioStream: new Uint8Array([0xff, 0xfb, 0x90]) };
    },
  };
}

beforeEach(() => speakLimit.reset());
afterEach(() => setSpeechClientForTests(null));

describe('voice routes', () => {
  test('polly provider: text in, audio/mpeg out, with the configured voice', async () => {
    useTestContext({ env: pollyEnv });
    const fake = fakePolly();
    setSpeechClientForTests(fake);
    const app = await createApp();
    const res = await request(app).post('/api/voice/speak').set(auth).send({ text: '  You have two overdue tasks.  ' });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/audio\/mpeg/);
    expect(Buffer.from(res.body).length).toBe(3);
    expect(fake.seen[0]).toMatchObject({ Text: 'You have two overdue tasks.', VoiceId: 'Joanna', Engine: 'neural', OutputFormat: 'mp3' });
  });

  test('Polly failures surface as 502 with what to do about it', async () => {
    useTestContext({ env: pollyEnv });
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    setSpeechClientForTests(fakePolly({ fail: Object.assign(new Error('not authorized to perform: polly:SynthesizeSpeech'), { name: 'AccessDeniedException' }) }));
    const app = await createApp();
    const res = await request(app).post('/api/voice/speak').set(auth).send({ text: 'hello' });
    expect(res.status).toBe(502);
    expect(res.body.error).toMatch(/polly:SynthesizeSpeech/);
    spy.mockRestore();
  });

  test('requires a signed-in user, and text of a sensible length', async () => {
    useTestContext({ env: pollyEnv });
    setSpeechClientForTests(fakePolly());
    const app = await createApp();
    expect((await request(app).post('/api/voice/speak').send({ text: 'hi' })).status).toBe(401);
    expect((await request(app).post('/api/voice/speak').set(auth).send({})).status).toBe(400);
    expect((await request(app).post('/api/voice/speak').set(auth).send({ text: '   ' })).status).toBe(400);
    expect((await request(app).post('/api/voice/speak').set(auth).send({ text: 'x'.repeat(1501) })).status).toBe(400);
    expect((await request(app).post('/api/voice/speak').set(auth).send({ text: 42 })).status).toBe(400);
  });

  test('each user gets 30 spoken answers per window', async () => {
    useTestContext({ env: pollyEnv });
    setSpeechClientForTests(fakePolly());
    const app = await createApp();
    for (let i = 0; i < 30; i++) expect((await request(app).post('/api/voice/speak').set(auth).send({ text: 'hi' })).status).toBe(200);
    const res = await request(app).post('/api/voice/speak').set(auth).send({ text: 'hi' });
    expect(res.status).toBe(429);
    expect(res.headers['retry-after']).toBeDefined();
  });

  test('browser provider: /speak is refused, /ask answers JSON, examples report the provider', async () => {
    useTestContext();
    const app = await createApp();
    expect((await request(app).post('/api/voice/speak').set(auth).send({ text: 'hi' })).status).toBe(400);
    const ask = await request(app).post('/api/voice/ask').set(auth).send({ text: 'zzz qqq?' });
    expect(ask.status).toBe(200);
    expect(ask.body).toMatchObject({ transcript: 'zzz qqq?', intent: 'UNKNOWN' });
    const ex = await request(app).get('/api/voice/examples').set(auth);
    expect(ex.body).toMatchObject({ provider: 'browser', examples: [] });
  });

  test('the old audio upload endpoint is gone and health reports no assistant', async () => {
    useTestContext();
    const app = await createApp();
    expect((await request(app).post('/api/voice/query').set(auth).send({})).status).toBe(404);
    const health = await request(app).get('/api/health');
    expect(health.body.assistant).toBeUndefined();
    expect(health.body.voiceProvider).toBe('browser');
  });
});
