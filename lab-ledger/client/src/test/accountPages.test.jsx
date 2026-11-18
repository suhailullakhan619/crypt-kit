// Sign-up, forgot password and reset password screens, the login-page links, and Approve on Users.
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { Route } from 'react-router-dom';
import { vi } from 'vitest';
import { renderAt, signIn } from './render';
import Login from '../pages/Login';
import Signup from '../pages/Signup';
import ForgotPassword from '../pages/ForgotPassword';
import ResetPassword from '../pages/ResetPassword';
import Users from '../pages/Users';

let pub;
const post = vi.fn();
const get = vi.fn();
const patch = vi.fn();
vi.mock('../hooks/useApi', () => ({ useApi: () => ({ post: (...a) => post(...a), get: (...a) => get(...a), patch: (...a) => patch(...a) }) }));
vi.mock('../api/meta', () => ({
  publicMeta: vi.fn(async () => pub),
  meta: vi.fn(async () => ({ appName: 'Test', roles: ['Admin', 'Member', 'Viewer'], superuserRole: 'Admin', resources: [] })),
}));
vi.mock('../appRoutes', () => ({ default: [], reportPresets: [], bulkActions: {} }));

beforeEach(() => {
  localStorage.clear();
  post.mockReset(); get.mockReset(); patch.mockReset();
  pub = { appName: 'Test App', demo: false, demoUsers: [], signup: true, passwordReset: true };
});
const type = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('login page links', () => {
  it('offers "Forgot password?" and "Create an account" when the server allows them', async () => {
    renderAt(<Login />, { path: '/login', route: '/login', withMeta: false });
    expect(await screen.findByRole('link', { name: 'Forgot password?' })).toHaveAttribute('href', '/forgot-password');
    expect(screen.getByRole('link', { name: 'Create an account' })).toHaveAttribute('href', '/signup');
  });
  it('hides them when sign-up is off and email is not set up', async () => {
    pub = { ...pub, signup: false, passwordReset: false };
    renderAt(<Login />, { path: '/login', route: '/login', withMeta: false });
    await screen.findByText('Test App');
    expect(screen.queryByRole('link', { name: 'Forgot password?' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Create an account' })).not.toBeInTheDocument();
  });
});

describe('sign-up page', () => {
  it('checks the form, sends name/email/password, then explains the approval wait', async () => {
    post.mockResolvedValue({ data: { pending: true, email: 'new@x.test' } });
    renderAt(<Signup />, { path: '/signup', route: '/signup', withMeta: false });
    await screen.findByLabelText('Name');
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('Name is required')).toBeInTheDocument();
    type('Name', 'New Person'); type('Email', 'new@x.test'); type('Password', 'new-password-1'); type('Confirm password', 'different-1');
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('The passwords do not match')).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
    type('Confirm password', 'new-password-1');
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/auth/signup', { name: 'New Person', email: 'new@x.test', password: 'new-password-1' }));
    expect(await screen.findByRole('status')).toHaveTextContent(/waiting for approval/i);
    expect(screen.getByRole('status')).toHaveTextContent(/spam folder/);
  });
  it('shows the server message for a taken email next to the field', async () => {
    post.mockRejectedValue({ response: { data: { error: 'An account with this email already exists.', fields: { email: 'Already registered' } } } });
    renderAt(<Signup />, { path: '/signup', route: '/signup', withMeta: false });
    await screen.findByLabelText('Name');
    type('Name', 'Dup'); type('Email', 'dup@x.test'); type('Password', 'dup-password-1'); type('Confirm password', 'dup-password-1');
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('Already registered')).toBeInTheDocument();
  });
});

describe('forgot password page', () => {
  it('sends the email and says to check spam, without saying whether the account exists', async () => {
    post.mockResolvedValue({ data: { message: 'ok' } });
    renderAt(<ForgotPassword />, { path: '/forgot-password', route: '/forgot-password', withMeta: false });
    type(await screen.findByLabelText('Email').then(() => 'Email'), 'me@x.test');
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/auth/forgot-password', { email: 'me@x.test' }));
    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent(/If an account uses me@x\.test/);
    expect(status).toHaveTextContent(/spam folder/);
  });
});

describe('reset password page', () => {
  it('sets the new password with the token from the link, then goes to sign in', async () => {
    post.mockResolvedValue({ data: {} });
    renderAt(<ResetPassword />, { path: '/reset-password', route: '/reset-password?token=abc123def456ghi789jkl', withMeta: false, extraRoutes: <Route path="/login" element={<p>Login page</p>} /> });
    type(await screen.findByLabelText('New password').then(() => 'New password'), 'brand-new-pass-1');
    type('Confirm new password', 'brand-new-pass-1');
    fireEvent.click(screen.getByRole('button', { name: 'Set new password' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/auth/reset-password', { token: 'abc123def456ghi789jkl', password: 'brand-new-pass-1' }));
    expect(await screen.findByText('Login page')).toBeInTheDocument();
  });
  it('explains an expired link and offers a new one', async () => {
    post.mockRejectedValue({ response: { data: { error: 'This reset link is invalid or has expired. Ask for a new one.' } } });
    renderAt(<ResetPassword />, { path: '/reset-password', route: '/reset-password?token=abc123def456ghi789jkl', withMeta: false });
    type(await screen.findByLabelText('New password').then(() => 'New password'), 'brand-new-pass-1');
    type('Confirm new password', 'brand-new-pass-1');
    fireEvent.click(screen.getByRole('button', { name: 'Set new password' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/expired/);
    expect(screen.getByRole('link', { name: 'Send a new link' })).toHaveAttribute('href', '/forgot-password');
  });
  it('without a token, points to the forgot-password page', async () => {
    renderAt(<ResetPassword />, { path: '/reset-password', route: '/reset-password', withMeta: false });
    expect(await screen.findByRole('link', { name: 'Send a new link' })).toBeInTheDocument();
  });
});

describe('Users page', () => {
  it('marks a pending sign-up and approves it with one click', async () => {
    signIn({ role: 'Admin', userId: 'me' });
    get.mockResolvedValue({ data: { items: [
      { _id: 'me', name: 'Boss', email: 'boss@x.test', role: 'Admin', active: true, pendingApproval: false },
      { _id: 'p1', name: 'New Person', email: 'new@x.test', role: 'Viewer', active: false, pendingApproval: true },
    ], total: 2, page: 1, pages: 1 } });
    patch.mockResolvedValue({ data: { user: {} } });
    renderAt(<Users />, { path: '/users', route: '/users' });
    expect(await screen.findByText('Waiting for approval')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(patch).toHaveBeenCalledWith('/users/p1', { active: true }));
  });
});
