// Voice HTTP endpoints with a fake OpenAI client (tests never need OPENAI_API_KEY).
// Validates: Requirements 11.4, 11.5, 11.6
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../app.js';
import { useTestContext, TEST_SECRET } from '../../test/helpers.js';
import { setSpeechClientForTests } from '../services/speechService.js';

const token = jwt.sign({ userId: 'a'.repeat(24), role: 'Admin', name: 'Morticia' }, TEST_SECRET);
const auth = { Authorization: `Bearer ${token}` };
const audio = Buffer.from('RIFF....WAVEfake');

function fakeClient({ text = 'zzz', failStt = false, failTts = false } = {}) {
  return {
    audio: {
      transcriptions: { create: async () => { if (failStt) throw new Error('quota exceeded'); return { text }; } },
      speech: { create: async () => { if (failTts) throw new Error('tts down'); return { arrayBuffer: async () => new Uint8Array([0xff, 0xfb, 0x90]).buffer }; } },
    },
  };
}

describe('voice routes', () => {
  test('openai provider: audio in → audio/mpeg out with transcript/answer headers', async () => {
    useTestContext({ env: { VOICE_PROVIDER: 'openai', OPENAI_API_KEY: 'sk-test' } });
    setSpeechClientForTests(fakeClient({ text: 'gibberish words' }));
    const app = await createApp();
    const res = await request(app).post('/api/voice/query').set(auth).attach('audio', audio, { filename: 'q.webm', contentType: 'audio/webm' });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/audio\/mpeg/);
    expect(decodeURIComponent(res.headers['x-transcript'])).toBe('gibberish words');
    expect(decodeURIComponent(res.headers['x-answer'])).toMatch(/didn't catch that/);
  });

  test('OpenAI failures surface as 502 with a descriptive message', async () => {
    useTestContext({ env: { VOICE_PROVIDER: 'openai', OPENAI_API_KEY: 'sk-test' } });
    const app = await createApp();
    setSpeechClientForTests(fakeClient({ failStt: true }));
    let res = await request(app).post('/api/voice/query').set(auth).attach('audio', audio, { filename: 'q.webm', contentType: 'audio/webm' });
    expect(res.status).toBe(502);
    expect(res.body.error).toBe('Speech service error (transcription): quota exceeded');

    setSpeechClientForTests(fakeClient({ failTts: true }));
    res = await request(app).post('/api/voice/query').set(auth).attach('audio', audio, { filename: 'q.webm', contentType: 'audio/webm' });
    expect(res.status).toBe(502);
  });

  test('non-audio uploads are 415; missing file is 400', async () => {
    useTestContext({ env: { VOICE_PROVIDER: 'openai', OPENAI_API_KEY: 'sk-test' } });
    const app = await createApp();
    const bad = await request(app).post('/api/voice/query').set(auth).attach('audio', Buffer.from('x'), { filename: 'x.txt', contentType: 'text/plain' });
    expect(bad.status).toBe(415);
    const none = await request(app).post('/api/voice/query').set(auth);
    expect(none.status).toBe(400);
  });

  test('browser provider: /query is refused, /ask answers JSON', async () => {
    useTestContext();
    const app = await createApp();
    expect((await request(app).post('/api/voice/query').set(auth).attach('audio', audio, { filename: 'q.webm', contentType: 'audio/webm' })).status).toBe(400);
    const ask = await request(app).post('/api/voice/ask').set(auth).send({ text: 'hello?' });
    expect(ask.status).toBe(200);
    expect(ask.body).toMatchObject({ transcript: 'hello?', intent: 'UNKNOWN' });
    const ex = await request(app).get('/api/voice/examples').set(auth);
    expect(ex.body).toMatchObject({ provider: 'browser', examples: [] });
  });
});
