import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { MailCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { usePublicMeta } from '../context/MetaContext';
import { useApi } from '../hooks/useApi';
import { signup } from '../api/auth';
import { Button, buttonVariants } from '../components/ui/button';
import { Input, PasswordInput } from '../components/ui/input';
import { errorMessage } from '../lib/utils';
import { AuthCard, Field } from './AuthCard';

/** Self sign-up. The account waits for a superuser to approve it and choose a role. */
export default function Signup() {
  const { user } = useAuth();
  const api = useApi();
  const { data: pub } = usePublicMeta();
  const [done, setDone] = useState(null);
  const { register, handleSubmit, getValues, setError, formState: { errors, isSubmitting } } = useForm();

  if (user) return <Navigate to="/" replace />;
  if (pub && pub.signup === false) return <Navigate to="/login" replace />;

  const onSubmit = handleSubmit(async ({ name, email, password }) => {
    try {
      const res = await signup(api, { name, email, password });
      setDone(res.email);
    } catch (err) {
      const fields = err?.response?.data?.fields;
      if (fields) Object.entries(fields).forEach(([k, m]) => setError(k, { message: m }));
      toast.error(errorMessage(err));
    }
  });

  if (done) {
    return (
      <AuthCard subtitle="Thanks for signing up.">
        <div role="status" className="flex flex-col items-center gap-3 text-center">
          <MailCheck className="h-10 w-10 text-primary" aria-hidden />
          <h2 className="text-lg font-semibold">Your account is waiting for approval</h2>
          <p className="text-sm text-muted-foreground">
            An administrator has been told about <strong>{done}</strong>. You can sign in as soon as they approve it.
            We'll email you when that happens, so check your spam folder too.
          </p>
          <Link to="/login" className={buttonVariants({ className: 'mt-2 w-full' })}>Back to sign in</Link>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard subtitle="Create an account. An administrator approves it before you can sign in." footer={<>Already have an account? <Link to="/login" className="font-medium text-primary hover:underline">Sign in</Link></>}>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <Field id="su-name" label="Name" error={errors.name?.message}>
          <Input id="su-name" autoComplete="name" aria-invalid={!!errors.name} {...register('name', { required: 'Name is required', maxLength: { value: 120, message: 'Name is too long' } })} />
        </Field>
        <Field id="su-email" label="Email" error={errors.email?.message}>
          <Input id="su-email" type="email" autoComplete="email" aria-invalid={!!errors.email} {...register('email', { required: 'Email is required', pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Enter a valid email address' } })} />
        </Field>
        <Field id="su-password" label="Password" error={errors.password?.message}>
          <PasswordInput id="su-password" autoComplete="new-password" aria-invalid={!!errors.password} {...register('password', { required: 'Password is required', minLength: { value: 8, message: 'At least 8 characters' } })} />
        </Field>
        <Field id="su-confirm" label="Confirm password" error={errors.confirm?.message}>
          <PasswordInput id="su-confirm" autoComplete="new-password" aria-invalid={!!errors.confirm} {...register('confirm', { required: 'Confirm your password', validate: (v) => v === getValues('password') || 'The passwords do not match' })} />
        </Field>
        <Button type="submit" size="lg" disabled={isSubmitting}>{isSubmitting ? 'Creating account…' : 'Create account'}</Button>
      </form>
    </AuthCard>
  );
}
