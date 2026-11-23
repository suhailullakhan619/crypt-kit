// Client behaviour tests (task 14.9) — Validates: Requirements 13.1, 13.6, 11.10
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { Route } from 'react-router-dom';
import { vi } from 'vitest';
import { renderAt, signIn } from './render';
import { ProtectedRoute } from '../components/layout/ProtectedRoute';
import ResourceList from '../pages/ResourceList';
import ResourceDetail from '../pages/ResourceDetail';
import VoiceAgent from '../pages/VoiceAgent';

const ROLES = ['Admin', 'Member', 'Viewer'];
const notes = {
  key: 'notes', label: 'Notes', icon: 'scroll-text', titleField: 'title', searchable: true,
  fields: [
    { name: 'title', type: 'string', label: 'Title', list: true, search: true, required: true },
    { name: 'status', type: 'enum', label: 'Status', values: ['Open', 'Done'], list: true, filter: true },
  ],
  rolePermissions: { read: ['Member', 'Viewer'], create: ['Member'], update: ['Member'], delete: [] },
  statusFlow: { field: 'status', transitions: { Open: ['Done'], Done: ['Open'] }, workflowOnly: [] },
  due: null, softDelete: null,
};

vi.mock('../api/meta', () => ({
  meta: vi.fn(async () => ({ appName: 'Test Crypt', roles: ROLES, superuserRole: 'Admin', resources: [notes] })),
  publicMeta: vi.fn(async () => ({ appName: 'Test Crypt', demo: false, demoUsers: [] })),
}));
vi.mock('../api/resources', () => ({
  listRecords: vi.fn(async () => ({ items: [{ _id: 'n1', title: 'Brew potion', status: 'Open' }], total: 1, page: 1, pages: 1 })),
  getRecord: vi.fn(async () => ({ _id: 'n1', title: 'Brew potion', status: 'Open', createdAt: '2026-11-01T00:00:00Z' })),
  recordActivity: vi.fn(async () => []),
  updateRecord: vi.fn(), deleteRecord: vi.fn(), createRecord: vi.fn(),
}));
vi.mock('../api/voice', () => ({
  examples: vi.fn(async () => ({ provider: 'browser', examples: ['how many notes are there'] })),
  ask: vi.fn(async () => { const e = new Error('boom'); e.response = { data: { error: 'The spirits are unavailable' } }; throw e; }),
}));

beforeEach(() => localStorage.clear());

describe('ProtectedRoute (Req 13.1)', () => {
  it('redirects unauthenticated users to /login', async () => {
    renderAt(<ProtectedRoute><p>secret</p></ProtectedRoute>, {
      withMeta: false,
      extraRoutes: <Route path="/login" element={<p>login page</p>} />,
    });
    expect(await screen.findByText('login page')).toBeInTheDocument();
    expect(screen.queryByText('secret')).not.toBeInTheDocument();
  });

  it('lets signed-in users through', async () => {
    signIn({ role: 'Viewer' });
    renderAt(<ProtectedRoute><p>secret</p></ProtectedRoute>, { withMeta: false });
    expect(await screen.findByText('secret')).toBeInTheDocument();
  });
});

describe('Property 15 (UI): Viewer sees no mutation controls (Req 13.6)', () => {
  it('list page hides Create for Viewer and shows it for Member', async () => {
    signIn({ role: 'Viewer' });
    const { unmount } = renderAt(<ResourceList />, { path: '/r/:key', route: '/r/notes' });
    // rendered twice: desktop table + mobile cards
    expect((await screen.findAllByText('Brew potion')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: /new note/i })).not.toBeInTheDocument();
    unmount();

    localStorage.clear();
    signIn({ role: 'Member' });
    renderAt(<ResourceList />, { path: '/r/:key', route: '/r/notes' });
    expect(await screen.findByRole('link', { name: /new note/i })).toBeInTheDocument();
  });

  it('detail page hides Edit, Delete and transitions for Viewer', async () => {
    signIn({ role: 'Viewer' });
    renderAt(<ResourceDetail />, { path: '/r/:key/:id', route: '/r/notes/n1' });
    expect(await screen.findByRole('heading', { name: 'Brew potion' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete|archive/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/move to/i)).not.toBeInTheDocument();
  });

  it('detail page shows Edit and transitions (but no Delete) for Member', async () => {
    signIn({ role: 'Member' });
    renderAt(<ResourceDetail />, { path: '/r/:key/:id', route: '/r/notes/n1' });
    expect(await screen.findByRole('button', { name: /edit/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /done/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete|archive/i })).not.toBeInTheDocument();
  });
});

describe('Voice agent states (Req 11.6, 11.8, 11.10)', () => {
  it('shows examples, falls back to text input, and displays server errors as text', async () => {
    signIn({ role: 'Viewer' });
    renderAt(<VoiceAgent />, { path: '/voice', route: '/voice' });
    expect(await screen.findByText(/how many notes are there/)).toBeInTheDocument();
    // jsdom has no speech recognition → typed fallback message
    expect(screen.getByText(/voice input is not available/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/or type a question/i), { target: { value: 'how many notes' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
    await waitFor(() => expect(screen.getByText('The spirits are unavailable')).toBeInTheDocument());
  });
});
