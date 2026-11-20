import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useApi } from '../../hooks/useApi';
import { listRecords } from '../../api/resources';
import { Button } from '../ui/button';
import { Skeleton } from '../ui/display';
import { recordTitle } from '../../lib/format';
import { calendarField, dayKey, isOverdue, monthWeeks, parseMonth, shiftMonth, ym, ymd } from '../../lib/listViews';
import { cn } from '../../lib/utils';

const LIMIT = 100;
const PER_DAY = 3;

const monthName = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });
const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
const dayLong = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

function parseDay(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Month calendar (Monday first). Records are placed on `due.field` (or the first listed date field);
 * the visible weeks are fetched with `<field>_from` / `<field>_to`. On small screens an agenda list
 * replaces the grid. `month` is the `YYYY-MM` URL param, `onMonthChange(value | null)` updates it.
 */
export function CalendarView({ resource, filters, month, onMonthChange }) {
  const api = useApi();
  const field = calendarField(resource);
  const today = ymd(new Date());
  const cur = parseMonth(month);
  const weeks = useMemo(() => monthWeeks(cur), [cur.year, cur.month]); // eslint-disable-line react-hooks/exhaustive-deps
  const from = ymd(weeks[0][0]);
  const to = ymd(weeks[weeks.length - 1][6]);
  const [expanded, setExpanded] = useState(() => new Set());

  const { data, isLoading } = useQuery({
    queryKey: ['r', resource.key, 'calendar', from, to, filters],
    queryFn: () => listRecords(api, resource.key, { ...filters, [`${field.name}_from`]: from, [`${field.name}_to`]: to, limit: LIMIT }),
    placeholderData: keepPreviousData,
  });

  const byDay = useMemo(() => {
    const map = new Map();
    for (const item of data?.items ?? []) {
      const k = dayKey(field, item[field.name]);
      if (!k) continue;
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(item);
    }
    return map;
  }, [data, field]);

  const label = monthName.format(new Date(cur.year, cur.month, 1));
  const thisMonth = ym(new Date());
  const go = (delta) => onMonthChange(shiftMonth(cur, delta));
  const itemLink = (item, k) => {
    const overdue = isOverdue(resource, item, k, today);
    return (
      <Link
        to={`/r/${resource.key}/${item._id}`}
        className={cn('block truncate rounded px-1.5 py-1 text-xs hover:underline', overdue ? 'bg-destructive/10 font-medium text-destructive' : 'bg-primary/10 text-foreground')}
      >
        {recordTitle(resource, item)}{overdue && <span className="sr-only"> (overdue)</span>}
      </Link>
    );
  };
  const agendaDays = [...byDay.keys()].filter((k) => k.startsWith(ym(new Date(cur.year, cur.month, 1)))).sort();
  const total = data?.total ?? 0;

  return (
    <div className="p-3" data-testid="calendar">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold" aria-live="polite">{label}</h2>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => go(-1)} aria-label="Previous month"><ChevronLeft className="h-4 w-4" aria-hidden /></Button>
          <Button variant="outline" size="sm" disabled={ym(new Date(cur.year, cur.month, 1)) === thisMonth} onClick={() => onMonthChange(null)}>Today</Button>
          <Button variant="outline" size="sm" onClick={() => go(1)} aria-label="Next month"><ChevronRight className="h-4 w-4" aria-hidden /></Button>
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <>
          {/* Desktop / tablet grid */}
          <div className="hidden md:block" role="grid" aria-label={`${label} calendar`}>
            <div className="grid grid-cols-7 gap-px text-xs font-semibold uppercase tracking-wide text-muted-foreground" role="row">
              {weeks[0].map((d) => <div key={d.getDay()} role="columnheader" className="px-2 py-1">{weekday.format(d)}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-px overflow-hidden rounded-md border bg-border">
              {weeks.flat().map((d) => {
                const k = ymd(d);
                const items = byDay.get(k) ?? [];
                const open = expanded.has(k);
                const shown = open ? items : items.slice(0, PER_DAY);
                const outside = d.getMonth() !== cur.month;
                return (
                  <div
                    key={k}
                    role="gridcell"
                    data-testid={`calendar-day-${k}`}
                    aria-label={dayLong.format(d)}
                    className={cn('min-h-[5.5rem] min-w-0 bg-card p-1.5', outside && 'bg-muted/40 text-muted-foreground')}
                  >
                    <div className={cn('mb-1 text-xs', k === today && 'font-bold text-primary')} aria-current={k === today ? 'date' : undefined}>{d.getDate()}</div>
                    <ul className="flex flex-col gap-1">
                      {shown.map((item) => <li key={item._id}>{itemLink(item, k)}</li>)}
                    </ul>
                    {items.length > PER_DAY && (
                      <button
                        type="button"
                        onClick={() => setExpanded((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; })}
                        className="mt-1 text-xs text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {open ? 'Show less' : `+${items.length - PER_DAY} more`}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Mobile agenda */}
          <div className="md:hidden" data-testid="calendar-agenda">
            {agendaDays.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Nothing scheduled in {label}.</p>
            ) : (
              <ul className="flex flex-col divide-y">
                {agendaDays.map((k) => (
                  <li key={k} className="py-2">
                    <h3 className={cn('mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground', k === today && 'text-primary')}>{dayLong.format(parseDay(k))}</h3>
                    <ul className="flex flex-col gap-1">
                      {byDay.get(k).map((item) => <li key={item._id}>{itemLink(item, k)}</li>)}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {total > (data?.items.length ?? 0) && (
            <p className="mt-2 text-xs text-muted-foreground">Showing the first {data.items.length} of {total} records. Narrow the filters to see the rest.</p>
          )}
        </>
      )}
    </div>
  );
}
