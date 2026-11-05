import * as D from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({ className, children, ...props }) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
      <D.Content
        className={cn(
          'fixed left-1/2 top-1/2 z-50 grid max-h-[90dvh] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-lg border bg-card p-6 shadow-xl animate-fade-up',
          className
        )}
        {...props}
      >
        {children}
        <D.Close className="absolute right-4 top-4 rounded-sm opacity-70 hover:opacity-100" aria-label="Close">
          <X className="h-4 w-4" />
        </D.Close>
      </D.Content>
    </D.Portal>
  );
}

export const DialogHeader = ({ className, ...p }) => <div className={cn('flex flex-col gap-1.5 pr-6', className)} {...p} />;
export const DialogFooter = ({ className, ...p }) => <div className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)} {...p} />;
export const DialogTitle = ({ className, ...p }) => <D.Title className={cn('font-display text-lg font-semibold', className)} {...p} />;
export const DialogDescription = ({ className, ...p }) => <D.Description className={cn('text-sm text-muted-foreground', className)} {...p} />;

// ── Sheet: slide-over from the left (mobile sidebar) ─────────────────────────
export const Sheet = D.Root;

export function SheetContent({ className, children, title = 'Menu', ...props }) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-black/60" />
      <D.Content
        className={cn('fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col bg-sidebar text-sidebar-foreground shadow-xl', className)}
        {...props}
      >
        <D.Title className="sr-only">{title}</D.Title>
        <D.Description className="sr-only">Main navigation</D.Description>
        {children}
        <D.Close className="absolute right-3 top-4 rounded-sm opacity-70 hover:opacity-100" aria-label="Close menu">
          <X className="h-5 w-5" />
        </D.Close>
      </D.Content>
    </D.Portal>
  );
}
