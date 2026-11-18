import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { MailCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useApi } from '../hooks/useApi';
import { forgotPassword } from '../api/auth';
import { Button, buttonVariants } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { errorMessage } from '../lib/utils';
import { AuthCard, Field } from './AuthCard';

/** Asks for an email and sends a one-time reset link (the answer is the same whether or not it exists). */
export default function ForgotPassword() {
  const { user } = useAuth();
  const api = useApi();
  const [sentTo, setSentTo] = useState(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm();

  if (user) return <Navigate to="/" replace />;

  const onSubmit = handleSubmit(async ({ email }) => {
    const id = toast.loading('Sending the reset link… It may land in your spam folder.');
    try {
      await forgotPassword(api, email);
      toast.dismiss(id);
      setSentTo(email);
    } catch (err) {
      toast.error(errorMessage(err), { id });
    }
  });

  return (
    <AuthCard subtitle="Forgot your password? We'll email you a link to set a new one." footer={<Link to="/login" className="font-medium text-primary hover:underline">Back to sign in</Link>}>
      {sentTo ? (
        <div role="status" className="flex flex-col items-center gap-3 text-center">
          <MailCheck className="h-10 w-10 text-primary" aria-hidden />
          <h2 className="text-lg font-semibold">Check your email</h2>
          <p className="text-sm text-muted-foreground">
            If an account uses <strong>{sentTo}</strong>, a reset link is on its way. It works once and expires in 30 minutes.
            <br />It may land in your <strong>spam folder</strong>, so look there too.
          </p>
          <Link to="/login" className={buttonVariants({ variant: 'secondary', className: 'mt-2 w-full' })}>Back to sign in</Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          <Field id="fp-email" label="Email" error={errors.email?.message}>
            <Input id="fp-email" type="email" autoComplete="email" aria-invalid={!!errors.email} {...register('email', { required: 'Email is required', pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Enter a valid email address' } })} />
          </Field>
          <Button type="submit" size="lg" disabled={isSubmitting}>{isSubmitting ? 'Sending…' : 'Send reset link'}</Button>
        </form>
      )}
    </AuthCard>
  );
}
