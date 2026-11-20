import { Link, useNavigate } from 'react-router-dom';
import { ChevronRight, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import { Table, THead, TBody, TR, TH, TD } from '../ui/display';
import { StatusBadge } from './StatusBadge';
import { displayValue, recordTitle } from '../../lib/format';
import { cn } from '../../lib/utils';
import { isSortable, sortDirection } from '../../lib/listViews';

/** Fields shown as columns: `list: true` (falls back to the first four fields). */
export function listColumns(resource) {
  const cols = resource.fields.filter((f) => f.list);
  return cols.length ? cols : resource.fields.slice(0, 4);
}

function statusField(resource) {
  return resource.statusFlow?.field ?? resource.due?.status ?? resource.softDelete?.field ?? null;
}

function Check({ checked, indeterminate = false, onChange, label }) {
  return (
    <label className="-m-1.5 inline-flex cursor-pointer p-1.5" onClick={(e) => e.stopPropagation()}>
      <input
        type="checkbox"
        aria-label={label}
        checked={checked}
        ref={(el) => { if (el) el.indeterminate = indeterminate; }}
        onChange={onChange}
        className="h-4 w-4 cursor-pointer rounded border-input accent-[hsl(var(--primary))]"
      />
    </label>
  );
}

const INTERACTIVE = 'a,button,input,select,textarea,label,summary,[role="button"],[data-no-row-click]';

/** Sortable column header: a button inside the `<th>`, with `aria-sort` and an arrow icon. */
function SortHeader({ field, sort, onSort }) {
  const dir = sortDirection(sort, field.name);
  const Icon = dir === 'asc' ? ArrowUp : dir === 'desc' ? ArrowDown : ArrowUpDown;
  return (
    <TH aria-sort={dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : 'none'}>
      <button
        type="button"
        onClick={() => onSort(field.name)}
        className={cn(
          'inline-flex items-center gap-1 rounded py-2 uppercase tracking-wide hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          dir && 'text-foreground'
        )}
      >
        {field.label}
        <Icon className={cn('h-3 w-3', !dir && 'opacity-50')} aria-hidden />
      </button>
    </TH>
  );
}

/**
 * Records table (Req 13.3). The whole row opens the record (the title stays a real link for
 * keyboard, screen readers and "open in new tab"); on small screens rows collapse into cards.
 *
 * Optional row selection for bulk actions (Req 16.14): pass `selected` (a Set of ids) and
 * `onSelectedChange(nextSet)`. Without them the table renders exactly as before.
 *
 * Optional sorting: pass `sort` (the `sort` URL param) and `onSort(fieldName)`.
 */
export function ResourceTable({ resource, items, selected, onSelectedChange, sort, onSort }) {
  const navigate = useNavigate();
  const cols = listColumns(resource);
  const sField = statusField(resource);
  const title = resource.titleField ?? cols[0]?.name;
  const selectable = !!selected && typeof onSelectedChange === 'function';

  const allIds = items.map((i) => i._id);
  const selectedHere = allIds.filter((id) => selected?.has(id));
  const allChecked = selectable && allIds.length > 0 && selectedHere.length === allIds.length;
  const someChecked = selectable && selectedHere.length > 0 && !allChecked;

  const toggle = (id) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    onSelectedChange(next);
  };
  const toggleAll = () => {
    const next = new Set(selected);
    if (allChecked) allIds.forEach((id) => next.delete(id));
    else allIds.forEach((id) => next.add(id));
    onSelectedChange(next);
  };
  const nameOf = (item) => recordTitle(resource, item);
  const hrefOf = (item) => `/r/${resource.key}/${item._id}`;

  // Row click opens the record unless the click started on a control or ended a text selection.
  const openRow = (e, item) => {
    if (e.defaultPrevented || e.button > 0) return;
    if (e.target.closest?.(INTERACTIVE)) return;
    if (typeof window !== 'undefined' && window.getSelection?.()?.toString()) return;
    if (e.ctrlKey || e.metaKey) window.open(hrefOf(item), '_blank', 'noopener');
    else navigate(hrefOf(item));
  };
  const auxRow = (e, item) => {
    if (e.button !== 1 || e.target.closest?.(INTERACTIVE)) return;
    e.preventDefault();
    window.open(hrefOf(item), '_blank', 'noopener');
  };

  return (
    <>
      {/* Desktop / tablet */}
      <div className="hidden md:block">
        <Table>
          <THead>
            <TR className="hover:bg-transparent">
              {selectable && (
                <TH className="w-10">
                  <Check checked={allChecked} indeterminate={someChecked} onChange={toggleAll} label="Select all on this page" />
                </TH>
              )}
              {cols.map((c) => (
                typeof onSort === 'function' && isSortable(c)
                  ? <SortHeader key={c.name} field={c} sort={sort} onSort={onSort} />
                  : <TH key={c.name}>{c.label}</TH>
              ))}
              <TH className="w-8"><span className="sr-only">Open</span></TH>
            </TR>
          </THead>
          <TBody>
            {items.map((item) => (
              <TR
                key={item._id}
                onClick={(e) => openRow(e, item)}
                onAuxClick={(e) => auxRow(e, item)}
                className={cn('cursor-pointer hover:bg-muted focus-within:bg-muted/60', selectable && selected.has(item._id) && 'bg-primary/5')}
              >
                {selectable && (
                  <TD className="w-10" data-no-row-click>
                    <Check checked={selected.has(item._id)} onChange={() => toggle(item._id)} label={`Select ${nameOf(item)}`} />
                  </TD>
                )}
                {cols.map((c) => (
                  <TD key={c.name} className={c.name === title ? 'font-medium' : 'text-muted-foreground'}>
                    {c.name === title ? (
                      <Link to={`/r/${resource.key}/${item._id}`} className="text-foreground hover:text-primary hover:underline">
                        {displayValue(c, item[c.name])}
                      </Link>
                    ) : c.name === sField ? (
                      <StatusBadge value={item[c.name]} resource={resource} />
                    ) : (
                      displayValue(c, item[c.name])
                    )}
                  </TD>
                ))}
                <TD>
                  <Link to={`/r/${resource.key}/${item._id}`} aria-label={`Open ${nameOf(item)}`} className="text-muted-foreground hover:text-primary">
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </div>

      {/* Mobile cards */}
      {selectable && items.length > 0 && (
        <label className="flex items-center gap-3 border-b px-1 pb-2 text-xs text-muted-foreground md:hidden">
          <Check checked={allChecked} indeterminate={someChecked} onChange={toggleAll} label="Select all on this page" />
          Select all
        </label>
      )}
      <ul className="flex flex-col divide-y md:hidden">
        {items.map((item) => (
          <li key={item._id} className="flex items-start gap-3">
            {selectable && (
              <div className="pl-1 pt-4">
                <Check checked={selected.has(item._id)} onChange={() => toggle(item._id)} label={`Select ${nameOf(item)}`} />
              </div>
            )}
            <Link to={`/r/${resource.key}/${item._id}`} className="flex min-w-0 flex-1 items-start gap-3 rounded px-1 py-3 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{nameOf(item)}</p>
                <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  {cols.filter((c) => c.name !== title && c.name !== sField).slice(0, 3).map((c) => (
                    <span key={c.name}>{c.label}: {displayValue(c, item[c.name])}</span>
                  ))}
                </p>
              </div>
              {sField && <StatusBadge value={item[sField]} resource={resource} />}
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
