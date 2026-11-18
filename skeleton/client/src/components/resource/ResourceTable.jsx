import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { Table, THead, TBody, TR, TH, TD } from '../ui/display';
import { StatusBadge } from './StatusBadge';
import { displayValue, recordTitle } from '../../lib/format';
import { cn } from '../../lib/utils';

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
    <input
      type="checkbox"
      aria-label={label}
      checked={checked}
      ref={(el) => { if (el) el.indeterminate = indeterminate; }}
      onChange={onChange}
      onClick={(e) => e.stopPropagation()}
      className="h-4 w-4 cursor-pointer rounded border-input accent-[hsl(var(--primary))]"
    />
  );
}

/**
 * Records table (Req 13.3). The title column links to the detail page; on small screens
 * rows collapse into a stacked card layout.
 *
 * Optional row selection for bulk actions (Req 16.14): pass `selected` (a Set of ids) and
 * `onSelectedChange(nextSet)`. Without them the table renders exactly as before.
 */
export function ResourceTable({ resource, items, selected, onSelectedChange }) {
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
              {cols.map((c) => <TH key={c.name}>{c.label}</TH>)}
              <TH className="w-8"><span className="sr-only">Open</span></TH>
            </TR>
          </THead>
          <TBody>
            {items.map((item) => (
              <TR key={item._id} className={cn(selectable && selected.has(item._id) && 'bg-primary/5')}>
                {selectable && (
                  <TD className="w-10">
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
            <Link to={`/r/${resource.key}/${item._id}`} className="flex min-w-0 flex-1 items-start gap-3 px-1 py-3 hover:bg-muted/40">
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
