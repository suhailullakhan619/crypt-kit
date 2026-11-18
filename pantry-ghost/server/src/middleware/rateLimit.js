/**
 * Minimal in-memory fixed-window rate limiter (no dependency). Keyed by client IP plus an
 * optional extra key (e.g. the login email), so one attacker cannot lock out everyone.
 *
 * @param {{ windowMs?: number, max?: number, keyFn?: (req) => string, message?: string,
 *           now?: () => number }} [opts]
 * @returns {import('express').RequestHandler & { reset: () => void }}
 */
export function rateLimit({ windowMs = 15 * 60 * 1000, max = 10, keyFn, message, now = Date.now } = {}) {
  const hits = new Map();

  const middleware = (req, res, next) => {
    const t = now();
    const key = `${req.ip}|${keyFn ? keyFn(req) : ''}`;
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= t) {
      entry = { count: 0, resetAt: t + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;

    // Opportunistic cleanup so the map cannot grow without bound.
    if (hits.size > 5000) for (const [k, e] of hits) if (e.resetAt <= t) hits.delete(k);

    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - entry.count)));
    if (entry.count > max) {
      const retryAfter = Math.max(1, Math.ceil((entry.resetAt - t) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({ error: message ?? `Too many attempts. Try again in ${retryAfter} seconds.` });
    }
    return next();
  };

  middleware.reset = () => hits.clear();
  return middleware;
}

export default rateLimit;
