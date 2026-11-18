import { screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { renderAt, signIn } from './render';
import { ChangePasswordDialog } from '../components/layout/ChangePasswordDialog';

const post = vi.fn();
vi.mock('../hooks/useApi', () => ({ useApi: () => ({ post: (...a) => post(...a) }) }));

beforeEach(() => { localStorage.clear(); post.mockReset(); signIn({ role: 'Member' }); });

const fill = (cur, next, confirm) => {
  fireEvent.change(screen.getByLabelText('Current password'), { target: { value: cur } });
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: next } });
  fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: confirm } });
};
const openDialog = async () => fireEvent.click(await screen.findByRole('button', { name: 'Change password' }));
const submit = () => fireEvent.click(screen.getAllByRole('button', { name: 'Change password' }).at(-1));

describe('ChangePasswordDialog', () => {
  it('blocks a mismatched or short password without calling the API', async () => {
    renderAt(<ChangePasswordDialog />, { withMeta: false });
    await openDialog();
    fill('old-password-1', 'new-password-2', 'different-3');
    submit();
    expect(await screen.findByRole('alert')).toHaveTextContent(/do not match/);
    fill('old-password-1', 'short', 'short');
    submit();
    expect(await screen.findByRole('alert')).toHaveTextContent(/at least 8/);
    expect(post).not.toHaveBeenCalled();
  });

  it('sends the passwords and closes on success', async () => {
    post.mockResolvedValue({ data: {} });
    renderAt(<ChangePasswordDialog />, { withMeta: false });
    await openDialog();
    fill('old-password-1', 'new-password-2', 'new-password-2');
    submit();
    await waitFor(() => expect(post).toHaveBeenCalledWith('/auth/change-password', { currentPassword: 'old-password-1', newPassword: 'new-password-2' }));
    await waitFor(() => expect(screen.queryByLabelText('Current password')).not.toBeInTheDocument());
  });

  it('shows the server error (wrong current password) and stays open', async () => {
    post.mockRejectedValue({ response: { data: { error: 'Current password is incorrect' } } });
    renderAt(<ChangePasswordDialog />, { withMeta: false });
    await openDialog();
    fill('wrong-password', 'new-password-2', 'new-password-2');
    submit();
    expect(await screen.findByRole('alert')).toHaveTextContent(/incorrect/i);
  });
});
