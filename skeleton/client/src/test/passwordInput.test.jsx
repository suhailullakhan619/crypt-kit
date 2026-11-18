// The eye button shows and hides a password, never submits the form, and works on every password screen.
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { vi } from 'vitest';
import { renderAt } from './render';
import { PasswordInput } from '../components/ui/input';
import Login from '../pages/Login';
import Signup from '../pages/Signup';
import ResetPassword from '../pages/ResetPassword';

vi.mock('../hooks/useApi', () => ({ useApi: () => ({ post: vi.fn(), get: vi.fn() }) }));
vi.mock('../api/meta', () => ({
  publicMeta: vi.fn(async () => ({ appName: 'Test App', demo: false, demoUsers: [], signup: true, passwordReset: true })),
  meta: vi.fn(async () => ({ appName: 'Test', roles: ['Admin'], superuserRole: 'Admin', resources: [] })),
}));

function Form({ onSubmit }) {
  const { register, handleSubmit } = useForm();
  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <label htmlFor="pw">Password</label>
      <PasswordInput id="pw" {...register('password')} />
      <button type="submit">Go</button>
    </form>
  );
}

describe('PasswordInput', () => {
  it('starts hidden, the eye shows it, a second click hides it again', () => {
    render(<Form onSubmit={() => {}} />);
    const input = screen.getByLabelText('Password');
    expect(input).toHaveAttribute('type', 'password');
    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(input).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Hide password' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(input).toHaveAttribute('type', 'password');
  });

  it('clicking the eye never submits, and the typed password still reaches the form', async () => {
    const onSubmit = vi.fn();
    render(<Form onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret-pass-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Password')).toHaveValue('secret-pass-1');
    fireEvent.click(screen.getByRole('button', { name: 'Go' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toEqual({ password: 'secret-pass-1' });
  });
});

describe('eye button on every password screen', () => {
  beforeEach(() => localStorage.clear());
  it.each([
    ['login', <Login />, '/login', 1],
    ['sign-up', <Signup />, '/signup', 2],
    ['reset password', <ResetPassword />, '/reset-password?token=abc123def456ghi789jkl', 2],
  ])('%s has an eye button on each password field', async (_name, page, route, count) => {
    renderAt(page, { path: route.split('?')[0], route, withMeta: false });
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Show password' })).toHaveLength(count));
  });
});
