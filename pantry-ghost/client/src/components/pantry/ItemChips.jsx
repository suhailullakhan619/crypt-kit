import { Minus, Plus, TriangleAlert } from 'lucide-react';
import { Button } from '../ui/button';
import { cn, humanise } from '../../lib/utils';
import { dietaryWarnings } from '../../lib/pantry';

/**
 * Step 2 of Distribute (Req 5.6): one chip per category with − / + quantity, plus gentle
 * warnings for the household's dietary needs (e.g. NutAllergy on Dry goods).
 * @param {{ categories: string[], items: Record<string, number>, onChange: (items: Record<string, number>) => void, dietary?: string[] }} props
 */
export function ItemChips({ categories, items, onChange, dietary = [] }) {
  const set = (c, n) => {
    const next = { ...items };
    if (n > 0) next[c] = Math.min(n, 99);
    else delete next[c];
    onChange(next);
  };
  const chosen = Object.keys(items);
  const warnings = dietaryWarnings(dietary, chosen);

  return (
    <div className="flex flex-col gap-4">
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3" aria-label="Categories">
        {categories.map((c) => {
          const n = items[c] ?? 0;
          return (
            <li key={c} className={cn('flex items-center justify-between gap-2 rounded-lg border px-3 py-2 transition-colors', n > 0 && 'border-primary bg-primary/10')}>
              <button type="button" className="flex-1 text-left text-sm font-medium" onClick={() => set(c, n + 1)} aria-label={`Add one ${humanise(c)}`}>
                {humanise(c)}
              </button>
              <span className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => set(c, n - 1)} disabled={n === 0} aria-label={`One less ${humanise(c)}`}>
                  <Minus className="h-4 w-4" />
                </Button>
                <span className="w-6 text-center text-sm font-semibold tabular-nums" aria-label={`${humanise(c)} quantity`}>{n}</span>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => set(c, n + 1)} aria-label={`One more ${humanise(c)}`}>
                  <Plus className="h-4 w-4" />
                </Button>
              </span>
            </li>
          );
        })}
      </ul>
      {warnings.length > 0 && (
        <ul className="flex flex-col gap-1.5 rounded-lg border border-warning/50 bg-warning/10 p-3" aria-label="Dietary warnings">
          {warnings.map((w) => (
            <li key={`${w.flag}-${w.category}`} className="flex items-start gap-2 text-sm">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
              <span><strong>{humanise(w.flag)}:</strong> {w.message}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
