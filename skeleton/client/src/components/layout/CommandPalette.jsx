import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Compass, CornerDownLeft, FileText, LayoutDashboard, Mic, Plus, Search, Users } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog';
import { ResourceIcon } from '../spooky';
import { useApi } from '../../hooks/useApi';
import { useMeta } from '../../context/MetaContext';
import { useAuth } from '../../context/AuthContext';
import { usePermission } from '../../hooks/usePermission';
import { searchAll } from '../../api/search';
import appRoutes from '../../appRoutes';
import { cn } from '../../lib/utils';

const DEBOUNCE_MS = 250;
const singular = (label) => String(label ?? '').replace(/s$/, '').toLowerCase();

/** True when the keyboard event came from somewhere the user is typing. */
export function isTypingTarget(el) {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true;
}

/**
 * Global shortcut: Ctrl/Cmd+K toggles, "/" opens when the user is not typing in a field.
 * @param {(fn: (open: boolean) => boolean) => void} setOpen
 */
export function useCommandShortcut(setOpen) {
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey && !isTypingTarget(e.target)) {
        e.preventDefault();
        setOpen(() => true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setOpen]);
}

/** Navigation and "create" entries the signed-in user can reach (mirrors the sidebar). */
function useStaticEntries() {
  const meta = useMeta();
  const { user } = useAuth();
  const { can, isSuperuser } = usePermission();
  return useMemo(() => {
    const nav = [{ id: 'nav:/', label: 'Dashboard', to: '/', icon: <LayoutDashboard className="h-4 w-4" aria-hidden /> }];
    for (const r of meta.resources) nav.push({ id: `nav:r:${r.key}`, label: r.label, to: `/r/${r.key}`, icon: <ResourceIcon name={r.icon} /> });
    for (const r of appRoutes.filter((x) => x.label && (!x.roles || isSuperuser || x.roles.includes(user?.role)))) {
      nav.push({ id: `nav:${r.path}`, label: r.label, to: `/${r.path}`, icon: <ResourceIcon name={r.icon} /> });
    }
    nav.push({ id: 'nav:reports', label: 'Reports', to: '/reports', icon: <FileText className="h-4 w-4" aria-hidden /> });
    nav.push({ id: 'nav:voice', label: 'Voice agent', to: '/voice', icon: <Mic className="h-4 w-4" aria-hidden /> });
    if (isSuperuser) nav.push({ id: 'nav:users', label: 'Users', to: '/users', icon: <Users className="h-4 w-4" aria-hidden /> });
    const create = meta.resources
      .filter((r) => can(r.key, 'create'))
      .map((r) => ({ id: `new:${r.key}`, label: `Create new ${singular(r.label)}`, to: `/r/${r.key}/new`, icon: <Plus className="h-4 w-4" aria-hidden /> }));
    return { nav, create };
  }, [meta.resources, user?.role, can, isSuperuser]);
}

/**
 * Command palette dialog: record search (debounced, /api/search) plus quick navigation and "create"
 * shortcuts. Combobox pattern: the input keeps focus, arrows move `aria-activedescendant`.
 *
 * @param {{ open: boolean, onOpenChange: (open: boolean) => void, onTour?: () => void }} props
 */
