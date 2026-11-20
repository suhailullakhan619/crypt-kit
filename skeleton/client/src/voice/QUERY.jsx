import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Badge } from '../components/ui/display';
import { StatusBadge } from '../components/resource/StatusBadge';
import { useMeta } from '../context/MetaContext';
import { formatDate } from '../lib/format';

/**
 * Rich answer for the chat assistant (intents QUERY, OVERVIEW, LOOKUP and ASSISTANT): the records it
 * found as links to their pages, per-resource counts for overviews, and the details of a looked-up item.
 */
const recordHref = (key, id) => `/r/${key}/${id}`;

function Items({ items, fallbackKey, label = 'Matching records' }) {
  const meta = useMeta();
  if (!items?.length) return null;
  return (
    <ul className="flex flex-col gap-2" aria-label={label}>
      {items.map((it) => {
        const key = it.key ?? fallbackKey;
        const resource = meta.resource?.(key);
        return (
          <li key={`${key}-${it._id}`}>
            <Link to={recordHref(key, it._id)} className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors hover:border-primary/60 hover:bg-muted/40">
              {it.code && <span className="font-mono text-xs text-muted-foreground">{it.code}</span>}
              <span className="font-medium">{it.title}</span>
              {it.label && it.key && <span className="text-xs text-muted-foreground">{it.label}</span>}
              <span className="ml-auto flex items-center gap-2">
                {it.due && <span className="text-xs text-muted-foreground">due {formatDate(it.due)}</span>}
                {it.status && <StatusBadge value={it.status} resource={resource} />}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function Overview({ data }) {
  const rows = (data.rows ?? []).filter((r) => r.overdue || r.dueSoon);
  return (
    <div className="flex flex-col gap-3">
      {rows.length > 0 && (
        <ul className="flex flex-col gap-1.5" aria-label="By area">
          {rows.map((r) => (
            <li key={r.key}>
              <Link to={`/r/${r.key}`} className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm hover:border-primary/60">
                <span className="font-medium">{r.label}</span>
                <span className="ml-auto flex gap-2">
                  <Badge variant={r.overdue ? 'destructive' : 'muted'}>{r.overdue} overdue</Badge>
                  <Badge variant={r.dueSoon ? 'warning' : 'muted'}>{r.dueSoon} due this week</Badge>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Items items={data.items} label="Most urgent" />
    </div>
  );
}

function Lookup({ data }) {
  if (!data.found) return null;
  return (
    <div className="flex flex-col gap-3">
      <Link to={recordHref(data.key, data._id)} className="inline-flex w-fit items-center gap-1 text-sm font-medium text-primary hover:underline">
        Open {data.code ?? data.title} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
      </Link>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
        {data.details.map((d) => (
          <div key={d.label}>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">{d.label}</dt>
            <dd className="text-sm">{d.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** @param {{ result: { intent: string, data: any } }} props */
export default function QueryAnswer({ result }) {
  const data = result?.data;
  if (!data) return null;
  if (data.kind === 'overview') return <Overview data={data} />;
  if (data.kind === 'lookup') return <Lookup data={data} />;
  if (data.kind === 'across') {
    return (
      <div className="flex flex-col gap-3">
        <Items items={data.items} />
        {data.rows?.length > 0 && (
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {data.rows.map((r) => <Link key={r.key} to={r.link ?? `/r/${r.key}`} className="text-primary hover:underline">See all {r.total} in {r.label}</Link>)}
          </p>
        )}
      </div>
    );
  }
  if (data.kind === 'query') {
    if (!data.items?.length && !(data.link && data.total > 0)) return null; // a plain 0 needs no card
    return (
      <div className="flex flex-col gap-3">
        <Items items={data.items} fallbackKey={data.resource} />
        {data.link && data.total > 0 && (
          <Link to={data.link} className="inline-flex w-fit items-center gap-1 text-sm font-medium text-primary hover:underline">
            See {data.hasMore ? `all ${data.total}` : 'them'} in {data.label} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        )}
      </div>
    );
  }
  return null;
}
