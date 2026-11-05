import { getContext } from '../context.js';

/**
 * Resolves `:key` to a registered resource and sets `req.resource`. 404 for unknown keys (Req 5.2).
 */
export function resolveResource(req, res, next) {
  const resource = getContext().registry?.get(req.params.key);
  if (!resource) return res.status(404).json({ error: `Unknown resource "${req.params.key}"` });
  req.resource = resource;
  return next();
}
