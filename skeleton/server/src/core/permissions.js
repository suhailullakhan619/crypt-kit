/**
 * Pure permission check. Mirrored byte-for-byte (logic) in client/src/lib/can.js —
 * Property 15 asserts both agree.
 *
 * Rules:
 *  1. Unknown role → false.
 *  2. The first role in `roles` is the Superuser → true for every resource/action.
 *  3. Otherwise the role must be listed in `resourceDef.permissions[action]`.
 *
 * @param {string} role
 * @param {{ permissions?: Record<string, string[]> } | null | undefined} resourceDef
 * @param {'read'|'create'|'update'|'delete'} action
 * @param {string[]} roles - ordered, highest privilege first
 * @returns {boolean}
 */
export function can(role, resourceDef, action, roles) {
  if (!role || !Array.isArray(roles) || !roles.includes(role)) return false;
  if (role === roles[0]) return true;
  const allowed = resourceDef?.permissions?.[action];
  return Array.isArray(allowed) && allowed.includes(role);
}

export const ACTIONS = Object.freeze(['read', 'create', 'update', 'delete']);

/** True when `role` is the Superuser role. */
export function isSuperuser(role, roles) {
  return Array.isArray(roles) && roles.length > 0 && role === roles[0];
}
