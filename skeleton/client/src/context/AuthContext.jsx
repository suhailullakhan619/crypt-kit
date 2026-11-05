import { createContext, useCallback, useContext, useMemo, useState } from 'react';

const TOKEN_KEY = 'crypt_token';

/** Decodes a JWT payload without verifying it (the server verifies). Null when malformed. */
export function decodeToken(token) {
  try {
    const part = token.split('.')[1];
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(decodeURIComponent(escape(json)));
  } catch {
    return null;
  }
}

/** `{ userId, role, name, exp }` or null when missing/expired. */
export function userFromToken(token, now = Date.now()) {
  const p = token ? decodeToken(token) : null;
  if (!p?.role || !p?.userId) return null;
  if (p.exp && p.exp * 1000 <= now) return null;
  return { userId: p.userId, role: p.role, name: p.name ?? null, exp: p.exp ?? null };
}

function readStored() {
  try {
    const t = localStorage.getItem(TOKEN_KEY);
    return userFromToken(t) ? t : null;
  } catch {
    return null;
  }
}

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(readStored);
  const user = useMemo(() => userFromToken(token), [token]);

  const login = useCallback((next) => {
    try { localStorage.setItem(TOKEN_KEY, next); } catch { /* private mode */ }
    setToken(next);
  }, []);

  const logout = useCallback(() => {
    try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
    setToken(null);
  }, []);

  const value = useMemo(() => ({ token, user, login, logout }), [token, user, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
