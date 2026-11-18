// Sign out asks for confirmation first; Cancel keeps the session, confirming ends it.
import { screen, fireEvent, waitFor, within } from '@testing-library/react';
import { Route } from 'react-router-dom';
import { vi } from 'vitest';
import { renderAt, signIn } from './render';
import { AppShell } from '../components/layout/AppShell';

vi.mock('../appRoutes', () => ({ default: [], reportPresets: [], bulkActions: {} }));
vi.mock('../hooks/useApi', () => ({ useApi: () => ({ get: vi.fn(async () => ({ data: { items: [], unread: 0 } })), post: vi.fn() }) }));
vi.mock('../api/meta', () => ({
  meta: vi.fn(async () => ({ appName: 'Test Crypt', roles: ['Admin', 'Member'], superuserRole: 'Admin', resources: [] })),
  publicMeta: vi.fn(async () => ({ appName: 'Test Crypt', demo: false, demoUsers: [] })),
}));

beforeEach(() => { localStorage.clear(); signIn({ role: 'Member' }); });

const render = () => renderAt(<AppShell />, { path: '/', route: '/', withMeta: false, extraRoutes: <Route path="/login" element={<p>Login page</p>} /> });

describe('sign out', () => {
  it('asks "Are you sure?" first, and Cancel keeps you signed in', async () => {
    render();
    fireEvent.click(await screen.findByRole('button', { name: 'Sign out' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Sign out?');
    expect(dialog).toHaveTextContent(/Are you sure you want to sign out of/);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(localStorage.getItem('crypt_token')).toBeTruthy();
    expect(screen.queryByText('Login page')).not.toBeInTheDocument();
  });

  it('confirming signs you out and goes to the login page', async () => {
    render();
    fireEvent.click(await screen.findByRole('button', { name: 'Sign out' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /sign out/i }));
    await screen.findByText('Login page');
    expect(localStorage.getItem('crypt_token')).toBeNull();
  });
});
