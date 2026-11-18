import request from 'supertest';
import { createApp } from './app.js';
import { createRegistry } from './core/registry.js';
import { useTestContext } from '../test/helpers.js';

/** Builds an app whose only route echoes req.ip, with TRUST_PROXY on or off. */
async function appWith(trust) {
  useTestContext({ registry: createRegistry([]), env: { TRUST_PROXY: trust } });
  const app = await createApp();
  app.get('/ip', (req, res) => res.json({ ip: req.ip }));
  return app;
}

describe('TRUST_PROXY', () => {
  test('is off by default, so a client cannot spoof its address with X-Forwarded-For', async () => {
    const app = await appWith(false);
    const res = await request(app).get('/ip').set('X-Forwarded-For', '203.0.113.7');
    expect(res.body.ip).not.toBe('203.0.113.7');
  });

  test('when on, req.ip is the visitor address added by the one trusted proxy', async () => {
    const app = await appWith(true);
    const res = await request(app).get('/ip').set('X-Forwarded-For', '198.51.100.1, 203.0.113.7');
    expect(res.body.ip).toBe('203.0.113.7');
  });
});
