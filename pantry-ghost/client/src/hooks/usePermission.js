import { useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useMeta } from '../context/MetaContext';
import { can, isSuperuser } from '../lib/can';

/**
 * Permission helpers for the signed-in user. Uses lib/can.js (mirror of the server rule) over
 * each resource's role matrix from /api/meta. Hide — don't disable — what the user can't use.
 */
export function usePermission() {
  const { user } = useAuth();
  const meta = useMeta();
  const role = user?.role;

  const check = useCallback(
    (key, action) => {
      const r = meta.resource(key);
      return !!r && can(role, { permissions: r.rolePermissions }, action, meta.roles);
    },
    [meta, role]
  );

  return {
    role,
    can: check,
    isSuperuser: isSuperuser(role, meta.roles),
  };
}
