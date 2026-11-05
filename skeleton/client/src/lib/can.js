/**
 * Client mirror of server/src/core/permissions.js `can` (Property 15 asserts they agree).
 * Keep the logic identical: unknown role → false; first role (Superuser) → true;
 * otherwise the role must be listed in resourceDef.permissions[action].
 *
 * @param {string} role
 * @param {{ permissions?: Record<string, string[]> } | null | undefined} resourceDef
 * @param {'read'|'create'|'update'|'delete'} action
 * @param {string[]} roles
 * @returns {boolean}
 */
export function can(role, resourceDef, action, roles) {
  if (!role || !Array.isArray(roles) || !roles.includes(role)) return false;
  if (role === roles[0]) return true;
  const allowed = resourceDef?.permissions?.[action];
  return Array.isArray(allowed) && allowed.includes(role);
}

export function isSuperuser(role, roles) {
  return Array.isArray(roles) && roles.length > 0 && role === roles[0];
}
