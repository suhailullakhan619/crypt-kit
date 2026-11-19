import { cva } from 'class-variance-authority';
import { cn } from '../../lib/utils';

// ── Badge ─────────────────────────────────────────────────────────────────────
const badgeVariants = cva('inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium', {
  variants: {
    variant: {
      default: 'border-transparent bg-primary/15 text-primary',
      muted: 'border-transparent bg-muted text-muted-foreground',
      success: 'border-transparent bg-success/15 text-success',
      warning: 'border-transparent bg-warning/15 text-warning',
      destructive: 'border-transparent bg-destructive/15 text-destructive',
      accent: 'border-transparent bg-accent text-accent-foreground',
      outline: 'text-foreground',
    },
  },
  defaultVariants: { variant: 'default' },
});

export function Badge({ className, variant, ...props }) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

// ── Card ──────────────────────────────────────────────────────────────────────
/**
 * Card. `interactive` adds a hover lift and a focus ring for cards that act as links or buttons
 * (wrap in a link, or pass `tabIndex`/`onClick` yourself).
 */
export const Card = ({ className, interactive = false, ...p }) => (
  <div
    className={cn(
      'rounded-lg border bg-card text-card-foreground shadow-sm',
      interactive && 'transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md focus-within:border-primary/60',
      className
    )}
    {...p}
  />
);
export const CardHeader = ({ className, ...p }) => <div className={cn('flex flex-col gap-1 p-4 pb-3 sm:p-5 sm:pb-3', className)} {...p} />;
export const CardTitle = ({ className, ...p }) => <h3 className={cn('font-sans text-base font-semibold leading-tight', className)} {...p} />;
export const CardDescription = ({ className, ...p }) => <p className={cn('text-sm text-muted-foreground', className)} {...p} />;
export const CardContent = ({ className, ...p }) => <div className={cn('p-4 pt-0 sm:p-5 sm:pt-0', className)} {...p} />;
// -- Skeleton ---------------------------------------------------------------
export function Skeleton({ className, ...props }) {
  return <div aria-hidden className={cn('animate-pulse rounded-md bg-muted', className)} {...props} />;
}
// -- Table ------------------------------------------------------------------
/**
 * Table inside a horizontal scroll container. Header cells are sticky; to make the header stay
 * visible while the body scrolls, pass `scrollClassName` with a max height, e.g. "max-h-[70dvh]".
 */
export const Table = ({ className, scrollClassName, ...p }) => (
  <div className={cn('w-full overflow-auto', scrollClassName)}>
    <table className={cn('w-full caption-bottom text-sm', className)} {...p} />
  </div>
);
export const THead = ({ className, ...p }) => <thead className={cn('[&_tr]:border-b', className)} {...p} />;
export const TBody = ({ className, ...p }) => <tbody className={cn('[&_tr:last-child]:border-0', className)} {...p} />;
/** Table row. `interactive` adds a pointer cursor for rows that open something. */
export const TR = ({ className, interactive = false, ...p }) => (
  <tr
    className={cn(
      'border-b transition-colors hover:bg-muted/50 focus-within:bg-muted/60 data-[state=selected]:bg-muted',
      interactive && 'cursor-pointer',
      className
    )}
    {...p}
  />
);
/** Header cell. `numeric` right-aligns it to sit over a numeric column. */
export const TH = ({ className, numeric = false, ...p }) => (
  <th
    className={cn(
      'sticky top-0 z-10 h-11 whitespace-nowrap bg-card px-3 text-left align-middle text-xs font-semibold uppercase tracking-wide text-muted-foreground shadow-[inset_0_-1px_0_hsl(var(--border))]',
      numeric && 'text-right',
      className
    )}
    {...p}
  />
);
/** Data cell. `numeric` right-aligns and uses tabular figures. */
export const TD = ({ className, numeric = false, ...p }) => (
  <td className={cn('px-3 py-3 align-middle', numeric && 'text-right tabular-nums', className)} {...p} />
);
// -- Kbd, Separator, Progress ---------------------------------------------------
/** Keyboard hint, e.g. <Kbd>Ctrl</Kbd> <Kbd>K</Kbd>. */
export const Kbd = ({ className, ...p }) => (
  <kbd className={cn('inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded border bg-muted px-1 font-sans text-[11px] font-medium text-muted-foreground', className)} {...p} />
);
/** Thin divider. Decorative by default; pass `decorative={false}` to expose it as a separator. */
export function Separator({ orientation = 'horizontal', decorative = true, className, ...p }) {
  return (
    <div
      role={decorative ? 'none' : 'separator'}
      aria-orientation={decorative ? undefined : orientation}
      className={cn('shrink-0 bg-border', orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px', className)}
      {...p}
    />
  );
}
/**
 * Accessible progress bar. `value` is clamped to 0..max. Give it a `label` (it becomes aria-label)
 * so screen readers know what is being measured.
 */
export function Progress({ value = 0, max = 100, label, tone = 'primary', className, ...p }) {
  const safeMax = max > 0 ? max : 100;
  const v = Math.min(Math.max(Number(value) || 0, 0), safeMax);
  const tones = { primary: 'bg-primary', success: 'bg-success', warning: 'bg-warning', destructive: 'bg-destructive' };
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={safeMax}
      aria-valuenow={v}
      aria-label={label}
      className={cn('h-2 w-full overflow-hidden rounded-full bg-muted', className)}
      {...p}
    >
      <div className={cn('h-full rounded-full transition-[width] duration-300', tones[tone] ?? tones.primary)} style={{ width: `${(v / safeMax) * 100}%` }} />
    </div>
  );
}