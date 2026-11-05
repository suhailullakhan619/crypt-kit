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

/**
 * Pantry Ghost mascot: a friendly ghost holding a lantern (Req 1.3). Used in the sidebar and in
 * every empty state ("Nothing spooky in the pantry yet"). Colours come from the lantern tokens.
 */
export function Logo({ className }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden className={cn('h-8 w-8', className)}>
      <circle cx="49" cy="40" r="12" className="fill-accent" opacity="0.22" />
      <path d="M25 6C14.5 6 8 14 8 24.5V55l5-4.2 4.5 4.2 4-4.2 4 4.2 4-4.2 4 4.2 4.5-4.2V24.5C38 14 33.5 6 25 6z" className="fill-foreground" />
      <circle cx="20" cy="24" r="3.4" className="fill-background" />
      <circle cx="30.5" cy="24" r="3.4" className="fill-background" />
      <ellipse cx="25.2" cy="33" rx="3.2" ry="2.2" className="fill-primary" />
      <path d="M37 35c4 0 7-2.6 9.4-6.4" className="fill-none stroke-foreground" strokeWidth="3.6" strokeLinecap="round" />
      <path d="M45.2 29.5q3.8-5.2 7.6 0" className="fill-none stroke-foreground" strokeWidth="1.8" strokeLinecap="round" />
      <rect x="43.5" y="29.5" width="11" height="3.2" rx="1.2" className="fill-primary" />
      <rect x="44.6" y="32.5" width="8.8" height="12" rx="2.2" className="fill-accent" />
      <path d="M49 35.6c-1.7 2.1-2.2 3.4-2.2 4.4a2.2 2.2 0 0 0 4.4 0c0-1-.5-2.3-2.2-4.4z" className="fill-primary" />
      <rect x="43.5" y="44.3" width="11" height="3.2" rx="1.2" className="fill-primary" />
    </svg>
  );
}

/** Friendly empty state with a floating ghost (motion disabled under reduced motion). */
export function EmptyCrypt({ title = 'Nothing spooky in the pantry yet', children, action }) {
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
