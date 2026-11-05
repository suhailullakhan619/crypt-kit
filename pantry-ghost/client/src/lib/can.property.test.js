// Property 15: Client `can()` Mirrors Server `can()`
// Validates: Requirements 13.6
import fc from 'fast-check';
import { can as clientCan } from './can';
import { can as serverCan } from '../../../server/src/core/permissions.js';

const roleList = fc.uniqueArray(fc.stringMatching(/^[A-Z][a-z]{2,8}$/), { minLength: 1, maxLength: 5 });

const scenario = roleList.chain((roles) =>
  fc.record({
    roles: fc.constant(roles),
    def: fc.oneof(
      fc.constant(null),
      fc.constant({}),
      fc.record({ permissions: fc.record({ read: fc.subarray(roles), create: fc.subarray(roles), update: fc.subarray(roles), delete: fc.subarray(roles) }, { requiredKeys: [] }) })
    ),
    role: fc.oneof(fc.constantFrom(...roles), fc.string(), fc.constant(undefined)),
    action: fc.constantFrom('read', 'create', 'update', 'delete', 'haunt'),
  })
);

describe('Property 15: client can() mirrors server can()', () => {
  it('returns the same boolean for any roles, permissions, role and action', () => {
    fc.assert(
      fc.property(scenario, ({ roles, def, role, action }) => {
        expect(clientCan(role, def, action, roles)).toBe(serverCan(role, def, action, roles));
      }),
      { numRuns: 500 }
    );
  });
});
