import express from 'express';
import request from 'supertest';
import { rateLimit } from './rateLimit.js';

function appWith(limiter) {
  const app = express();
  app.use(express.json());
  app.post('/login', limiter, (_req, res) => res.json({ ok: true }));
  return app;
}

describe('rateLimit', () => {
  test('allows up to max, then answers 429 with Retry-After', async () => {
    const app = appWith(rateLimit({ max: 3, windowMs: 60000 }));
    for (let i = 0; i < 3; i += 1) expect((await request(app).post('/login').send({})).status).toBe(200);
    const blocked = await request(app).post('/login').send({});
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    expect(blocked.body.error).toMatch(/too many/i);
  });

  test('counts per key, so one email cannot lock out another', async () => {
    const app = appWith(rateLimit({ max: 1, windowMs: 60000, keyFn: (req) => req.body.email }));
    expect((await request(app).post('/login').send({ email: 'a@x.test' })).status).toBe(200);
    expect((await request(app).post('/login').send({ email: 'a@x.test' })).status).toBe(429);
    expect((await request(app).post('/login').send({ email: 'b@x.test' })).status).toBe(200);
  });

  test('the window resets after windowMs', async () => {
    let t = 1000;
    const app = appWith(rateLimit({ max: 1, windowMs: 1000, now: () => t }));
    expect((await request(app).post('/login').send({})).status).toBe(200);
    expect((await request(app).post('/login').send({})).status).toBe(429);
    t += 1001;
    expect((await request(app).post('/login').send({})).status).toBe(200);
  });
});
