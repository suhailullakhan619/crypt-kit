import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { ClipboardList, ScanLine } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { useMeta } from '../context/MetaContext';
import { myCheckouts } from '../api/lab';
import { PageHeader } from '../components/layout/AppShell';
import { Card, Skeleton } from '../components/ui/display';
import { Button, buttonVariants } from '../components/ui/button';
import { StatusBadge } from '../components/resource/StatusBadge';
import { EmptyCrypt } from '../components/spooky';
import { CheckoutActions } from '../components/lab/CheckoutActions';
import { formatDate } from '../lib/format';
import { isLate } from '../lib/lab';
import { cn } from '../lib/utils';

const TABS = [
  { key: 'current', label: 'Current', status: 'Requested,Active,Overdue' },
  { key: 'history', label: 'History', status: 'Returned,Rejected,Cancelled' },
];

/** The signed-in user's loans and requests (lab-ledger Req 3.1, 3.6). */
export default function MyCheckouts() {
  const api = useApi();
  const meta = useMeta();
  const [tab, setTab] = useState('current');
  const [page, setPage] = useState(1);
  const status = TABS.find((t) => t.key === tab).status;
  const q = useQuery({
    queryKey: ['lab', 'mine', tab, page],
    queryFn: () => myCheckouts(api, { status, page, limit: 20 }),
    placeholderData: keepPreviousData,
  });
  const resource = meta.resource('checkouts');

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="My checkouts"
        description="What you have borrowed, what you asked for, and when it is due back."
        icon={<ClipboardList className="h-6 w-6 text-primary" />}
        actions={<Link to="/scan" className={buttonVariants({ variant: 'secondary' })}><ScanLine className="h-4 w-4" aria-hidden /> Scan to borrow</Link>}
      />

      <div role="tablist" aria-label="Checkout list" className="flex gap-1 rounded-lg border bg-card p-1 sm:w-fit">
        {TABS.map((t) => (
          <button key={t.key} role="tab" type="button" aria-selected={tab === t.key}
            onClick={() => { setTab(t.key); setPage(1); }}
            className={cn('flex-1 rounded-md px-4 py-1.5 text-sm font-medium transition-colors sm:flex-none', tab === t.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}>
            {t.label}
          </button>
        ))}
      </div>

      {q.isLoading ? (
        <div className="flex flex-col gap-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
      ) : !q.data?.items.length ? (
        <Card>
          <EmptyCrypt title={tab === 'current' ? 'Nothing on loan' : 'No history yet'}
            action={tab === 'current' && <Link to="/scan" className={buttonVariants()}>Find something to borrow</Link>}>
            {tab === 'current' ? 'Scan a label on the bench to request an item.' : 'Returned, rejected and cancelled loans show up here.'}
          </EmptyCrypt>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {q.data.items.map((co) => {
            const late = isLate(co);
            return (
              <li key={co._id}>
                <Card className={cn('flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between', late && 'border-destructive/60 bg-destructive/5')}>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge value={co.status} resource={resource} />
                      {co.equipment?.assetTag && <span className="font-mono text-xs text-muted-foreground">{co.equipment.assetTag}</span>}
                    </div>
                    <p className="mt-1 truncate font-medium">
                      {co.equipment?.assetTag ? <Link to={`/scan/${co.equipment.assetTag}`} className="hover:text-primary hover:underline">{co.equipment.name}</Link> : co.equipment?.name ?? 'Unknown item'}
                    </p>
                    <p className={cn('text-sm', late ? 'font-medium text-destructive' : 'text-muted-foreground')}>
                      {co.status === 'Returned' ? `Returned ${formatDate(co.returnedAt)}` : `Due back ${formatDate(co.dueBack)}`}
                      {late ? ' — overdue, please return it' : ''}
                      {co.equipment?.lab?.name ? ` · ${co.equipment.lab.name}` : ''}
                    </p>
                    {co.status === 'Rejected' && co.rejectReason && <p className="text-sm text-muted-foreground">Reason: {co.rejectReason}</p>}
                  </div>
                  <CheckoutActions checkout={co} />
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {q.data?.pages > 1 && (
        <nav aria-label="Pagination" className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Page {q.data.page} of {q.data.pages}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={page >= q.data.pages} onClick={() => setPage(page + 1)}>Next</Button>
          </div>
        </nav>
      )}
    </div>
  );
}
