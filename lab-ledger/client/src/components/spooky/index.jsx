import { lazy, Suspense } from 'react';
import { Database } from 'lucide-react';
import dynamicIconImports from 'lucide-react/dynamicIconImports';
import { cn } from '../../lib/utils';

const iconCache = new Map();
function lazyIcon(name) {
  if (!dynamicIconImports[name]) return Database;
  if (!iconCache.has(name)) iconCache.set(name, lazy(dynamicIconImports[name]));
  return iconCache.get(name);
}

/**
 * Renders a lucide icon by kebab-case name from resource meta ('scroll-text').
 * Icons load on demand so the bundle only carries the ones an app actually uses.
 */
export function ResourceIcon({ name, className }) {
  const Icon = lazyIcon(String(name ?? ''));
  const cls = cn('h-4 w-4', className);
  return (
    <Suspense fallback={<span aria-hidden className={cn('inline-block', cls)} />}>
      <Icon aria-hidden className={cls} />
    </Suspense>
  );
}

/** The Lab Ledger mark: an Erlenmeyer beaker bubbling with flask-green potion. */
export function Logo({ className }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden className={cn('h-8 w-8', className)}>
      <circle cx="38" cy="7" r="2.2" className="fill-primary/70" />
      <circle cx="30" cy="3.5" r="1.5" className="fill-accent" />
      <path d="M22 10h20v4h-3v13l13.5 22.5C55 54 52.6 59 48 59H16c-4.6 0-7-5-4.5-9.5L25 27V14h-3z" className="fill-card stroke-foreground" strokeWidth="3" strokeLinejoin="round" />
      <path d="M18.6 38h26.8l6.3 10.6c1.3 2.3-.3 5.4-3 5.4H15.3c-2.7 0-4.3-3.1-3-5.4z" className="fill-primary" />
      <circle cx="27" cy="45" r="2.6" className="fill-card/70" />
      <circle cx="36" cy="48" r="1.8" className="fill-card/70" />
      <circle cx="33" cy="32" r="2" className="fill-primary/80" />
      <circle cx="29" cy="23" r="1.4" className="fill-primary/60" />
    </svg>
  );
}

/** Friendly empty state with a bobbing beaker (motion disabled under reduced motion). */
export function EmptyCrypt({ title = 'Nothing lurking here yet', children, action }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <Logo className="h-14 w-14 animate-bob opacity-80" />
      <h3 className="font-display text-lg font-semibold">{title}</h3>
      {children && <p className="max-w-sm text-sm text-muted-foreground">{children}</p>}
      {action}
    </div>
  );
}

const ORB_STATE = {
  idle: 'animate-bob',
  listening: 'animate-pulse-glow scale-105',
  thinking: '',
  speaking: 'animate-bob',
  error: '',
};

/**
 * Voice agent orb (Req 11.10) — in Lab Ledger a beaker with a face: idle bob, listening glow, thinking swirl, speaking mouth, error tint.
 */
export function GhostOrb({ state = 'idle', className }) {
  return (
    <div
      className={cn(
        'relative grid h-40 w-40 place-items-center rounded-full bg-gradient-to-b from-accent to-card shadow-inner transition-transform duration-300',
        ORB_STATE[state],
        state === 'error' && 'from-destructive/30',
        className
      )}
      aria-hidden
    >
      {state === 'thinking' && <div className="absolute inset-2 rounded-full border-2 border-dashed border-primary/70 animate-swirl" />}
      <svg viewBox="0 0 64 64" className="h-24 w-24">
        <circle cx="37" cy="5" r="2" className="fill-primary/70" />
        <path d="M23 8h18v4h-3v12l13 21c3 5 0 13-6 13H17c-6 0-9-8-6-13l13-21V12h-3z" className="fill-foreground" />
        <circle cx="25.5" cy="38" r="3.6" className="fill-background" />
        <circle cx="38.5" cy="38" r="3.6" className="fill-background" />
        {state === 'speaking' ? (
          <ellipse cx="32" cy="48" rx="5" ry="4" className="fill-primary">
            <animate attributeName="ry" values="1.5;5;2;4.5;1.5" dur="0.9s" repeatCount="indefinite" />
          </ellipse>
        ) : state === 'listening' ? (
          <circle cx="32" cy="48" r="3.5" className="fill-primary" />
        ) : state === 'error' ? (
          <path d="M26 50q6-5 12 0" className="fill-none stroke-destructive" strokeWidth="2.5" strokeLinecap="round" />
        ) : (
          <ellipse cx="32" cy="47" rx="4.5" ry="3" className="fill-primary" />
        )}
      </svg>
    </div>
  );
}