export function CommandPalette({ open, onOpenChange, onTour }) {
  const api = useApi();
  const navigate = useNavigate();
  const { nav, create } = useStaticEntries();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef(null);

  useEffect(() => { if (!open) { setQuery(''); setDebounced(''); setActive(0); } }, [open]);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  const searching = debounced.length >= 2;
  const search = useQuery({ queryKey: ['search', debounced], queryFn: () => searchAll(api, debounced), enabled: open && searching, staleTime: 15_000 });

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = (e) => !q || e.label.toLowerCase().includes(q) || (q.length > 1 && 'create new'.startsWith(q) && e.id.startsWith('new:'));
    const out = [];
    if (searching && debounced === query.trim()) {
      for (const g of search.data ?? []) {
        if (!g.items?.length) continue;
        out.push({
          id: `res:${g.key}`,
          label: g.label,
          entries: g.items.map((it) => ({ id: `rec:${g.key}:${it._id}`, label: it.title || 'Untitled', hint: it.subtitle, to: `/r/${g.key}/${it._id}`, icon: <ResourceIcon name={g.icon} /> })),
        });
      }
    }
    const pages = nav.filter(match);
    const creates = create.filter(match);
    if (pages.length) out.push({ id: 'pages', label: 'Go to', entries: pages });
    if (creates.length) out.push({ id: 'create', label: 'Create', entries: creates });
    // only offered once the user types something that asks for it, so the default list stays short
    if (onTour && q.length >= 2 && ['take the tour', 'tour', 'help', 'welcome', 'intro'].some((w) => w.includes(q))) {
      out.push({ id: 'help', label: 'Help', entries: [{ id: 'help:tour', label: 'Take the tour', action: 'tour', icon: <Compass className="h-4 w-4" aria-hidden /> }] });
    }
    return out;
  }, [query, debounced, searching, search.data, nav, create, onTour]);

  const flat = useMemo(() => groups.flatMap((g) => g.entries), [groups]);
  useEffect(() => { setActive(0); }, [flat.length, query]);
  useEffect(() => { document.getElementById(`cmdk-opt-${active}`)?.scrollIntoView?.({ block: 'nearest' }); }, [active]);

  const go = (entry) => {
    onOpenChange(false);
    if (entry.action === 'tour') { setTimeout(() => onTour?.(), 150); return; } // after this dialog has closed
    navigate(entry.to);
  };
  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (flat.length ? (a + 1) % flat.length : 0)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (flat.length ? (a - 1 + flat.length) % flat.length : 0)); }
    else if (e.key === 'Home') { e.preventDefault(); setActive(0); }
    else if (e.key === 'End') { e.preventDefault(); setActive(Math.max(0, flat.length - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (flat[active]) go(flat[active]); }
  };

  let index = -1;
  const waiting = searching && (debounced !== query.trim() || search.isFetching);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl gap-3 p-4">
        <DialogTitle className="sr-only">Search</DialogTitle>
        <DialogDescription className="sr-only">Search records or jump to a page. Use the arrow keys and Enter.</DialogDescription>
        {/* mr-10 leaves room for the dialog's close button; the wrapper draws the only focus ring. */}
        <div className="mr-10 flex items-center gap-2 rounded-md border bg-background px-3 focus-within:ring-2 focus-within:ring-ring">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <input
            role="combobox"
            aria-label="Search records and pages"
            aria-expanded="true"
            aria-controls="cmdk-listbox"
            aria-autocomplete="list"
            aria-activedescendant={flat.length ? `cmdk-opt-${active}` : undefined}
            autoComplete="off"
            spellCheck={false}
            className="h-11 w-full min-w-0 border-0 bg-transparent text-base shadow-none outline-none ring-0 placeholder:text-muted-foreground focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 sm:text-sm"
            placeholder="Search records, or type a page name…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
          />
        </div>
        <div id="cmdk-listbox" role="listbox" aria-label="Results" ref={listRef} className="max-h-[50dvh] overflow-y-auto">
          {groups.map((g) => (
            <div key={g.id} role="group" aria-labelledby={`cmdk-g-${g.id}`} className="mb-2">
              <p id={`cmdk-g-${g.id}`} className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{g.label}</p>
              {g.entries.map((e) => {
                index += 1;
                const i = index;
                const on = i === active;
                return (
                  <div
                    key={e.id}
                    id={`cmdk-opt-${i}`}
                    role="option"
                    aria-selected={on}
                    onMouseMove={() => setActive(i)}
                    onClick={() => go(e)}
                    className={cn('flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm', on ? 'bg-primary/15 tone-primary' : 'hover:bg-muted')}
                  >
                    <span className="shrink-0">{e.icon}</span>
                    <span className="min-w-0 flex-1 truncate">{e.label}</span>
                    {e.hint && <span className="shrink-0 truncate text-xs text-muted-foreground">{e.hint}</span>}
                    {on && <CornerDownLeft className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden />}
                  </div>
                );
              })}
            </div>
          ))}
          {flat.length === 0 && !waiting && <p className="px-2 py-6 text-center text-sm text-muted-foreground">Nothing found{query.trim() ? ` for “${query.trim()}”` : ''}</p>}
        </div>
        <p role="status" aria-live="polite" className="sr-only">{flat.length} results</p>
        {waiting && <p className="px-2 text-xs text-muted-foreground">Searching…</p>}
      </DialogContent>
    </Dialog>
  );
}
