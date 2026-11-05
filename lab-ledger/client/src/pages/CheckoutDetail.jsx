import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, HandHelping } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { useMeta } from '../context/MetaContext';
import { getRecord, recordActivity } from '../api/resources';
import { PageHeader } from '../components/layout/AppShell';
import { Card, CardContent, CardHeader, CardTitle, Skeleton } from '../components/ui/display';
import { StatusBadge } from '../components/resource/StatusBadge';
import { ActivityTimeline } from '../components/resource/ActivityTimeline';
import { EmptyCrypt } from '../components/spooky';
import { CheckoutActions } from '../components/lab/CheckoutActions';
import { displayValue, formatDateTime } from '../lib/format';
import { isLate } from '../lib/lab';

/**
 * Checkout detail (replaces the generic /r/checkouts/:id page): the loan's fields from meta plus the
 * workflow actions this user may take — Approve/Reject, Record return, Cancel (lab-ledger Req 3.1–3.6).
 * Checkouts have no generic Edit or status buttons: every change goes through the workflow.
 */
export default function CheckoutDetail() {
  const { id } = useParams();
  const api = useApi();
  const meta = useMeta();
  const resource = meta.resource('checkouts');
  const record = useQuery({ queryKey: ['r', 'checkouts', id], queryFn: () => getRecord(api, 'checkouts', id), enabled: !!resource });
  const activity = useQuery({ queryKey: ['activity', 'checkouts', id], queryFn: () => recordActivity(api, 'checkouts', id), enabled: !!resource });

  if (meta.loading || record.isLoading) {
    return <div className="flex flex-col gap-4"><Skeleton className="h-10 w-72" /><Skeleton className="h-64 w-full" /></div>;
  }
  if (!resource || record.isError) {
    return <EmptyCrypt title="This checkout has vanished">It may have been removed, or you may not have access.</EmptyCrypt>;
  }

  const co = record.data;
  const late = isLate(co);
  const fields = resource.fields.filter((f) => f.name !== 'status' && co[f.name] !== undefined && co[f.name] !== null && co[f.name] !== '');

  return (
    <div>
      <Link to="/r/checkouts" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden /> {resource.label}
      </Link>
      <PageHeader
        icon={<HandHelping className="h-6 w-6 text-primary" />}
        title={displayValue({ type: 'ref' }, co.equipment)}
        description={<span className="flex flex-wrap items-center gap-2"><StatusBadge value={co.status} resource={resource} /><span>Requested {formatDateTime(co.createdAt)}{co.borrower?.name ? ` by ${co.borrower.name}` : ''}</span></span>}
      />

      <Card className={late ? 'mb-4 border-destructive/60 bg-destructive/5 p-4' : 'mb-4 p-4'}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm">
            {co.status === 'Requested' && 'Waiting for a technician to approve.'}
            {co.status === 'Active' && `Out on loan until ${displayValue({ type: 'date' }, co.dueBack)}.`}
            {co.status === 'Overdue' && <span className="font-medium text-destructive">Overdue since {displayValue({ type: 'date' }, co.dueBack)} — chase the borrower or record the return.</span>}
            {co.status === 'Returned' && `Returned ${displayValue({ type: 'date' }, co.returnedAt)} in ${String(co.returnCondition ?? '').toLowerCase() || 'unknown'} condition.`}
            {co.status === 'Rejected' && `Rejected: ${co.rejectReason ?? 'no reason given'}.`}
            {co.status === 'Cancelled' && 'Cancelled by the requester.'}
          </p>
          <CheckoutActions checkout={co} />
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Details</CardTitle></CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
              {fields.map((f) => (
                <div key={f.name} className={f.type === 'text' ? 'sm:col-span-2' : ''}>
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{f.label}</dt>
                  <dd className="mt-1 whitespace-pre-wrap break-words text-sm">{displayValue(f, co[f.name])}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>History</CardTitle></CardHeader>
          <CardContent>{activity.isLoading ? <Skeleton className="h-32 w-full" /> : <ActivityTimeline items={activity.data} />}</CardContent>
        </Card>
      </div>
    </div>
  );
}
