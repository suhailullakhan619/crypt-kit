import { forwardRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '../../lib/utils';

export const Input = forwardRef(function Input({ className, ...props }, ref) {
  return (
    <input
      ref={ref}
      className={cn(
        'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 aria-[invalid=true]:border-destructive',
        className
      )}
      {...props}
    />
  );
});

/**
 * Password input with an eye button that shows or hides what was typed. Works with react-hook-form
 * `register` (the ref goes to the input). The button is a plain toggle, so it never submits the form.
 */
export const PasswordInput = forwardRef(function PasswordInput({ className, ...props }, ref) {
  const [visible, setVisible] = useState(false);
  const Icon = visible ? EyeOff : Eye;
  return (
    <div className="relative">
      <Input ref={ref} {...props} type={visible ? 'text' : 'password'} className={cn('pr-10', className)} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        aria-controls={props.id}
        title={visible ? 'Hide password' : 'Show password'}
        disabled={props.disabled}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
      >
        <Icon className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
});

export const Textarea = forwardRef(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(
        'flex min-h-[90px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[invalid=true]:border-destructive',
        className
      )}
      {...props}
    />
  );
});

export function Label({ className, ...props }) {
  // eslint-disable-next-line jsx-a11y/label-has-associated-control
  return <label className={cn('text-sm font-medium leading-none', className)} {...props} />;
}
