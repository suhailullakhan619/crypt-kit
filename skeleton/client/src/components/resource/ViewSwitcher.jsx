import { List, Kanban, CalendarDays } from 'lucide-react';
import { cn } from '../../lib/utils';

const META = {
  list: { label: 'List', Icon: List },
  board: { label: 'Board', Icon: Kanban },
  calendar: { label: 'Calendar', Icon: CalendarDays },
};

/**
 * List / Board / Calendar toggle. Renders nothing when only the list is available.
 * @param {{ views: string[], value: string, onChange: (view: string) => void }} props
 */
export function ViewSwitcher({ views, value, onChange }) {
  if (views.length < 2) return null;
  return (
    <div role="group" aria-label="View" className="inline-flex rounded-md border bg-card p-0.5">
      {views.map((v) => {
        const { label, Icon } = META[v];
        const on = v === value;
        return (
          <button
            key={v}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(v)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              on ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon className="h-4 w-4" aria-hidden /> {label}
          </button>
        );
      })}
    </div>
  );
}
