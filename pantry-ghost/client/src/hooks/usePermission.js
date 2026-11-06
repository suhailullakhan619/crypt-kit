import { useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useMeta } from '../context/MetaContext';
import { can, isSuperuser } from '../lib/can';

/**
 * Permission helpers for the signed-in user. Uses lib/can.js (mirror of the server rule) over
 * each resource's role matrix from /api/meta. Hide — don't disable — what the user can't use.
 *
 *  - can(key, action): may the user do this through the GENERIC UI? (role allows it AND the
 *    resource does not list the action in genericDisabled — Req 16.12)
 *  - canRole(key, action): role permission only, for app workflow pages.
 */
export function usePermission() {
  const { user } = useAuth();
  const meta = useMeta();
  const role = user?.role;

  const canRole = useCallback(
    (key, action) => {
      const r = meta.resource(key);
      return !!r && can(role, { permissions: r.rolePermissions }, action, meta.roles);
    },
    [meta, role]
  );

  const check = useCallback(
    (key, action) => canRole(key, action) && !(meta.resource(key)?.genericDisabled ?? []).includes(action),
    [meta, canRole]
  );

  return {
    role,
    can: check,
    canRole,
    isSuperuser: isSuperuser(role, meta.roles),
  };
}
