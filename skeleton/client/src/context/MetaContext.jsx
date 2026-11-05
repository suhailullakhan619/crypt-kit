import { createContext, useContext, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useApi } from '../hooks/useApi';
import { meta as fetchMeta, publicMeta as fetchPublicMeta } from '../api/meta';

const MetaContext = createContext(null);

/**
 * Loads /api/meta for the signed-in user (resources, roles, permissions) — the client never
 * hard-codes resource fields (Req 7, steering).
 */
export function MetaProvider({ children }) {
  const api = useApi();
  const query = useQuery({ queryKey: ['meta'], queryFn: () => fetchMeta(api), staleTime: 60_000 });

  const value = useMemo(() => {
    const data = query.data;
    const byKey = Object.fromEntries((data?.resources ?? []).map((r) => [r.key, r]));
    return {
      loading: query.isLoading,
      error: query.error,
      appName: data?.appName ?? '',
      roles: data?.roles ?? [],
      superuserRole: data?.superuserRole ?? null,
      resources: data?.resources ?? [],
      resource: (key) => byKey[key] ?? null,
    };
  }, [query.data, query.isLoading, query.error]);

  return <MetaContext.Provider value={value}>{children}</MetaContext.Provider>;
}

export function useMeta() {
  const ctx = useContext(MetaContext);
  if (!ctx) throw new Error('useMeta must be used within a MetaProvider');
  return ctx;
}

/** Public meta (app name, theme, demo users) — usable before login. */
export function usePublicMeta() {
  const api = useApi();
  return useQuery({ queryKey: ['meta', 'public'], queryFn: () => fetchPublicMeta(api), staleTime: 300_000 });
}
