import { can } from '../core/permissions.js';
import { getContext } from '../context.js';

/**
 * Permission guard driven by a resource's Permission Matrix. Must run after `authenticate`.
 *
 *   requirePermission('read')               → uses req.resource (set by resolveResource)
 *   requirePermission('checkouts', 'create') → looks the resource up in the registry
 *
 * Returns 403 when `can(role, resource, action, roles)` is false, 404 for an unknown resource key.
 * @returns {import('express').RequestHandler}
 */
export function requirePermission(...args) {
  const [key, action] = args.length === 1 ? [null, args[0]] : args;

  return (req, res, next) => {
    const { config, registry } = getContext();
    const resource = key ? registry?.get(key) : req.resource;

    if (!resource) return res.status(404).json({ error: `Unknown resource "${key ?? req.params?.key}"` });
    if (!req.user || !can(req.user.role, resource.def, action, config.roles)) {
      return res.status(403).json({ error: 'Forbidden: insufficient permissions' });
    }
    if (!req.resource) req.resource = resource;
    return next();
  };
}
