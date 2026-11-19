// Comments card on the detail page: list, post, delete with confirm, permissions, disabled resources.
import { screen, fireEvent, waitFor, within } from '@testing-library/react';
import { vi } from 'vitest';
import { renderAt, signIn } from './render';
import ResourceDetail from '../pages/ResourceDetail';
import { listComments, addComment, deleteComment } from '../api/comments';

const mk = (over = {}) => ({
  key: 'notes', label: 'Notes', icon: 'box', titleField: 'title',
  fields: [{ name: 'title', type: 'string', label: 'Title', list: true }],
  rolePermissions: { read: ['Member'] }, genericDisabled: [], statusFlow: null, due: null, softDelete: null, ...over,
});
let resources = [mk()];

vi.mock('../appRoutes', () => ({ default: [], reportPresets: [], bulkActions: {} }));
vi.mock('../api/meta', () => ({
  meta: vi.fn(async () => ({ appName: 'T', roles: ['Admin', 'Member'], superuserRole: 'Admin', resources })),
  publicMeta: vi.fn(async () => ({})),
}));
vi.mock('../api/resources', () => ({
  getRecord: vi.fn(async () => ({ _id: 'n1', title: 'Hello' })),
  recordActivity: vi.fn(async () => []),
  updateRecord: vi.fn(),
  deleteRecord: vi.fn(),
}));
vi.mock('../api/comments', () => ({ listComments: vi.fn(), addComment: vi.fn(async () => ({})), deleteComment: vi.fn(async () => null) }));

const when = new Date(Date.now() - 3 * 60000).toISOString();
const mine = { _id: 'c1', body: 'First line\nSecond <b>line</b>', author: { _id: 'u1', name: 'Tess', role: 'Member' }, createdAt: when, canDelete: true };
const theirs = { _id: 'c2', body: 'Other', author: { _id: 'u2', name: 'Bo', role: 'Admin' }, createdAt: when, canDelete: false };

beforeEach(() => {
  localStorage.clear(); signIn({ role: 'Member' }); vi.clearAllMocks(); resources = [mk()];
  listComments.mockResolvedValue([mine, theirs]);
});
const open = () => renderAt(<ResourceDetail />, { path: '/r/:key/:id', route: '/r/notes/n1' });

describe('comments card', () => {
  it('lists comments with author, role, relative time and plain-text bodies', async () => {
    open();
    await screen.findByText('Tess');
    expect(screen.getAllByText('3 minutes ago')).toHaveLength(2);
    const body = screen.getByText(/First line/);
    expect(body.textContent).toBe('First line\nSecond <b>line</b>'); // escaped, never HTML
    expect(body.className).toMatch(/whitespace-pre-wrap/);
    expect(body.closest('li').querySelector('b')).toBeNull();
    expect(screen.getAllByRole('time')[0]).toHaveAttribute('title');
  });

  it('only shows Delete where canDelete is true', async () => {
    open();
    await screen.findByText('Bo');
    expect(screen.getAllByRole('button', { name: 'Delete comment' })).toHaveLength(1);
  });

  it('shows the empty state', async () => {
    listComments.mockResolvedValue([]);
    open();
    await screen.findByText('No comments yet');
  });

  it('posts with the button and with Ctrl+Enter, then clears the box', async () => {
    open();
    const box = await screen.findByLabelText('Add a comment');
    const button = screen.getByRole('button', { name: 'Comment' });
    expect(button).toBeDisabled();
    fireEvent.change(box, { target: { value: '  hi there  ' } });
    fireEvent.click(button);
    await waitFor(() => expect(addComment).toHaveBeenCalledWith(expect.anything(), 'notes', 'n1', 'hi there'));
    await waitFor(() => expect(box).toHaveValue(''));
    fireEvent.change(box, { target: { value: 'again' } });
    fireEvent.keyDown(box, { key: 'Enter', ctrlKey: true });
    await waitFor(() => expect(addComment).toHaveBeenLastCalledWith(expect.anything(), 'notes', 'n1', 'again'));
    await waitFor(() => expect(listComments.mock.calls.length).toBeGreaterThan(1)); // refreshed
  });

  it('asks for confirmation before deleting', async () => {
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Delete comment' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(deleteComment).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Delete comment' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(deleteComment).toHaveBeenCalledWith(expect.anything(), 'notes', 'n1', 'c1'));
  });

  it('is absent when the resource has comments: false', async () => {
    resources = [mk({ comments: false })];
    open();
    await screen.findByRole('heading', { level: 1, name: /Hello/ });
    expect(screen.queryByText('Add a comment')).not.toBeInTheDocument();
    expect(listComments).not.toHaveBeenCalled();
  });
});
