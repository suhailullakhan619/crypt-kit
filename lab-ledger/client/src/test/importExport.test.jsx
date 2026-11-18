// CSV import (check, then confirm) and export buttons on the generic list page
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { renderAt, signIn } from './render';
import ResourceList from '../pages/ResourceList';

const post = vi.fn();
const get = vi.fn();
vi.mock('../hooks/useApi', () => ({ useApi: () => ({ post: (...a) => post(...a), get: (...a) => get(...a) }) }));
vi.mock('../appRoutes', () => ({ default: [], reportPresets: [], bulkActions: {} }));
vi.mock('../api/meta', () => ({
  meta: vi.fn(async () => ({
    appName: 'Test', roles: ['Admin', 'Member', 'Viewer'], superuserRole: 'Admin',
    resources: [{
      key: 'notes', label: 'Notes', icon: 'scroll-text', titleField: 'title', searchable: false,
      fields: [{ name: 'title', type: 'string', label: 'Title', list: true }],
      rolePermissions: { read: ['Member', 'Viewer'], create: ['Member'] },
      genericDisabled: [], statusFlow: null, due: null, softDelete: null,
    }],
  })),
  publicMeta: vi.fn(async () => ({})),
}));
vi.mock('../api/resources', () => ({
  listRecords: vi.fn(async () => ({ items: [{ _id: 'a', title: 'Bat wing' }], total: 1, page: 1, pages: 1 })),
}));

beforeEach(() => { localStorage.clear(); post.mockReset(); get.mockReset(); });

const csvFile = (text) => new File([text], 'notes.csv', { type: 'text/csv' });

describe('CSV import / export buttons', () => {
  it('Member sees Import and Export; Viewer sees only Export', async () => {
    signIn({ role: 'Member' });
    const { unmount } = renderAt(<ResourceList />, { path: '/r/:key', route: '/r/notes' });
    expect(await screen.findByRole('button', { name: /import csv/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /export csv/i })).toBeInTheDocument();
    unmount();

    signIn({ role: 'Viewer' });
    renderAt(<ResourceList />, { path: '/r/:key', route: '/r/notes' });
    expect(await screen.findByRole('button', { name: /export csv/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /import csv/i })).not.toBeInTheDocument();
  });

  it('checks the file first, shows row problems, and only writes after confirming', async () => {
    post.mockResolvedValueOnce({
      data: { dryRun: true, total: 3, valid: 2, created: 0, ignoredColumns: ['Mystery'], preview: [], errors: [{ row: 3, message: 'title: Path `title` is required.' }] },
    });
    post.mockResolvedValueOnce({ data: { dryRun: false, total: 3, valid: 2, created: 2, ignoredColumns: [], preview: [], errors: [{ row: 3, message: 'title: required' }] } });

    signIn({ role: 'Member' });
    renderAt(<ResourceList />, { path: '/r/:key', route: '/r/notes' });
    fireEvent.click(await screen.findByRole('button', { name: /import csv/i }));
    fireEvent.change(await screen.findByLabelText('CSV file'), { target: { files: [csvFile('Title\nA\n\nB\n')] } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Check file' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Check file' }));

    expect(await screen.findByText(/2 of 3 rows are ready to import/)).toBeInTheDocument();
    expect(screen.getByText(/Ignored columns: Mystery/)).toBeInTheDocument();
    expect(screen.getByText(/Row 3:/)).toBeInTheDocument();
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0][1]).toMatchObject({ dryRun: true });

    fireEvent.click(screen.getByRole('button', { name: 'Import 2 rows' }));
    expect(await screen.findByText(/Imported 2 of 3 rows\./)).toBeInTheDocument();
    expect(post.mock.calls[1][1]).toMatchObject({ dryRun: false });
  });

  it('Export CSV downloads through the API with the active filters', async () => {
    get.mockResolvedValue({ data: new Blob(['a,b']) });
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    signIn({ role: 'Viewer' });
    renderAt(<ResourceList />, { path: '/r/:key', route: '/r/notes?q=bat&page=2' });
    fireEvent.click(await screen.findByRole('button', { name: /export csv/i }));
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    expect(get.mock.calls[0][0]).toBe('/r/notes/export');
    expect(get.mock.calls[0][1].params).toEqual({ q: 'bat' });
  });
});
