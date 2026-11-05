import { Link } from 'react-router-dom';
import { AlarmClock } from 'lucide-react';
import { Badge, Table, THead, TBody, TR, TH, TD } from '../components/ui/display';
import { formatDate } from '../lib/format';
import { cn } from '../lib/utils';

/**
 * "Out right now" dashboard panel (lab-ledger Req 7.1): who has what and when it is due back,
 * overdue loans first and highlighted. Data from server/src/dashboard/outNow.js.
 */
export default function OutNow({ data }) {
  const rows = data?.rows ?? [];
  if (!rows.length) return <p className="text-sm text-muted-foreground">Every instrument is on its shelf. Suspiciously tidy.</p>;
  return (
    <div className="flex flex-col gap-3">
      <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span>{data.total} out on loan</span>
        {data.overdue > 0 && <Badge variant="destructive"><AlarmClock className="h-3 w-3" aria-hidden /> {data.overdue} overdue</Badge>}
      </p>
      <Table aria-label="Equipment out on loan">
        <THead>
          <TR className="hover:bg-transparent"><TH>Item</TH><TH>Borrower</TH><TH>Due back</TH></TR>
        </THead>
        <TBody>
          {rows.map((r) => (
            <TR key={r._id} data-overdue={r.overdue || undefined} className={cn(r.overdue && 'bg-destructive/10 hover:bg-destructive/15')}>
              <TD>
                <Link to={`/r/checkouts/${r._id}`} className="font-medium hover:text-primary hover:underline">{r.item}</Link>
                {r.assetTag && <span className="ml-2 font-mono text-xs text-muted-foreground">{r.assetTag}</span>}
              </TD>
              <TD>{r.borrower}</TD>
              <TD className="whitespace-nowrap">
                {r.overdue ? (
                  <span className="inline-flex items-center gap-1.5 font-medium text-destructive">
                    <AlarmClock className="h-3.5 w-3.5" aria-hidden /> {formatDate(r.dueBack)} <span className="sr-only">(overdue)</span>
                    <Badge variant="destructive" aria-hidden>Overdue</Badge>
                  </span>
                ) : formatDate(r.dueBack)}
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
      {data.total > rows.length && <Link to="/r/checkouts?status=Active" className="text-sm text-primary hover:underline">See all {data.total} loans</Link>}
    </div>
  );
}
