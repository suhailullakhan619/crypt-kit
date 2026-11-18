import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { useApi } from '../hooks/useApi';
import { resetPassword } from '../api/auth';
import { Button, buttonVariants } from '../components/ui/button';
import { Input, PasswordInput } from '../components/ui/input';
import { errorMessage } from '../lib/utils';
import { AuthCard, Field } from './AuthCard';

/** Sets a new password from the emailed link (`/reset-password?token=…`). */
export default function ResetPassword() {
  const api = useApi();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const { register, handleSubmit, getValues, setError, formState: { errors, isSubmitting } } = useForm();

  const onSubmit = handleSubmit(async ({ password }) => {
    try {
      await resetPassword(api, token, password);
      toast.success('Password changed. Sign in with your new password.');
      navigate('/login', { replace: true });
    } catch (err) {
      setError('root', { message: errorMessage(err) });
    }
  });

  if (!token) {
    return (
      <AuthCard subtitle="Set a new password.">
        <div role="alert" className="flex flex-col gap-3 text-center text-sm">
          <p>This page needs the link from your reset email. Ask for a new one if it has expired.</p>
          <Link to="/forgot-password" className={buttonVariants({ variant: 'secondary' })}>Send a new link</Link>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard subtitle="Choose a new password." footer={<Link to="/login" className="font-medium text-primary hover:underline">Back to sign in</Link>}>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <Field id="rp-password" label="New password" error={errors.password?.message}>
          <PasswordInput id="rp-password" autoComplete="new-password" aria-invalid={!!errors.password} {...register('password', { required: 'Password is required', minLength: { value: 8, message: 'At least 8 characters' } })} />
        </Field>
        <Field id="rp-confirm" label="Confirm new password" error={errors.confirm?.message}>
          <PasswordInput id="rp-confirm" autoComplete="new-password" aria-invalid={!!errors.confirm} {...register('confirm', { required: 'Confirm your password', validate: (v) => v === getValues('password') || 'The passwords do not match' })} />
        </Field>
        {errors.root && (
          <div role="alert" className="flex flex-col gap-2 text-sm text-destructive">
            <p>{errors.root.message}</p>
            <Link to="/forgot-password" className="font-medium text-primary hover:underline">Send a new link</Link>
          </div>
        )}
        <Button type="submit" size="lg" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : 'Set new password'}</Button>
      </form>
    </AuthCard>
  );
}
