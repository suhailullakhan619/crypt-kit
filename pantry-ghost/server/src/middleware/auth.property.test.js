// Property 4: Requests Without a Valid JWT Are Rejected
// Validates: Requirements 3.3
import fc from 'fast-check';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { useTestContext, TEST_SECRET } from '../../test/helpers.js';
import { authenticate } from './auth.js';
import { createApp } from '../app.js';

function makeRes() {
  const res = {};
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

function runAuth(header) {
  const req = { headers: header === undefined ? {} : { authorization: header } };
  const res = makeRes();
  let called = false;
  authenticate(req, res, () => { called = true; });
  return { res, called, req };
}

const claims = fc.record({ userId: fc.hexaString({ minLength: 24, maxLength: 24 }), role: fc.constantFrom('Admin', 'Member', 'Viewer') });

const invalidHeader = fc.oneof(
  fc.constant(undefined),
  fc.string(),                                                     // garbage
  fc.string().map((s) => `Bearer ${s}`),                           // garbage token
  fc.string().map((s) => `Basic ${s}`),                            // wrong scheme
  claims.map((c) => `Bearer ${jwt.sign(c, 'another-secret-entirely-'.padEnd(40, 'z'))}`), // wrong secret
  claims.map((c) => `Bearer ${jwt.sign({ ...c, exp: Math.floor(Date.now() / 1000) - 60 }, TEST_SECRET)}`), // expired
  claims.map((c) => `Bearer ${jwt.sign(c, TEST_SECRET, { algorithm: 'HS512' })}`), // disallowed alg
  claims.map((c) => `Bearer ${jwt.sign(c, '', { algorithm: 'none' })}`)            // unsigned
);

describe('Property 4: unauthenticated rejection', () => {
  let app;
  beforeAll(async () => {
    useTestContext();
    app = await createApp();
  });

  test('any invalid Authorization header → 401 and next() is not called', () => {
    fc.assert(
      fc.property(invalidHeader, (header) => {
        const { res, called } = runAuth(header);
        expect(called).toBe(false);
        expect(res.statusCode).toBe(401);
      }),
      { numRuns: 200 }
    );
  });

  test('a valid token passes and exposes { userId, role }', () => {
    fc.assert(
      fc.property(claims, (c) => {
        const { called, req } = runAuth(`Bearer ${jwt.sign(c, TEST_SECRET, { expiresIn: '1h' })}`);
        expect(called).toBe(true);
        expect(req.user).toMatchObject({ userId: c.userId, role: c.role });
      }),
      { numRuns: 100 }
    );
  });

  test('over HTTP, protected endpoints answer 401 for invalid headers', async () => {
    await fc.assert(
      fc.asyncProperty(invalidHeader, fc.constantFrom('/api/auth/me', '/api/users', '/api/users/search'), async (header, path) => {
        const req = request(app).get(path);
        if (header !== undefined) req.set('Authorization', header.replace(/[\r\n]/g, ''));
        const res = await req;
        expect(res.status).toBe(401);
      }),
      { numRuns: 50 }
    );
  });

  test('health is public', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', app: 'Crypt Kit', demo: true, voiceProvider: 'browser' });
  });

  test('unknown /api path → JSON 404', async () => {
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/No route/);
  });
});
