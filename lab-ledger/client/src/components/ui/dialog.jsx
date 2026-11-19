import { useRef } from 'react';
import * as D from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({ className, children, onOpenAutoFocus, onCloseAutoFocus, ...props }) {
  // Dialogs here are opened from state (no Radix trigger), so remember what had focus at the moment
  // the dialog opens and give focus back to it on close. Keyboard users keep their place.
  const opener = useRef(null);
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
      <D.Content
        onOpenAutoFocus={(e) => {
          opener.current = document.activeElement;
          onOpenAutoFocus?.(e);
        }}
        onCloseAutoFocus={(e) => {
          onCloseAutoFocus?.(e);
          if (!e.defaultPrevented && opener.current?.isConnected && opener.current !== document.body) {
            e.preventDefault();
            opener.current.focus();
          }
        }}
        className={cn(
          'fixed left-1/2 top-1/2 z-50 grid max-h-[90dvh] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto overscroll-contain rounded-lg border bg-card p-4 shadow-xl animate-dialog-in sm:p-6',
          className
        )}
        {...props}
      >
        {children}
        <D.Close className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Close">
          <X className="h-4 w-4" aria-hidden />
        </D.Close>
      </D.Content>
    </D.Portal>
  );
}

export const DialogHeader = ({ className, ...p }) => <div className={cn('flex flex-col gap-1.5 pr-8', className)} {...p} />;
export const DialogFooter = ({ className, ...p }) => <div className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)} {...p} />;
export const DialogTitle = ({ className, ...p }) => <D.Title className={cn('font-display text-lg font-semibold', className)} {...p} />;
export const DialogDescription = ({ className, ...p }) => <D.Description className={cn('text-sm text-muted-foreground', className)} {...p} />;

// ── Sheet: slide-over from the left (mobile sidebar) ─────────────────────────
export const Sheet = D.Root;

export function SheetContent({ className, children, title = 'Menu', ...props }) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px]" />
      <D.Content
        className={cn('fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r bg-sidebar text-sidebar-foreground shadow-xl', className)}
        {...props}
      >
        <D.Title className="sr-only">{title}</D.Title>
        <D.Description className="sr-only">Main navigation</D.Description>
        {children}
        <D.Close className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Close menu">
          <X className="h-5 w-5" aria-hidden />
        </D.Close>
      </D.Content>
    </D.Portal>
  );
}
