/**
 * requireRole(...roles) — allows the request only if `req.user.role` is listed.
 * Must run after `authenticate`. Returns 403 otherwise.
 *
 * @param {...string} roles
 * @returns {import('express').RequestHandler}
 */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden: insufficient permissions' });
    }
    return next();
  };
}
