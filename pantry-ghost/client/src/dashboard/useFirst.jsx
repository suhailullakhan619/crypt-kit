import { Link } from 'react-router-dom';
import { Refrigerator, Snowflake, Warehouse } from 'lucide-react';
import { Logo } from '../components/spooky';
import { amount, expiresIn } from '../lib/pantry';
import { cn } from '../lib/utils';

const ICON = { Fridge: Refrigerator, Freezer: Snowflake, Shelf: Warehouse };

/** Lantern glow grows as expiry nears (static shadow; the pulse is motion-safe only). */
function glow(daysLeft) {
  const d = Math.max(0, Math.min(daysLeft ?? 30, 14));
  const strength = 0.55 - d * 0.035;
  return { boxShadow: `0 0 ${10 + (14 - d) * 1.5}px hsl(var(--primary) / ${Math.max(0.08, strength).toFixed(2)})` };
}

/**
 * "Use first" dashboard panel (Req 3.3): ExpiringSoon lots, soonest first, with quantity and
 * location. Server: server/src/dashboard/useFirst.js.
 */
export default function UseFirstPanel({ data }) {
  const items = data?.items ?? [];
  if (!items.length) {
    return (
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Logo className="h-10 w-10" /> Nothing needs using first. The lantern is dim — in a good way.
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Lots to use first">
        {items.map((l) => {
          const Icon = ICON[l.location] ?? Warehouse;
          return (
            <li key={l._id} style={glow(l.daysLeft)}
              className={cn('flex flex-col gap-1 rounded-lg border border-primary/40 bg-card p-3', l.daysLeft !== null && l.daysLeft <= 0 && 'motion-safe:animate-pulse-glow')}>
              <Link to={`/r/stock-lots/${l._id}`} className="truncate font-medium hover:text-primary">{l.itemName}</Link>
              <span className="text-sm tabular-nums">{amount(l.quantity, l.unit)}</span>
              <span className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><Icon className="h-3.5 w-3.5" aria-hidden /> {l.location}</span>
                <span className={cn(l.daysLeft !== null && l.daysLeft <= 1 && 'font-semibold text-warning')}>{expiresIn(l.expiresOn)}</span>
              </span>
            </li>
          );
        })}
      </ul>
      {data.total > items.length && <p className="text-xs text-muted-foreground">…and {data.total - items.length} more expiring soon.</p>}
    </div>
  );
}
