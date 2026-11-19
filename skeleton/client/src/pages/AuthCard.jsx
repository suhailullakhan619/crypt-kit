import { Link } from 'react-router-dom';
import { usePublicMeta } from '../context/MetaContext';
import { Card } from '../components/ui/display';
import { Logo } from '../components/spooky';
import { ThemeToggle } from '../theme/ThemeToggle';

/** Shared frame for the signed-out pages (sign-up, forgot and reset password), matching the login page. */
export function AuthCard({ subtitle, children, footer }) {
  const { data: pub } = usePublicMeta();
  return (
    <div className="fog relative grid min-h-dvh place-items-center px-4 py-10">
      <div className="absolute right-4 top-4"><ThemeToggle /></div>
      <div className="w-full max-w-md animate-fade-up">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <div className="relative">
            <div aria-hidden className="absolute inset-0 -z-10 scale-[2.2] rounded-full bg-primary/15 blur-2xl" />
            <Link to="/login" aria-label="Back to sign in" className="block rounded-full"><Logo className="h-14 w-14 animate-bob" /></Link>
          </div>
          <h1 className="text-3xl font-semibold">{pub?.appName ?? ' '}</h1>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        <Card className="p-5 shadow-lg sm:p-7">{children}</Card>
        {footer && <p className="mt-4 text-center text-sm text-muted-foreground">{footer}</p>}
      </div>
    </div>
  );
}

/** One labelled input with its error, for react-hook-form. */
export function Field({ id, label, error, children }) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-medium leading-none">{label}</label>
      {children}
      {error && <p id={`${id}-error`} role="alert" className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
