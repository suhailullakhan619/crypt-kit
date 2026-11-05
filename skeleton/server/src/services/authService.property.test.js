// Property 1: JWT Contains Correct Claims for Any Valid User
// Validates: Requirements 3.1
import { jest } from '@jest/globals';
import fc from 'fast-check';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { useTestContext, TEST_SECRET } from '../../test/helpers.js';
import config from '../../crypt.config.js';

const mockFindOne = jest.fn();
jest.unstable_mockModule('../models/User.js', () => ({
  default: { findOne: mockFindOne, findById: jest.fn() },
}));

const { login, BCRYPT_COST } = await import('./authService.js');

const PASSWORD = 'correct horse battery';
let HASH;

beforeAll(async () => {
  useTestContext();
  HASH = await bcrypt.hash(PASSWORD, BCRYPT_COST);
});

const hexId = fc.stringMatching(/^[0-9a-f]{24}$/);

const userArb = fc.record({
  _id: hexId,
  name: fc.string({ minLength: 1, maxLength: 40 }),
  email: fc.emailAddress(),
  role: fc.constantFrom(...config.roles),
});

function asDoc(u) {
  return {
    ...u,
    passwordHash: HASH,
    active: true,
    toPublic() { return { _id: u._id, name: u.name, email: u.email, role: u.role, active: true }; },
  };
}

describe('Property 1: JWT claims', () => {
  test('for any user with a configured role, the token carries userId, role, name and a 24 h expiry', async () => {
    await fc.assert(
      fc.asyncProperty(userArb, async (u) => {
        mockFindOne.mockReturnValue({ select: async () => asDoc(u) });
        const { token, user } = await login(u.email, PASSWORD);
        const payload = jwt.verify(token, TEST_SECRET);
        expect(payload.userId).toBe(u._id);
        expect(payload.role).toBe(u.role);
        expect(payload.name).toBe(u.name);
        expect(payload.exp - payload.iat).toBe(86400);
        expect(user.passwordHash).toBeUndefined();
      }),
      { numRuns: 30 }
    );
  });

  test('wrong password, unknown email and inactive user all give the same 401', async () => {
    const u = { _id: 'a'.repeat(24), name: 'A', email: 'a@b.co', role: config.roles[1] };

    mockFindOne.mockReturnValue({ select: async () => asDoc(u) });
    const wrong = await login(u.email, 'nope').catch((e) => e);

    mockFindOne.mockReturnValue({ select: async () => null });
    const unknown = await login('ghost@b.co', PASSWORD).catch((e) => e);

    mockFindOne.mockReturnValue({ select: async () => ({ ...asDoc(u), active: false }) });
    const inactive = await login(u.email, PASSWORD).catch((e) => e);

    for (const e of [wrong, unknown, inactive]) {
      expect(e.status).toBe(401);
      expect(e.message).toBe(wrong.message);
    }
  });

  test('password hashes use bcrypt cost ≥ 10', async () => {
    const { hashPassword } = await import('./authService.js');
    const hash = await hashPassword('whatever-123');
    expect(bcrypt.getRounds(hash)).toBeGreaterThanOrEqual(10);
  });
});
