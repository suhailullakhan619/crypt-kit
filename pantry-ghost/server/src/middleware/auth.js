import jwt from 'jsonwebtoken';
import { getEnv } from '../config/env.js';

/**
 * authenticate middleware
 *
 * Reads `Authorization: Bearer <token>`, verifies the JWT (HS256 only) and attaches
 * `req.user = { userId, role, name }`. Returns 401 when the header is missing,
 * malformed, or the token is invalid/expired.
 */
export function authenticate(req, res, next) {
  const header = req.headers?.authorization;

  if (typeof header !== 'string' || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' });
  }

  const token = header.slice(7).trim();

  try {
    const payload = jwt.verify(token, getEnv().JWT_SECRET, { algorithms: ['HS256'] });
    if (!payload || typeof payload !== 'object' || !payload.userId || !payload.role) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    req.user = { userId: String(payload.userId), role: payload.role, name: payload.name ?? null };
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}
