import { render } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../context/AuthContext';
import { MetaProvider } from '../context/MetaContext';

/** Builds an unsigned JWT-shaped token the client can decode (the server is mocked in tests). */
export function fakeToken({ role = 'Viewer', name = 'Tess Tester', userId = 'u1' } = {}) {
  const b64 = (o) => btoa(JSON.stringify(o)).replace(/=+$/, '');
  return `${b64({ alg: 'none' })}.${b64({ userId, role, name, exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`;
}

export function signIn(opts) {
  localStorage.setItem('crypt_token', fakeToken(opts));
}

/**
 * Renders `element` at `path` with router, React Query, auth and (optionally) meta providers.
 */
export function renderAt(element, { path = '/', route = '/', withMeta = true, extraRoutes = null } = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const content = withMeta ? <MetaProvider>{element}</MetaProvider> : element;
  return render(
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <MemoryRouter initialEntries={[route]}>
          <Routes>
            <Route path={path} element={content} />
            {extraRoutes}
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
