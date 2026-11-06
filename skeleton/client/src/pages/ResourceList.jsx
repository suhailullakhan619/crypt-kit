import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Plus, Search, ChevronLeft, ChevronRight, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { useApi } from '../hooks/useApi';
import { useMeta } from '../context/MetaContext';
import { usePermission } from '../hooks/usePermission';
import { listRecords } from '../api/resources';
import { PageHeader } from '../components/layout/AppShell';
import { Card, Skeleton } from '../components/ui/display';
import { Input, Label } from '../components/ui/input';
import { Button, buttonVariants } from '../components/ui/button';
import { ResourceFilters } from '../components/resource/ResourceFilters';
import { ResourceTable } from '../components/resource/ResourceTable';
import { ResourceIcon, EmptyCrypt } from '../components/spooky';
import NotFound from './NotFound';
import { bulkActions } from '../appRoutes';
import { errorMessage } from '../lib/utils';

const RESERVED = ['page', 'q'];

/** Records list: search, filters, pagination, permission-gated Create (Req 13.3). State lives in the URL. */
export default function ResourceList() {
  const { key } = useParams();
  const api = useApi();
  const meta = useMeta();
  const { can, role, isSuperuser } = usePermission();
  const resource = meta.resource(key);
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const [selected, setSelected] = useState(() => new Set());
  const [running, setRunning] = useState(null);
  const actions = (bulkActions[key] ?? []).filter((a) => !a.roles || isSuperuser || a.roles.includes(role));

  // Selection is per resource; clear it when switching lists.
  useEffect(() => setSelected(new Set()), [key]);

  const page = Number(params.get('page') ?? 1);
  const filters = useMemo(() => Object.fromEntries([...params.entries()].filter(([k]) => !RESERVED.includes(k))), [params]);

  // Debounced search → URL
  useEffect(() => {
    const t = setTimeout(() => {
      const next = new URLSearchParams(params);
      if (q) next.set('q', q); else next.delete('q');
      if ((params.get('q') ?? '') !== q) { next.delete('page'); setParams(next, { replace: true }); }
    }, 300);
    return () => clearTimeout(t);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['r', key, Object.fromEntries(params)],
    queryFn: () => listRecords(api, key, { ...Object.fromEntries(params), limit: 20 }),
    enabled: !!resource,
    placeholderData: keepPreviousData,
  });

  if (meta.loading) return <Skeleton className="h-64 w-full" />;
  if (!resource) return <NotFound />;

  const setFilters = (next) => {
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    for (const [k, v] of Object.entries(next)) if (v) p.set(k, v);
    setParams(p);
  };
  const goto = (n) => { const p = new URLSearchParams(params); p.set('page', String(n)); setParams(p); };
  const activeFilters = Object.values(filters).some(Boolean);
  const selectedItems = (data?.items ?? []).filter((i) => selected.has(i._id));

  const runAction = async (action) => {
    setRunning(action.label);
    try {
      const msg = await action.run({ api, ids: [...selected], items: selectedItems });
      if (typeof msg === 'string') toast.success(msg);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setRunning(null);
    }
  };

  return (
    <div>
      <PageHeader
        icon={<ResourceIcon name={resource.icon} className="h-6 w-6 text-primary" />}
        title={resource.label}
        description={data ? `${data.total} record${data.total === 1 ? '' : 's'}` : ' '}
        actions={can(key, 'create') && (
          <Link to={`/r/${key}/new`} className={buttonVariants()}>
            <Plus className="h-4 w-4" aria-hidden /> New {resource.label.replace(/s$/, '').toLowerCase()}
          </Link>
        )}
      />

      <Card className="mb-4 flex flex-wrap items-end gap-3 p-4">
        {resource.searchable && (
          <div className="flex min-w-[12rem] flex-[2] flex-col gap-1.5">
            <Label htmlFor="search" className="text-xs text-muted-foreground">Search</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input id="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${resource.label.toLowerCase()}…`} className="pl-9" />
            </div>
          </div>
        )}
        <ResourceFilters resource={resource} values={filters} onChange={setFilters} />
        {activeFilters && (
          <Button variant="ghost" size="sm" onClick={() => setFilters({})}><X className="h-4 w-4" aria-hidden /> Clear</Button>
        )}
      </Card>

      {actions.length > 0 && selected.size > 0 && (
        <Card role="region" aria-label="Bulk actions" className="sticky top-16 z-20 mb-3 flex flex-wrap items-center gap-2 border-primary/40 bg-card/95 p-3 backdrop-blur">
          <span className="mr-1 text-sm font-medium">{selected.size} selected</span>
          {actions.map((a) => (
            <Button key={a.label} size="sm" disabled={!!running} onClick={() => runAction(a)}>
              {a.icon && <ResourceIcon name={a.icon} />} {running === a.label ? 'Working…' : a.label}
            </Button>
          ))}
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}><X className="h-4 w-4" aria-hidden /> Clear selection</Button>
        </Card>
      )}

      <Card className={isFetching && !isLoading ? 'opacity-70 transition-opacity' : ''}>
        {isLoading ? (
          <div className="flex flex-col gap-3 p-4">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
        ) : data.items.length === 0 ? (
          <EmptyCrypt
            title={activeFilters || q ? 'No records match' : 'Nothing lurking here yet'}
            action={can(key, 'create') && !activeFilters && !q && <Link to={`/r/${key}/new`} className={buttonVariants({ variant: 'secondary' })}>Create the first one</Link>}
          >
            {activeFilters || q ? 'Try loosening the filters or the search.' : `No ${resource.label.toLowerCase()} have been summoned.`}
          </EmptyCrypt>
        ) : (
          <div className="p-2 md:p-0">
            <ResourceTable
              resource={resource}
              items={data.items}
              {...(actions.length ? { selected, onSelectedChange: setSelected } : {})}
            />
          </div>
        )}
      </Card>

      {data && data.pages > 1 && (
        <nav aria-label="Pagination" className="mt-4 flex items-center justify-between gap-2 text-sm">
          <span className="text-muted-foreground">Page {data.page} of {data.pages}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => goto(page - 1)}><ChevronLeft className="h-4 w-4" aria-hidden /> Previous</Button>
            <Button variant="outline" size="sm" disabled={page >= data.pages} onClick={() => goto(page + 1)}>Next <ChevronRight className="h-4 w-4" aria-hidden /></Button>
          </div>
        </nav>
      )}
    </div>
  );
}
