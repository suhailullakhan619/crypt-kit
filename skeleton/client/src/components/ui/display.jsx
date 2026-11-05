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
export const Card = ({ className, ...p }) => <div className={cn('rounded-lg border bg-card text-card-foreground shadow-sm', className)} {...p} />;
export const CardHeader = ({ className, ...p }) => <div className={cn('flex flex-col gap-1 p-5 pb-3', className)} {...p} />;
export const CardTitle = ({ className, ...p }) => <h3 className={cn('font-sans text-base font-semibold leading-tight', className)} {...p} />;
export const CardDescription = ({ className, ...p }) => <p className={cn('text-sm text-muted-foreground', className)} {...p} />;
export const CardContent = ({ className, ...p }) => <div className={cn('p-5 pt-0', className)} {...p} />;

// ── Skeleton ──────────────────────────────────────────────────────────────────
export function Skeleton({ className, ...props }) {
  return <div aria-hidden className={cn('animate-pulse rounded-md bg-muted', className)} {...props} />;
}

// ── Table ─────────────────────────────────────────────────────────────────────
export const Table = ({ className, ...p }) => (
  <div className="w-full overflow-x-auto">
    <table className={cn('w-full caption-bottom text-sm', className)} {...p} />
  </div>
);
export const THead = ({ className, ...p }) => <thead className={cn('[&_tr]:border-b', className)} {...p} />;
export const TBody = ({ className, ...p }) => <tbody className={cn('[&_tr:last-child]:border-0', className)} {...p} />;
export const TR = ({ className, ...p }) => <tr className={cn('border-b transition-colors hover:bg-muted/50', className)} {...p} />;
export const TH = ({ className, ...p }) => (
  <th className={cn('h-10 whitespace-nowrap px-3 text-left align-middle text-xs font-semibold uppercase tracking-wide text-muted-foreground', className)} {...p} />
);
export const TD = ({ className, ...p }) => <td className={cn('px-3 py-3 align-middle', className)} {...p} />;
