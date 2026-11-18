import { useState } from 'react';
import { Bookmark, Plus, X } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { cn } from '../../lib/utils';

const MAX_VIEWS = 12;
const storageKey = (resourceKey) => `crypt_views_${resourceKey}`;

export function loadViews(resourceKey) {
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey(resourceKey)) ?? '[]');
    return Array.isArray(raw) ? raw.filter((v) => v && typeof v.name === 'string' && typeof v.query === 'string') : [];
  } catch {
    return [];
  }
}

const save = (resourceKey, views) => localStorage.setItem(storageKey(resourceKey), JSON.stringify(views));

/** Query string of the current search + filters, without paging, in a stable order. */
export function normaliseQuery(params) {
  const p = new URLSearchParams();
  [...params.entries()].filter(([k, v]) => k !== 'page' && v !== '').sort(([a], [b]) => a.localeCompare(b)).forEach(([k, v]) => p.set(k, v));
  return p.toString();
}

/**
 * Named shortcuts for a list's search and filters, kept in this browser (localStorage).
 * Click a chip to apply it; "Save view" stores whatever search and filters are active now.
 */
export function SavedViews({ resourceKey, params, onApply }) {
  const [views, setViews] = useState(() => loadViews(resourceKey));
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');

  const current = normaliseQuery(params);
  const activeName = views.find((v) => v.query === current)?.name;

  const commit = (next) => { setViews(next); save(resourceKey, next); };
  const add = (e) => {
    e.preventDefault();
    const clean = name.trim().slice(0, 40);
    if (!clean || !current) return;
    commit([...views.filter((v) => v.name.toLowerCase() !== clean.toLowerCase()), { name: clean, query: current }].slice(-MAX_VIEWS));
    setName('');
    setNaming(false);
  };

  if (!views.length && !current) return null;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2" role="group" aria-label="Saved views">
      <Bookmark className="h-4 w-4 text-muted-foreground" aria-hidden />
      {views.map((v) => (
        <span key={v.name} className={cn('inline-flex items-center rounded-full border text-sm', activeName === v.name ? 'border-primary bg-primary/10' : 'bg-card')}>
          <button type="button" className="rounded-l-full py-1 pl-3 pr-2 hover:text-primary" aria-pressed={activeName === v.name} onClick={() => onApply(new URLSearchParams(v.query))}>
            {v.name}
          </button>
          <button type="button" className="rounded-r-full py-1 pl-1 pr-2 text-muted-foreground hover:text-destructive" aria-label={`Delete view ${v.name}`} onClick={() => commit(views.filter((x) => x.name !== v.name))}>
            <X className="h-3 w-3" aria-hidden />
          </button>
        </span>
      ))}
      {current && !activeName && !naming && (
        <Button variant="ghost" size="sm" onClick={() => setNaming(true)}><Plus className="h-4 w-4" aria-hidden /> Save view</Button>
      )}
      {naming && (
        <form onSubmit={add} className="flex items-center gap-2">
          <Input aria-label="View name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name this view" maxLength={40} className="h-8 w-44" autoFocus />
          <Button type="submit" size="sm" disabled={!name.trim()}>Save</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => { setNaming(false); setName(''); }}>Cancel</Button>
        </form>
      )}
    </div>
  );
}
