// Voice HTTP endpoints: typed questions in, answers out. Speaking is done by the browser.
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../app.js';
import { useTestContext, TEST_SECRET } from '../../test/helpers.js';

const token = jwt.sign({ userId: 'a'.repeat(24), role: 'Admin', name: 'Morticia' }, TEST_SECRET);
const auth = { Authorization: `Bearer ${token}` };

describe('voice routes', () => {
  test('/ask answers JSON and examples report the browser provider', async () => {
    useTestContext();
    const app = await createApp();
    const ask = await request(app).post('/api/voice/ask').set(auth).send({ text: 'zzz qqq?' });
    expect(ask.status).toBe(200);
    expect(ask.body).toMatchObject({ transcript: 'zzz qqq?', intent: 'UNKNOWN' });
    const ex = await request(app).get('/api/voice/examples').set(auth);
    expect(ex.body).toMatchObject({ provider: 'browser', examples: [] });
  });

  test('requires a signed-in user and a question', async () => {
    useTestContext();
    const app = await createApp();
    expect((await request(app).post('/api/voice/ask').send({ text: 'hi' })).status).toBe(401);
    expect((await request(app).post('/api/voice/ask').set(auth).send({})).status).toBe(400);
  });

  test('there is no server-side audio: the old upload and speak endpoints are gone', async () => {
    useTestContext();
    const app = await createApp();
    expect((await request(app).post('/api/voice/query').set(auth).send({})).status).toBe(404);
    expect((await request(app).post('/api/voice/speak').set(auth).send({ text: 'hi' })).status).toBe(404);
    const health = await request(app).get('/api/health');
    expect(health.body.assistant).toBeUndefined();
    expect(health.body.voiceProvider).toBe('browser');
  });
});
