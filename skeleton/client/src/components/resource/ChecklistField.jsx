import { useId, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';

const HARD_CAP = 200;

/** Maximum number of items for a checklist field (default 50, hard cap 200). */
export function checklistMax(field) {
  const m = Number(field?.max);
  return Number.isFinite(m) && m > 0 ? Math.min(m, HARD_CAP) : 50;
}

/** `{ done, total }` for a checklist value (anything that is not an array counts as empty). */
export function checklistCounts(value) {
  const items = Array.isArray(value) ? value : [];
  return { done: items.filter((i) => i?.done).length, total: items.length };
}

/** Progress bar plus "2 of 5 done". */
export function ChecklistProgress({ value, className }) {
  const { done, total } = checklistCounts(value);
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div
        role="progressbar"
        aria-label="Checklist progress"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        className="h-2 flex-1 overflow-hidden rounded-full bg-muted"
      >
        <div className="h-full rounded-full bg-success transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className="shrink-0 text-xs text-muted-foreground">{done} of {total} done</span>
    </div>
  );
}

/**
 * Tickable checklist for the detail page. Read-only (no `onChange`) renders disabled checkboxes.
 *
 * @param {{ value: Array<{text:string, done:boolean}>, onChange?: (next: Array) => void, label?: string }} props
 */
export function ChecklistChecks({ value, onChange, label = 'Checklist' }) {
  const items = Array.isArray(value) ? value : [];
  const base = useId();
  if (!items.length) return <span className="text-sm text-muted-foreground">—</span>;
  return (
    <div className="flex flex-col gap-2">
      <ChecklistProgress value={items} />
      <ul aria-label={label} className="flex flex-col gap-1">
        {items.map((it, i) => (
          <li key={i}>
            <label htmlFor={`${base}-${i}`} className={cn('flex min-h-8 items-start gap-2 py-1', onChange && 'cursor-pointer')}>
              <input
                id={`${base}-${i}`}
                type="checkbox"
                className="mt-0.5 h-4 w-4 shrink-0 accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                checked={!!it.done}
                disabled={!onChange}
                onChange={() => onChange(items.map((x, j) => (j === i ? { ...x, done: !x.done } : x)))}
              />
              <span className={cn('min-w-0 flex-1 break-words text-sm', it.done && 'text-muted-foreground line-through')}>{it.text}</span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Checklist editor for forms: add (Enter adds the next item), edit, tick, remove, reorder.
 *
 * @param {{ field: object, value: Array, onChange: (next: Array) => void, id?: string }} props
 */
export function ChecklistEditor({ field, value, onChange, id }) {
  const items = Array.isArray(value) ? value : [];
  const max = checklistMax(field);
  const [draft, setDraft] = useState('');
  const addRef = useRef(null);
  const full = items.length >= max;

  const add = () => {
    const text = draft.trim().slice(0, 200);
    if (!text || full) return;
    onChange([...items, { text, done: false }]);
    setDraft('');
    addRef.current?.focus();
  };
  const patch = (i, p) => onChange(items.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const move = (i, d) => {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  // Enter must never submit the surrounding form from inside the editor.
  const onItemKey = (e) => { if (e.key === 'Enter') { e.preventDefault(); addRef.current?.focus(); } };

  return (
    <div className="flex flex-col gap-2" role="group" aria-label={`${field.label} checklist`}>
      {items.length > 0 && <ChecklistProgress value={items} />}
      <ul className="flex flex-col gap-1.5">
        {items.map((it, i) => (
          <li key={i} className="flex items-center gap-1.5">
            <label className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center">
              <input
                type="checkbox"
                className="h-4 w-4 accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Done: ${it.text}`}
                checked={!!it.done}
                onChange={() => patch(i, { done: !it.done })}
              />
            </label>
            <Input
              aria-label={`Item ${i + 1}`}
              value={it.text}
              maxLength={200}
              className={cn('h-9', it.done && 'text-muted-foreground line-through')}
              onChange={(e) => patch(i, { text: e.target.value })}
              onKeyDown={onItemKey}
            />
            <Button type="button" variant="ghost" size="icon" aria-label={`Move item ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)}>
              <ArrowUp className="h-4 w-4" aria-hidden />
            </Button>
            <Button type="button" variant="ghost" size="icon" aria-label={`Move item ${i + 1} down`} disabled={i === items.length - 1} onClick={() => move(i, 1)}>
              <ArrowDown className="h-4 w-4" aria-hidden />
            </Button>
            <Button type="button" variant="ghost" size="icon" aria-label={`Remove item ${i + 1}`} onClick={() => onChange(items.filter((_, j) => j !== i))}>
              <X className="h-4 w-4" aria-hidden />
            </Button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Input
          id={id}
          ref={addRef}
          value={draft}
          maxLength={200}
          disabled={full}
          placeholder={full ? `Limit of ${max} items reached` : 'Add an item and press Enter'}
          aria-label={`Add ${field.label} item`}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
        />
        <Button type="button" variant="outline" disabled={full || !draft.trim()} onClick={add}>
          <Plus className="h-4 w-4" aria-hidden /> Add
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{items.length} of {max} items</p>
    </div>
  );
}
