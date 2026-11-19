import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { MoveRight, CalendarDays, UserRound } from 'lucide-react';
import toast from 'react-hot-toast';
import { useApi } from '../../hooks/useApi';
import { listRecords, updateRecord } from '../../api/resources';
import { Badge, Skeleton } from '../ui/display';
import { StatusBadge } from './StatusBadge';
import { displayValue, recordTitle } from '../../lib/format';
import { allowedTargets, boardColumns, calendarField, dayKey, isOverdue, ymd } from '../../lib/listViews';
import { cn, errorMessage, humanise } from '../../lib/utils';

const LIMIT = 50;

/** Small "Move to…" menu: the keyboard and touch alternative to dragging a card. */
function MoveMenu({ label, targets, onMove }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  return (
    <div
      ref={ref}
      className="relative"
      onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}
    >
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Move ${label} to…`}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <MoveRight className="h-3 w-3" aria-hidden /> Move to…
      </button>
      {open && (
        <ul role="menu" aria-label={`Move ${label} to`} className="absolute left-0 z-20 mt-1 min-w-[8rem] rounded-md border bg-card p-1 shadow-md">
          {targets.map((t) => (
            <li key={t} role="none">
              <button
                type="button"
                role="menuitem"
                onClick={() => { setOpen(false); onMove(t); }}
                className="block w-full rounded px-2 py-1 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {humanise(t)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function BoardCard({ resource, item, status, canMove, onDragStart, onDragEnd, onMove, ctx }) {
  const title = recordTitle(resource, item);
  const targets = canMove ? allowedTargets(resource, status) : [];
  const key = ctx.dueField ? dayKey(ctx.dueField, item[ctx.dueField.name]) : null;
  const overdue = isOverdue(resource, item, key, ctx.today);
  const owner = ctx.ownerField ? item[ctx.ownerField.name] : null;
  return (
    <li
      draggable={targets.length > 0}
      onDragStart={(e) => {
        if (!targets.length) { e.preventDefault(); return; }
        if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData?.('text/plain', item._id); }
        onDragStart(item, status);
      }}
      onDragEnd={onDragEnd}
      data-testid={`board-card-${item._id}`}
      className={cn('rounded-md border bg-card p-3 text-sm shadow-sm', targets.length > 0 && 'cursor-grab active:cursor-grabbing')}
    >
      <div className="flex items-start justify-between gap-2">
        <Link to={`/r/${resource.key}/${item._id}`} className="min-w-0 break-words font-medium hover:text-primary hover:underline">{title}</Link>
        {item.shortId && <span className="shrink-0 text-xs text-muted-foreground">{item.shortId}</span>}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {ctx.dueField && item[ctx.dueField.name] && (
          <span className={cn('inline-flex items-center gap-1', overdue && 'font-medium text-destructive')}>
            <CalendarDays className="h-3 w-3" aria-hidden />
            {displayValue(ctx.dueField, item[ctx.dueField.name])}{overdue && <span className="sr-only"> (overdue)</span>}
          </span>
        )}
        {ctx.ownerField && owner && (
          <span className="inline-flex items-center gap-1"><UserRound className="h-3 w-3" aria-hidden />{displayValue(ctx.ownerField, owner)}</span>
        )}
        {ctx.badgeFields.map((f) => item[f.name] && <Badge key={f.name} variant="outline">{displayValue(f, item[f.name])}</Badge>)}
      </div>
      {targets.length > 0 && (
        <div className="mt-2"><MoveMenu label={title} targets={targets} onMove={(to) => onMove(item, status, to)} /></div>
      )}
    </li>
  );
}

function BoardColumn({ resource, status, filters, dragging, canUpdate, onDragStart, onDragEnd, onMove, ctx }) {
  const api = useApi();
  const flow = resource.statusFlow;
  const colFilters = { ...filters, [flow.field]: status };
  const { data, isLoading } = useQuery({
    queryKey: ['r', resource.key, 'board', status, filters],
    queryFn: () => listRecords(api, resource.key, { ...colFilters, limit: LIMIT }),
    placeholderData: keepPreviousData,
  });
  const allowed = !!dragging && dragging.from !== status && allowedTargets(resource, dragging.from).includes(status);
  const forbidden = !!dragging && !allowed && dragging.from !== status;
  const items = data?.items ?? [];
  const more = (data?.total ?? 0) - items.length;
  const moreQuery = new URLSearchParams(Object.entries(colFilters).filter(([, v]) => v));
  return (
    <section
      aria-label={`${humanise(status)} column`}
      data-testid={`board-col-${status}`}
      data-drop={allowed ? 'allowed' : forbidden ? 'blocked' : undefined}
      onDragOver={(e) => { if (allowed) { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'; } }}
      onDrop={(e) => {
        if (!allowed) return;
        e.preventDefault();
        onMove(dragging.item, dragging.from, status);
      }}
      className={cn(
        'flex w-72 shrink-0 flex-col rounded-lg border bg-muted/30 transition-colors',
        allowed && 'border-primary bg-primary/10 ring-2 ring-primary/40',
        forbidden && 'opacity-50'
      )}
    >
      <header className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <StatusBadge value={status} resource={resource} />
        <span className="text-xs text-muted-foreground" aria-label={`${data?.total ?? 0} records`}>{data?.total ?? 0}</span>
      </header>
      <div className="flex max-h-[70vh] flex-1 flex-col gap-2 overflow-y-auto p-2">
        {isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : items.length === 0 ? (
          <p className="px-1 py-4 text-center text-xs text-muted-foreground">{allowed ? 'Drop here' : 'Nothing here'}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((item) => (
              <BoardCard
                key={item._id}
                resource={resource}
                item={item}
                status={status}
                canMove={canUpdate}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                onMove={onMove}
                ctx={ctx}
              />
            ))}
          </ul>
        )}
        {more > 0 && (
          <Link to={`/r/${resource.key}?${moreQuery.toString()}`} className="px-1 text-xs text-primary hover:underline">+{more} more</Link>
        )}
      </div>
    </section>
  );
}

/**
 * Kanban board: one column per status (statusFlow order). Moves go through PATCH, optimistic with
 * rollback. `filters` are the current search/filter params (no page/view/month).
 */
export function BoardView({ resource, filters, canUpdate }) {
  const qc = useQueryClient();
  const api = useApi();
  const flow = resource.statusFlow;
  const [dragging, setDragging] = useState(null);
  const columns = boardColumns(resource, filters[flow.field]);
  const ctx = {
    today: ymd(new Date()),
    dueField: calendarField(resource),
    ownerField: resource.fields.find((f) => f.type === 'ref' && f.ref === 'User' && !f.multiple) ?? null,
    badgeFields: resource.fields.filter((f) => f.type === 'enum' && !f.multiple && f.list && f.name !== flow.field),
  };

  const move = async (item, from, to) => {
    setDragging(null);
    if (!canUpdate || from === to || !allowedTargets(resource, from).includes(to)) return;
    const base = ['r', resource.key, 'board'];
    await qc.cancelQueries({ queryKey: base });
    const snapshot = qc.getQueriesData({ queryKey: base });
    for (const [qk, old] of snapshot) {
      if (!old) continue;
      if (qk[3] === from) qc.setQueryData(qk, { ...old, items: old.items.filter((i) => i._id !== item._id), total: Math.max(0, old.total - 1) });
      else if (qk[3] === to) qc.setQueryData(qk, { ...old, items: [{ ...item, [flow.field]: to }, ...old.items], total: old.total + 1 });
    }
    try {
      await updateRecord(api, resource.key, item._id, { [flow.field]: to });
      qc.invalidateQueries({ queryKey: ['r', resource.key] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    } catch (err) {
      for (const [qk, old] of snapshot) qc.setQueryData(qk, old);
      toast.error(errorMessage(err));
    }
  };

  return (
    <div className="overflow-x-auto pb-2" data-testid="board">
      <div className="flex min-w-min items-start gap-3 p-3">
        {columns.map((status) => (
          <BoardColumn
            key={status}
            resource={resource}
            status={status}
            filters={filters}
            dragging={dragging}
            canUpdate={canUpdate}
            onDragStart={(item, from) => setDragging({ item, from })}
            onDragEnd={() => setDragging(null)}
            onMove={move}
            ctx={ctx}
          />
        ))}
      </div>
    </div>
  );
}
