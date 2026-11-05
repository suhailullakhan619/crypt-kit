import { Plus, Pencil, Trash2, ArrowRightLeft } from 'lucide-react';
import { formatDateTime, timeAgo } from '../../lib/format';
import { humanise } from '../../lib/utils';

const ICONS = { create: Plus, update: Pencil, delete: Trash2, status: ArrowRightLeft };
const VERB = { create: 'created this', update: 'updated', delete: 'archived this', status: 'changed status' };

function describe(entry) {
  const diff = entry.diff ?? {};
  if (entry.action === 'status') {
    const [, [from, to] = []] = Object.entries(diff)[0] ?? [];
    return from || to ? <>moved it from <b>{humanise(from ?? '—')}</b> to <b>{humanise(to ?? '—')}</b></> : 'changed status';
  }
  if (entry.action === 'update') {
    const keys = Object.keys(diff);
    return keys.length ? <>updated {keys.map(humanise).join(', ')}</> : 'saved without changes';
  }
  return VERB[entry.action];
}

/**
 * Drops 'update' entries that only changed the status when a matching 'status' entry for the
 * same record exists — the status entry already says it better ("moved it from A to B").
 */
export function collapseStatusUpdates(items = []) {
  return items.filter((e) => {
    if (e.action !== 'update') return true;
    const keys = Object.keys(e.diff ?? {});
    if (keys.length !== 1) return true;
    return !items.some((s) => s.action === 'status' && s.recordId === e.recordId && Object.keys(s.diff ?? {})[0] === keys[0]
      && Math.abs(new Date(s.at) - new Date(e.at)) < 5000);
  });
}

/** Record history newest-first (Req 6.2, 13.5). */
export function ActivityTimeline({ items }) {
  const shown = collapseStatusUpdates(items);
  if (!shown.length) return <p className="text-sm text-muted-foreground">No history yet.</p>;
  return (
    <ol className="relative flex flex-col gap-4 border-l pl-6">
      {shown.map((e) => {
        const Icon = ICONS[e.action] ?? Pencil;
        return (
          <li key={e._id} className="relative">
            <span className="absolute -left-[33px] grid h-6 w-6 place-items-center rounded-full border bg-card">
              <Icon className="h-3 w-3 text-primary" aria-hidden />
            </span>
            <p className="text-sm">
              <span className="font-medium">{e.actorName ?? 'Someone'}</span> {describe(e)}
            </p>
            <time dateTime={e.at} title={formatDateTime(e.at)} className="text-xs text-muted-foreground">{timeAgo(e.at)}</time>
          </li>
        );
      })}
    </ol>
  );
}
