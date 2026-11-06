// Bulk actions (Req 16.14) and genericDisabled-aware UI (Req 16.12)
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { renderAt, signIn } from './render';
import ResourceList from '../pages/ResourceList';

const run = vi.fn(async ({ ids }) => `Printed ${ids.length}`);
let disabled = [];

vi.mock('../appRoutes', () => ({
  default: [],
  reportPresets: [],
  bulkActions: { notes: [{ label: 'Print labels', icon: 'printer', roles: ['Member'], run: (...a) => run(...a) }] },
}));
vi.mock('../api/meta', () => ({
  meta: vi.fn(async () => ({
    appName: 'Test', roles: ['Admin', 'Member', 'Viewer'], superuserRole: 'Admin',
    resources: [{
      key: 'notes', label: 'Notes', icon: 'scroll-text', titleField: 'title', searchable: false,
      fields: [{ name: 'title', type: 'string', label: 'Title', list: true }],
      rolePermissions: { read: ['Member', 'Viewer'], create: ['Member'] },
      genericDisabled: disabled, statusFlow: null, due: null, softDelete: null,
    }],
  })),
  publicMeta: vi.fn(async () => ({})),
}));
vi.mock('../api/resources', () => ({
  listRecords: vi.fn(async () => ({
    items: [{ _id: 'a', title: 'Bat wing' }, { _id: 'b', title: 'Eye of newt' }], total: 2, page: 1, pages: 1,
  })),
}));

beforeEach(() => { localStorage.clear(); run.mockClear(); disabled = []; });

describe('bulk actions', () => {
  it('Member gets checkboxes; selecting rows shows the action bar and runs the action with the ids', async () => {
    signIn({ role: 'Member' });
    renderAt(<ResourceList />, { path: '/r/:key', route: '/r/notes' });
    const boxes = await screen.findAllByRole('checkbox', { name: 'Select Bat wing' });
    fireEvent.click(boxes[0]);
    fireEvent.click(screen.getAllByRole('checkbox', { name: 'Select Eye of newt' })[0]);
    expect(screen.getByText('2 selected')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /print labels/i }));
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    expect(run.mock.calls[0][0].ids.sort()).toEqual(['a', 'b']);
  });

  it('Viewer (not in the action roles) gets no checkboxes', async () => {
    signIn({ role: 'Viewer' });
    renderAt(<ResourceList />, { path: '/r/:key', route: '/r/notes' });
    expect((await screen.findAllByText('Bat wing')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });
});

describe('genericDisabled', () => {
  it('hides the generic Create button even for a role allowed to create', async () => {
    disabled = ['create'];
    signIn({ role: 'Member' });
    renderAt(<ResourceList />, { path: '/r/:key', route: '/r/notes' });
    expect((await screen.findAllByText('Bat wing')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: /new note/i })).not.toBeInTheDocument();
  });

  it('shows Create when nothing is disabled', async () => {
    signIn({ role: 'Member' });
    renderAt(<ResourceList />, { path: '/r/:key', route: '/r/notes' });
    expect(await screen.findByRole('link', { name: /new note/i })).toBeInTheDocument();
  });
});
