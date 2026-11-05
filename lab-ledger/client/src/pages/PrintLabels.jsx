import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Printer, Search } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { useMeta } from '../context/MetaContext';
import { useAuth } from '../context/AuthContext';
import { usePermission } from '../hooks/usePermission';
import { listRecords } from '../api/resources';
import { PageHeader } from '../components/layout/AppShell';
import { Card, Skeleton, Table, THead, TBody, TR, TH, TD } from '../components/ui/display';
import { Button } from '../components/ui/button';
import { Input, Label } from '../components/ui/input';
import { ResourceFilters } from '../components/resource/ResourceFilters';
import { StatusBadge } from '../components/resource/StatusBadge';
import { EmptyCrypt } from '../components/spooky';
import { LabelPrintButton } from '../components/lab/LabelPrintButton';
import { isStaff } from '../lib/lab';

const PAGE = 50;

/**
 * Equipment list with row selection → QR label PDF (lab-ledger Req 5.1). The generic ResourceList is
 * Core and has no selection, so label printing lives on this staff page (sidebar: "Print labels").
 */
export default function PrintLabels() {
  const api = useApi();
  const meta = useMeta();
  const { user } = useAuth();
  const { isSuperuser } = usePermission();
  const resource = meta.resource('equipment');
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({});
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(() => new Map()); // id → label text

  useEffect(() => { const t = setTimeout(() => { setSearch(q); setPage(1); }, 300); return () => clearTimeout(t); }, [q]);

  const params = useMemo(() => ({ ...filters, ...(search ? { q: search } : {}), page, limit: PAGE, sort: 'assetTag' }), [filters, search, page]);
  const list = useQuery({ queryKey: ['r', 'equipment', 'labels', params], queryFn: () => listRecords(api, 'equipment', params), enabled: !!resource, placeholderData: keepPreviousData });

  if (meta.loading) return <Skeleton className="h-64 w-full" />;
  if (!resource || !(isSuperuser || isStaff(user?.role))) {
    return <EmptyCrypt title="Label printing is for lab staff">Ask a technician to print labels.</EmptyCrypt>;
  }

  const items = list.data?.items ?? [];
  const allOnPage = items.length > 0 && items.every((e) => selected.has(e._id));
  const toggle = (e) => setSelected((prev) => { const next = new Map(prev); if (next.has(e._id)) next.delete(e._id); else next.set(e._id, e.assetTag); return next; });
  const togglePage = () => setSelected((prev) => {
    const next = new Map(prev);
    for (const e of items) { if (allOnPage) next.delete(e._id); else next.set(e._id, e.assetTag); }
    return next;
  });

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Print labels"
        description="Select equipment, then download an A4 sheet of QR labels (24 per page)."
        icon={<Printer className="h-6 w-6 text-primary" />}
        actions={<LabelPrintButton ids={[...selected.keys()]} />}
      />

      <Card className="flex flex-wrap items-end gap-3 p-4">
        <div className="flex min-w-[12rem] flex-[2] flex-col gap-1.5">
          <Label htmlFor="label-search" className="text-xs text-muted-foreground">Search</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input id="label-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, tag or serial…" className="pl-9" />
          </div>
        </div>
        <ResourceFilters resource={resource} values={filters} onChange={(v) => { setFilters(v); setPage(1); }} idPrefix="label-filter" />
        {selected.size > 0 && <Button variant="ghost" size="sm" onClick={() => setSelected(new Map())}>Clear {selected.size} selected</Button>}
      </Card>

      <Card>
        {list.isLoading ? (
          <div className="flex flex-col gap-3 p-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
        ) : !items.length ? (
          <EmptyCrypt title="No equipment matches">Try loosening the filters or the search.</EmptyCrypt>
        ) : (
          <Table>
            <THead>
              <TR className="hover:bg-transparent">
                <TH className="w-10">
                  <input type="checkbox" className="h-4 w-4 accent-[hsl(var(--primary))]" checked={allOnPage} onChange={togglePage} aria-label="Select every item on this page" />
                </TH>
                <TH>Asset tag</TH><TH>Name</TH><TH className="hidden sm:table-cell">Lab</TH><TH className="hidden md:table-cell">Status</TH>
              </TR>
            </THead>
            <TBody>
              {items.map((e) => (
                <TR key={e._id} className={selected.has(e._id) ? 'bg-primary/5' : undefined}>
                  <TD>
                    <input type="checkbox" className="h-4 w-4 accent-[hsl(var(--primary))]" checked={selected.has(e._id)} onChange={() => toggle(e)} aria-label={`Select ${e.assetTag} ${e.name}`} />
                  </TD>
                  <TD className="font-mono text-xs">{e.assetTag}</TD>
                  <TD><Link to={`/scan/${e.assetTag}`} className="font-medium hover:text-primary hover:underline">{e.name}</Link></TD>
                  <TD className="hidden text-muted-foreground sm:table-cell">{e.lab?.name ?? '—'}</TD>
                  <TD className="hidden md:table-cell"><StatusBadge value={e.status} resource={resource} /></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      {list.data?.pages > 1 && (
        <nav aria-label="Pagination" className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Page {list.data.page} of {list.data.pages}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={page >= list.data.pages} onClick={() => setPage(page + 1)}>Next</Button>
          </div>
        </nav>
      )}
    </div>
  );
}
