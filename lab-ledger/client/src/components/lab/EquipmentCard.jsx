import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MapPin, CalendarClock, Gauge, UserRound, HandHelping, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, Badge } from '../ui/display';
import { Button } from '../ui/button';
import { StatusBadge } from '../resource/StatusBadge';
import { useMeta } from '../../context/MetaContext';
import { usePermission } from '../../hooks/usePermission';
import { formatDate } from '../../lib/format';
import { isLate } from '../../lib/lab';
import { CheckoutDialog } from './CheckoutDialog';
import { CheckoutActions } from './CheckoutActions';

function Fact({ icon: Icon, label, children }) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0">
        <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
        <dd className="mt-0.5 text-sm">{children}</dd>
      </div>
    </div>
  );
}

/**
 * Scan result card (lab-ledger Req 5.3): status, lab, current borrower and due back, next
 * calibration, and the actions this user may take — request when Available, approve/reject pending
 * requests and record returns for staff, cancel for the requester.
 * @param {{ data: { item: object, activeCheckout: object|null, pendingRequests: object[] } }} props
 */
export function EquipmentCard({ data }) {
  const { item, activeCheckout, pendingRequests = [] } = data;
  const meta = useMeta();
  const { can } = usePermission();
  const [requesting, setRequesting] = useState(false);
  const resource = meta.resource('equipment');
  const late = isLate(activeCheckout);
  const calDue = item.nextCalibration && new Date(item.nextCalibration) < new Date();
  const withItem = (co) => co && { ...co, equipment: item };

  return (
    <Card className="animate-fade-up">
      <CardHeader className="gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="font-mono text-sm">{item.assetTag}</Badge>
          <StatusBadge value={item.status} resource={resource} />
          {item.condition && item.condition !== 'Good' && <StatusBadge value={item.condition} />}
        </div>
        <CardTitle className="font-display text-2xl">{item.name}</CardTitle>
        {item.category && <p className="text-sm text-muted-foreground">{item.category}{item.serialNumber ? ` · S/N ${item.serialNumber}` : ''}</p>}
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Fact icon={MapPin} label="Lab">{item.lab?.name ?? '—'}{item.lab?.building ? <span className="text-muted-foreground"> · {item.lab.building}</span> : null}</Fact>
          <Fact icon={Gauge} label="Next calibration">
            {item.requiresCalibration ? (
              <span className={calDue ? 'font-medium text-destructive' : undefined}>{formatDate(item.nextCalibration)}{calDue ? ' (due)' : ''}</span>
            ) : 'Not required'}
          </Fact>
          {activeCheckout && (
            <>
              <Fact icon={UserRound} label="With">{activeCheckout.borrower?.name ?? 'Someone'}</Fact>
              <Fact icon={CalendarClock} label="Due back">
                <span className={late ? 'font-medium text-destructive' : undefined}>{formatDate(activeCheckout.dueBack)}{late ? ' — overdue' : ''}</span>
              </Fact>
            </>
          )}
        </dl>

        {item.status === 'Available' && can('checkouts', 'read') && (
          <div className="flex flex-wrap items-center gap-3 rounded-md border border-primary/40 bg-primary/10 p-3">
            <p className="flex-1 text-sm">On the shelf and ready to borrow.</p>
            <Button onClick={() => setRequesting(true)}><HandHelping className="h-4 w-4" aria-hidden /> Request checkout</Button>
          </div>
        )}

        {activeCheckout && <CheckoutActions checkout={withItem(activeCheckout)} />}

        {pendingRequests.length > 0 && (
          <section aria-label="Pending requests" className="flex flex-col gap-2">
            <h4 className="text-sm font-semibold">Pending requests</h4>
            <ul className="flex flex-col gap-2">
              {pendingRequests.map((r) => (
                <li key={r._id} className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 text-sm">
                    <p className="font-medium">{r.borrower?.name ?? 'You'} <span className="font-normal text-muted-foreground">· until {formatDate(r.dueBack)}</span></p>
                    {r.purpose && <p className="truncate text-muted-foreground">{r.purpose}</p>}
                  </div>
                  <CheckoutActions checkout={withItem(r)} />
                </li>
              ))}
            </ul>
          </section>
        )}

        <Link to={`/r/equipment/${item._id}`} className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
          Full record and history <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </CardContent>
      {requesting && <CheckoutDialog item={item} open={requesting} onOpenChange={setRequesting} />}
    </Card>
  );
}
