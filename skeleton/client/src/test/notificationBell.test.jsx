import { screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { renderAt, signIn } from './render';
import { NotificationBell } from '../components/layout/NotificationBell';

const toastApi = vi.hoisted(() => { const t = vi.fn(); t.loading = vi.fn(() => 'tid'); t.success = vi.fn(); t.error = vi.fn(); return t; });
vi.mock('react-hot-toast', () => ({ default: toastApi }));
const get = vi.fn();
const post = vi.fn();
vi.mock('../hooks/useApi', () => ({ useApi: () => ({ get: (...a) => get(...a), post: (...a) => post(...a) }) }));

const items = [
  { _id: 'n1', title: 'Checkout "Scope" is now Overdue', body: 'Checkouts: status changed', kind: 'danger', link: '/r/checkouts/c1', readAt: null, createdAt: new Date().toISOString() },
  { _id: 'n2', title: 'Old news', body: '', kind: 'info', link: '', readAt: '2020-01-01', createdAt: '2020-01-01' },
];

beforeEach(() => { localStorage.clear(); get.mockReset(); post.mockReset(); signIn({ role: 'Member' }); });

describe('NotificationBell', () => {
  it('shows the unread count, lists items, and opening one marks it read and navigates', async () => {
    get.mockResolvedValue({ data: { items, unread: 1 } });
    post.mockResolvedValue({ data: {} });
    renderAt(<NotificationBell />, { withMeta: false, extraRoutes: <></> });

    const bell = await screen.findByRole('button', { name: 'Notifications, 1 unread' });
    fireEvent.click(bell);
    expect(await screen.findByText('Old news')).toBeInTheDocument();
    fireEvent.click(screen.getByText(/Checkout "Scope" is now Overdue/));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/notifications/n1/read'));
  });

  it('"Mark all read" calls the API and an empty list shows a friendly message', async () => {
    get.mockResolvedValueOnce({ data: { items, unread: 1 } });
    post.mockResolvedValue({ data: { updated: 1 } });
    renderAt(<NotificationBell />, { withMeta: false });
    fireEvent.click(await screen.findByRole('button', { name: /Notifications, 1 unread/ }));
    get.mockResolvedValue({ data: { items: [], unread: 0 } });
    fireEvent.click(await screen.findByRole('button', { name: /mark all read/i }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/notifications/read-all'));
    expect(await screen.findByText(/nothing is haunting you/i)).toBeInTheDocument();
  });

  it('no badge when everything is read', async () => {
    get.mockResolvedValue({ data: { items: [], unread: 0 } });
    renderAt(<NotificationBell />, { withMeta: false });
    expect(await screen.findByRole('button', { name: 'Notifications' })).toBeInTheDocument();
  });

  it('"Email me a test" shows a sending notice that mentions spam, then the result', async () => {
    get.mockResolvedValue({ data: { items: [], unread: 0 } });
    post.mockResolvedValue({ data: { to: 'me@x.test' } });
    renderAt(<NotificationBell />, { withMeta: false });
    fireEvent.click(await screen.findByRole('button', { name: 'Notifications' }));
    fireEvent.click(await screen.findByRole('button', { name: /email me a test/i }));
    expect(toastApi.loading).toHaveBeenCalledWith(expect.stringMatching(/spam/i), expect.anything());
    await waitFor(() => expect(post).toHaveBeenCalledWith('/notifications/test-email'));
    await waitFor(() => expect(toastApi.success).toHaveBeenCalledWith(expect.stringMatching(/me@x\.test.*spam/i), expect.objectContaining({ id: 'tid' })));
  });

  it('shows the error when email is not set up', async () => {
    get.mockResolvedValue({ data: { items: [], unread: 0 } });
    post.mockRejectedValue({ response: { data: { error: 'Email is not set up on this server yet' } } });
    renderAt(<NotificationBell />, { withMeta: false });
    fireEvent.click(await screen.findByRole('button', { name: 'Notifications' }));
    fireEvent.click(await screen.findByRole('button', { name: /email me a test/i }));
    await waitFor(() => expect(toastApi.error).toHaveBeenCalledWith(expect.stringMatching(/not set up/), expect.objectContaining({ id: 'tid' })));
  });
});