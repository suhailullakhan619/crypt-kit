// Property 3: Permission Matrix Is Enforced for Every Role × Action
// Validates: Requirements 3.4, 3.5, 5.1
import fc from 'fast-check';
import { can, ACTIONS } from './permissions.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { setContext } from '../context.js';

const roleList = fc.uniqueArray(fc.stringMatching(/^[A-Z][a-z]{2,8}$/), { minLength: 2, maxLength: 5 });

const scenario = roleList.chain((roles) =>
  fc.record({
    roles: fc.constant(roles),
    permissions: fc.record({
      read: fc.subarray(roles), create: fc.subarray(roles), update: fc.subarray(roles), delete: fc.subarray(roles),
    }),
    role: fc.oneof(fc.constantFrom(...roles), fc.string()),
    action: fc.constantFrom(...ACTIONS),
  })
);

function runGuard({ roles, permissions, role, action }) {
  const resource = { key: 'thing', def: { permissions } };
  setContext({ config: { roles }, registry: { get: (k) => (k === 'thing' ? resource : null) } });
  const res = { status(c) { this.code = c; return this; }, json() { return this; } };
  let passed = false;
  requirePermission('thing', action)({ user: { userId: 'u', role } }, res, () => { passed = true; });
  return { passed, code: res.code };
}

describe('Property 3: permission matrix', () => {
  test('guard calls next() iff can() is true; otherwise 403', () => {
    fc.assert(
      fc.property(scenario, (s) => {
        const expected = can(s.role, { permissions: s.permissions }, s.action, s.roles);
        const { passed, code } = runGuard(s);
        expect(passed).toBe(expected);
        if (!expected) expect(code).toBe(403);
      }),
      { numRuns: 300 }
    );
  });

  test('the first role (Superuser) is allowed everything, even with empty permissions', () => {
    fc.assert(
      fc.property(scenario, ({ roles, action }) => {
        expect(can(roles[0], { permissions: {} }, action, roles)).toBe(true);
      })
    );
  });

  test('a non-superuser is allowed exactly when listed', () => {
    fc.assert(
      fc.property(scenario, ({ roles, permissions, action }) => {
        for (const r of roles.slice(1)) {
          expect(can(r, { permissions }, action, roles)).toBe(permissions[action].includes(r));
        }
      })
    );
  });

  test('unknown resource key → 404', () => {
    setContext({ config: { roles: ['A', 'B'] }, registry: { get: () => null } });
    const res = { status(c) { this.code = c; return this; }, json() { return this; } };
    requirePermission('ghosts', 'read')({ user: { role: 'A' } }, res, () => {});
    expect(res.code).toBe(404);
  });
});
