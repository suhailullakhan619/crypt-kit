import { screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { renderAt, signIn } from './render';
import ResourceList from '../pages/ResourceList';
import { normaliseQuery, loadViews } from '../components/resource/SavedViews';

vi.mock('../appRoutes', () => ({ default: [], reportPresets: [], bulkActions: {} }));
vi.mock('../api/meta', () => ({
  meta: vi.fn(async () => ({
    appName: 'Test', roles: ['Admin', 'Member', 'Viewer'], superuserRole: 'Admin',
    resources: [{
      key: 'notes', label: 'Notes', icon: 'scroll-text', titleField: 'title', searchable: true,
      fields: [
        { name: 'title', type: 'string', label: 'Title', list: true },
        { name: 'status', type: 'enum', label: 'Status', values: ['Open', 'Done'], list: true, filter: true },
      ],
      rolePermissions: { read: ['Member', 'Viewer'], create: ['Member'] },
      genericDisabled: [], statusFlow: null, due: null, softDelete: null,
    }],
  })),
  publicMeta: vi.fn(async () => ({})),
}));
const listRecords = vi.fn(async () => ({ items: [{ _id: 'a', title: 'Bat wing', status: 'Open' }], total: 1, page: 1, pages: 1 }));
vi.mock('../api/resources', () => ({ listRecords: (...a) => listRecords(...a) }));

beforeEach(() => { localStorage.clear(); listRecords.mockClear(); signIn({ role: 'Viewer' }); });

describe('normaliseQuery', () => {
  it('drops paging and empty values and sorts keys so equal filters compare equal', () => {
    expect(normaliseQuery(new URLSearchParams('page=3&status=Open&q='))).toBe('status=Open');
    expect(normaliseQuery(new URLSearchParams('status=Open&q=bat'))).toBe(normaliseQuery(new URLSearchParams('q=bat&status=Open')));
  });
});

describe('SavedViews on the list page', () => {
  it('shows nothing until a search or filter is active', async () => {
    renderAt(<ResourceList />, { path: '/r/:key', route: '/r/notes' });
    expect((await screen.findAllByText('Bat wing')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('group', { name: 'Saved views' })).not.toBeInTheDocument();
  });

  it('saves the current filters under a name and keeps them in this browser', async () => {
    renderAt(<ResourceList />, { path: '/r/:key', route: '/r/notes?status=Open' });
    fireEvent.click(await screen.findByRole('button', { name: /save view/i }));
    fireEvent.change(screen.getByLabelText('View name'), { target: { value: 'Open notes' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('button', { name: 'Open notes' })).toHaveAttribute('aria-pressed', 'true');
    expect(loadViews('notes')).toEqual([{ name: 'Open notes', query: 'status=Open' }]);
  });

  it('applies a saved view and can delete it', async () => {
    localStorage.setItem('crypt_views_notes', JSON.stringify([{ name: 'Done ones', query: 'status=Done' }]));
    renderAt(<ResourceList />, { path: '/r/:key', route: '/r/notes' });
    fireEvent.click(await screen.findByRole('button', { name: 'Done ones' }));
    await waitFor(() => expect(listRecords.mock.calls.some((c) => c[2]?.status === 'Done')).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: 'Delete view Done ones' }));
    expect(loadViews('notes')).toEqual([]);
  });

  it('ignores corrupted saved data', () => {
    localStorage.setItem('crypt_views_notes', '{not json');
    expect(loadViews('notes')).toEqual([]);
    localStorage.setItem('crypt_views_notes', JSON.stringify([{ name: 1 }, { name: 'ok', query: 'a=b' }]));
    expect(loadViews('notes')).toEqual([{ name: 'ok', query: 'a=b' }]);
  });
});
