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

/** The Crypt Kit ghost mark. Apps replace this file's Logo to re-brand. */
export function Logo({ className }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden className={cn('h-8 w-8', className)}>
      <path d="M32 6C20 6 12 15 12 27v27l6-5 5 5 4.5-5 4.5 5 4.5-5 4.5 5 5-5 6 5V27C52 15 44 6 32 6z" className="fill-foreground" />
      <circle cx="24.5" cy="27" r="4" className="fill-background" />
      <circle cx="39.5" cy="27" r="4" className="fill-background" />
      <ellipse cx="32" cy="38" rx="4.5" ry="3" className="fill-primary" />
    </svg>
  );
}

/** Friendly empty state with a floating ghost (motion disabled under reduced motion). */
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
 * Voice agent orb (Req 11.10): idle bob, listening glow, thinking swirl, speaking mouth, error tint.
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
        <path d="M32 6C20 6 12 15 12 27v27l6-5 5 5 4.5-5 4.5 5 4.5-5 4.5 5 5-5 6 5V27C52 15 44 6 32 6z" className="fill-foreground" />
        <circle cx="24.5" cy="27" r="4" className="fill-background" />
        <circle cx="39.5" cy="27" r="4" className="fill-background" />
        {state === 'speaking' ? (
          <ellipse cx="32" cy="39" rx="5" ry="4" className="fill-primary">
            <animate attributeName="ry" values="1.5;5;2;4.5;1.5" dur="0.9s" repeatCount="indefinite" />
          </ellipse>
        ) : state === 'listening' ? (
          <circle cx="32" cy="39" r="3.5" className="fill-primary" />
        ) : state === 'error' ? (
          <path d="M26 41q6-5 12 0" className="fill-none stroke-destructive" strokeWidth="2.5" strokeLinecap="round" />
        ) : (
          <ellipse cx="32" cy="38" rx="4.5" ry="3" className="fill-primary" />
        )}
      </svg>
    </div>
  );
}
