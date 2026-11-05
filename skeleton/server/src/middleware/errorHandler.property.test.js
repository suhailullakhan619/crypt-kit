// Property 11: Error Handler Honours Status Codes and Never Leaks Internals
// Validates: Requirements 12.2, 12.4
import fc from 'fast-check';
import { errorHandler } from './errorHandler.js';

function makeRes() {
  const res = {};
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

const run = (err) => {
  const res = makeRes();
  errorHandler(err, {}, res, () => {});
  return res;
};

describe('Property 11: error handler', () => {
  test('any error with integer status in [400, 599] keeps that status and message', () => {
    fc.assert(
      fc.property(fc.integer({ min: 400, max: 599 }), fc.string({ minLength: 1 }), (status, message) => {
        const err = new Error(message);
        err.status = status;
        const res = run(err);
        expect(res.statusCode).toBe(status);
        expect(res.body.error).toBe(message);
      }),
      { numRuns: 100 }
    );
  });

  test('errors without a valid status become an opaque 500', () => {
    const badStatus = fc.oneof(
      fc.constant(undefined),
      fc.integer({ min: -1000, max: 399 }),
      fc.integer({ min: 600, max: 10000 }),
      fc.double({ min: 400.1, max: 598.9, noNaN: true }),
      fc.string()
    );
    fc.assert(
      fc.property(badStatus, fc.string(), (status, message) => {
        const err = new Error(message);
        if (status !== undefined) err.status = status;
        err.stack = 'SECRET STACK at internal.js:1';
        const res = run(err);
        expect(res.statusCode).toBe(500);
        expect(res.body).toEqual({ error: 'Internal server error' });
      }),
      { numRuns: 100 }
    );
  });

  test('known library errors map to 400 / 409 / 404', () => {
    const validation = Object.assign(new Error('x'), { name: 'ValidationError', errors: { name: { message: 'Name is required' } } });
    expect(run(validation)).toMatchObject({ statusCode: 400, body: { fields: { name: 'Name is required' } } });
    expect(run(Object.assign(new Error('dup'), { code: 11000, keyValue: { email: 'a@b.c' } })).statusCode).toBe(409);
    expect(run(Object.assign(new Error('cast'), { name: 'CastError' })).statusCode).toBe(404);
  });

  test('regression from prototype: a service 404 is not turned into a 500', () => {
    const err = Object.assign(new Error('Asset not found'), { status: 404 });
    expect(run(err)).toMatchObject({ statusCode: 404, body: { error: 'Asset not found' } });
  });
});
