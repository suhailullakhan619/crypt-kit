import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Wand2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { usePublicMeta } from '../context/MetaContext';
import { useApi } from '../hooks/useApi';
import { login as apiLogin, demoLogin } from '../api/auth';
import { Button } from '../components/ui/button';
import { Input, PasswordInput, Label } from '../components/ui/input';
import { Card } from '../components/ui/display';
import { Logo } from '../components/spooky';
import { ThemeToggle } from '../theme/ThemeToggle';
import { errorMessage } from '../lib/utils';

/** Sign-in (Req 3.1) with one-click demo users in DEMO_MODE (Req 15.3). */
export default function Login() {
  const { user, login } = useAuth();
  const api = useApi();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const { data: pub } = usePublicMeta();
  const [busyDemo, setBusyDemo] = useState(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm();

  const from = location.state?.from ?? '/';
  if (user) return <Navigate to={from} replace />;

  const finish = (token, name) => {
    qc.clear();
    login(token);
    toast.success(`Welcome back, ${name ?? 'friend'} 🕯️`);
    navigate(from, { replace: true });
  };

  const onSubmit = handleSubmit(async ({ email, password }) => {
    try {
      const { token, user: u } = await apiLogin(api, email, password);
      finish(token, u.name);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  });

  const signInAs = async (demo) => {
    setBusyDemo(demo.email);
    try {
      const { token, user: u } = await demoLogin(api, demo.email);
      finish(token, u.name);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusyDemo(null);
    }
  };

  return (
    <div className="fog relative grid min-h-dvh place-items-center px-4 py-10">
      <div className="absolute right-4 top-4"><ThemeToggle /></div>
      <div className="w-full max-w-md animate-fade-up">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <div className="relative">
            <div aria-hidden className="absolute inset-0 -z-10 scale-[2.2] rounded-full bg-primary/15 blur-2xl" />
            <Logo className="h-14 w-14 animate-bob" />
          </div>
          <h1 className="text-3xl font-semibold">{pub?.appName ?? ' '}</h1>
          <p className="text-sm text-muted-foreground">Sign in to raise your records from the crypt.</p>
        </div>

        <Card className="p-5 shadow-lg sm:p-7">
          <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="username" aria-invalid={!!errors.email}
                {...register('email', { required: 'Email is required' })} />
              {errors.email && <p role="alert" className="text-xs text-destructive">{errors.email.message}</p>}
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                {pub?.passwordReset && <Link to="/forgot-password" className="text-xs font-medium text-primary hover:underline">Forgot password?</Link>}
              </div>
              <PasswordInput id="password" autoComplete="current-password" aria-invalid={!!errors.password}
                {...register('password', { required: 'Password is required' })} />
              {errors.password && <p role="alert" className="text-xs text-destructive">{errors.password.message}</p>}
            </div>
            <Button type="submit" size="lg" loading={isSubmitting}>{isSubmitting ? 'Opening the crypt…' : 'Sign in'}</Button>
          </form>
          {pub?.signup && (
            <p className="mt-4 text-center text-sm text-muted-foreground">
              No account yet? <Link to="/signup" className="font-medium text-primary hover:underline">Create an account</Link>
            </p>
          )}

          {pub?.demo && pub.demoUsers?.length > 0 && (
            <div className="mt-6 rounded-md border border-dashed bg-muted/40 p-4">
              <p className="mb-3 flex items-center gap-2 text-sm font-medium">
                <Wand2 className="h-4 w-4 text-primary" aria-hidden /> Demo mode — try a role
              </p>
              <div className="grid gap-2 sm:grid-cols-3">
                {pub.demoUsers.map((d) => (
                  <Button key={d.email} variant="secondary" onClick={() => signInAs(d)} disabled={!!busyDemo} className="h-auto min-h-[3rem] flex-col gap-0 border border-transparent py-2 hover:border-primary/40">
                    <span>{busyDemo === d.email ? 'Summoning…' : d.role}</span>
                    <span className="max-w-full truncate text-[11px] font-normal">{d.name}</span>
                  </Button>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
