/**
 * Global Express error handler (must be registered last).
 *
 * Fixes the prototype bug where `err.status` was ignored and every service 404/409
 * became a 500 (guarded by Property 11).
 */
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  if (err?.name === 'ValidationError' && err.errors) {
    const fields = Object.fromEntries(
      Object.entries(err.errors).map(([k, v]) => [k, v?.message ?? 'Invalid value'])
    );
    return res.status(400).json({ error: 'Validation failed', fields });
  }
  if (err?.code === 11000) {
    const fields = Object.fromEntries(Object.keys(err.keyValue ?? {}).map((k) => [k, 'Already exists']));
    return res.status(409).json({ error: 'Duplicate value', fields });
  }
  if (err?.name === 'CastError') {
    return res.status(404).json({ error: 'Resource not found' });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Malformed JSON' });
  }
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'Audio file too large (max 10 MB)' });
  }
  if (Number.isInteger(err?.status) && err.status >= 400 && err.status <= 599) {
    const message = typeof err.message === 'string' && err.message ? err.message : 'Request failed';
    return res.status(err.status).json({ ...(err.extra ?? {}), error: message });
  }

  if (process.env.NODE_ENV !== 'test') console.error(err);
  return res.status(500).json({ error: 'Internal server error' });
}

/** JSON 404 for unknown /api paths. */
export function apiNotFound(req, res) {
  res.status(404).json({ error: `No route for ${req.method} ${req.originalUrl}` });
}
