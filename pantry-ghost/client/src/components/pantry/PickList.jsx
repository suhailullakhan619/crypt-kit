import { Refrigerator, Snowflake, Warehouse, TriangleAlert } from 'lucide-react';
import { Badge } from '../ui/display';
import { formatDate } from '../../lib/format';
import { amount } from '../../lib/pantry';
import { humanise } from '../../lib/utils';

const ORDER = ['Fridge', 'Freezer', 'Shelf'];
const ICON = { Fridge: Refrigerator, Freezer: Snowflake, Shelf: Warehouse };

/**
 * Step 3 of Distribute (Req 5.6): the FEFO pick list grouped by location (Fridge → Freezer →
 * Shelf) with checkboxes to tick lots off while picking, plus any shortfalls.
 * @param {{ plan: { lines: object[], shortfalls: object[] }, ticked: Set<number>, onToggle: (i: number) => void }} props
 */
export function PickList({ plan, ticked, onToggle }) {
  const groups = ORDER.map((loc) => ({ loc, lines: plan.lines.map((l, i) => ({ ...l, i })).filter((l) => (l.location ?? 'Shelf') === loc) })).filter((g) => g.lines.length);

  return (
    <div className="flex flex-col gap-4">
      {plan.shortfalls.length > 0 && (
        <div role="alert" className="rounded-lg border border-warning/60 bg-warning/10 p-3 text-sm">
          <p className="flex items-center gap-2 font-semibold"><TriangleAlert className="h-4 w-4 text-warning" aria-hidden /> Not enough in stock</p>
          <ul className="mt-1 list-disc pl-6">
            {plan.shortfalls.map((s, i) => (
              <li key={i}>{humanise(s.ask.category ?? s.ask.itemName)}: {s.missing} of {s.ask.quantity} missing</li>
            ))}
          </ul>
        </div>
      )}
      {groups.length === 0 && <p className="text-sm text-muted-foreground">Nothing can be picked for this box.</p>}
      {groups.map(({ loc, lines }) => {
        const Icon = ICON[loc];
        return (
          <section key={loc} aria-label={loc}>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              <Icon className="h-4 w-4" aria-hidden /> {loc}
            </h3>
            <ul className="flex flex-col gap-1.5">
              {lines.map((l) => (
                <li key={`${l.lotId}-${l.i}`}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 hover:bg-muted/50 has-[:checked]:opacity-60">
                    <input type="checkbox" className="h-5 w-5 accent-[hsl(var(--primary))]" checked={ticked.has(l.i)} onChange={() => onToggle(l.i)} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-sm font-medium">{amount(l.quantity, l.unit)} · {l.itemName}</span>
                      <span className="text-xs text-muted-foreground">{l.expiresOn ? `Expires ${formatDate(l.expiresOn)}` : 'No expiry'}</span>
                    </span>
                    {l.status === 'ExpiringSoon' && <Badge variant="warning">Use first</Badge>}
                  </label>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
