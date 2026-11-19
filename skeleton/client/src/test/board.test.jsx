// Board (Kanban) view of the list page.
import { screen, fireEvent, waitFor, within } from '@testing-library/react';
import { vi } from 'vitest';
import toast from 'react-hot-toast';
import { renderAt, signIn } from './render';
import ResourceList from '../pages/ResourceList';

vi.mock('../appRoutes', () => ({ default: [], reportPresets: [], bulkActions: {} }));

const tasks = {
  key: 'tasks', label: 'Tasks', icon: 'scroll-text', titleField: 'title', searchable: true,
  fields: [
    { name: 'title', type: 'string', label: 'Title', list: true, search: true },
    { name: 'status', type: 'enum', label: 'Status', values: ['Open', 'Done', 'Locked', 'Archived'], list: true, filter: true },
    { name: 'priority', type: 'enum', label: 'Priority', values: ['High', 'Low'], list: true },
    { name: 'owner', type: 'ref', ref: 'User', label: 'Owner', list: true },
    { name: 'dueDate', type: 'date', label: 'Due', list: true },
  ],
  rolePermissions: { read: ['Member', 'Viewer'], update: ['Member'] },
  genericDisabled: [],
  statusFlow: { field: 'status', transitions: { Open: ['Done', 'Locked'], Done: ['Open'], Locked: [], Archived: [] }, workflowOnly: ['Locked'] },
  due: null,
  softDelete: { field: 'status', value: 'Archived' },
};
vi.mock('../api/meta', () => ({
  meta: vi.fn(async () => ({ appName: 'Test', roles: ['Admin', 'Member', 'Viewer'], superuserRole: 'Admin', resources: [tasks] })),
  publicMeta: vi.fn(async () => ({})),
}));

let db;
const listRecords = vi.fn(async (_api, _key, params) => {
  const rows = db.filter((r) => r.status === params.status);
  const total = params.status === 'Open' ? rows.length + 2 : rows.length;
  return { items: rows, total, page: 1, pages: 1 };
});
const updateRecord = vi.fn();
vi.mock('../api/resources', () => ({
  listRecords: (...a) => listRecords(...a),
  updateRecord: (...a) => updateRecord(...a),
}));

const dt = () => ({ setData: vi.fn(), effectAllowed: '', dropEffect: '' });
const col = (s) => screen.getByTestId(`board-col-${s}`);
const card = (id) => screen.getByTestId(`board-card-${id}`);
const route = '/r/tasks?view=board';
const open = (r = route) => renderAt(<ResourceList />, { path: '/r/:key', route: r });

beforeEach(() => {
  localStorage.clear();
  listRecords.mockClear();
  updateRecord.mockReset();
  signIn({ role: 'Member' });
  db = [
    { _id: 't1', title: 'Brew potion', status: 'Open', priority: 'High', owner: { _id: 'u1', name: 'Tess' }, dueDate: '2026-11-12' },
    { _id: 't2', title: 'Feed raven', status: 'Done', priority: 'Low' },
  ];
});

describe('Board view', () => {
  it('has a column per status in transitions order, hiding the soft-delete status', async () => {
    open();
    await screen.findByTestId('board');
    const names = screen.getAllByRole('region').map((r) => r.getAttribute('aria-label'));
    expect(names).toEqual(['Open column', 'Done column', 'Locked column']);
    expect(screen.queryByTestId('board-col-Archived')).not.toBeInTheDocument();
  });

  it('shows the soft-delete column when the user filters for it', async () => {
    open('/r/tasks?view=board&status=Archived');
    await screen.findByTestId('board-col-Archived');
    expect(screen.queryByTestId('board-col-Open')).not.toBeInTheDocument();
  });

  it('fetches each column with the search/filters plus status and limit 50', async () => {
    open('/r/tasks?view=board&q=potion&priority=High');
    await screen.findByText('Brew potion');
    const calls = listRecords.mock.calls.map((c) => c[2]);
    expect(calls).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: 'Open', q: 'potion', priority: 'High', limit: 50 }),
      expect.objectContaining({ status: 'Done', q: 'potion', priority: 'High', limit: 50 }),
    ]));
    expect(calls.every((p) => p.view === undefined && p.page === undefined)).toBe(true);
  });

  it('shows card details, the column count and a "+N more" link to the filtered list', async () => {
    open();
    const c = await screen.findByTestId('board-card-t1');
    expect(within(c).getByRole('link', { name: 'Brew potion' })).toHaveAttribute('href', '/r/tasks/t1');
    expect(within(c).getByText('Tess')).toBeInTheDocument();
    expect(within(c).getByText('High')).toBeInTheDocument();
    expect(within(c).getByText(/12 Nov 2026/)).toBeInTheDocument();
    expect(within(col('Open')).getByLabelText('3 records')).toBeInTheDocument();
    const more = within(col('Open')).getByRole('link', { name: '+2 more' });
    expect(more.getAttribute('href')).toContain('/r/tasks?');
    expect(more.getAttribute('href')).toContain('status=Open');
  });

  it('moves a card by drag and drop with PATCH and an optimistic update', async () => {
    updateRecord.mockImplementation(async (_a, _k, id, body) => {
      db = db.map((r) => (r._id === id ? { ...r, ...body } : r));
      return {};
    });
    open();
    await screen.findByTestId('board-card-t1');
    fireEvent.dragStart(card('t1'), { dataTransfer: dt() });
    expect(col('Done')).toHaveAttribute('data-drop', 'allowed');
    expect(col('Locked')).toHaveAttribute('data-drop', 'blocked');
    fireEvent.dragOver(col('Done'), { dataTransfer: dt() });
    fireEvent.drop(col('Done'), { dataTransfer: dt() });
    await waitFor(() => expect(updateRecord).toHaveBeenCalledWith(expect.anything(), 'tasks', 't1', { status: 'Done' }));
    await waitFor(() => expect(within(col('Done')).getByText('Brew potion')).toBeInTheDocument());
    expect(within(col('Open')).queryByText('Brew potion')).not.toBeInTheDocument();
  });

  it('refuses drops on workflow-only or unreachable columns', async () => {
    open();
    await screen.findByTestId('board-card-t1');
    fireEvent.dragStart(card('t1'), { dataTransfer: dt() });
    fireEvent.drop(col('Locked'), { dataTransfer: dt() });
    expect(updateRecord).not.toHaveBeenCalled();
    fireEvent.dragEnd(card('t1'));
    fireEvent.dragStart(card('t2'), { dataTransfer: dt() });
    fireEvent.drop(col('Locked'), { dataTransfer: dt() });
    expect(updateRecord).not.toHaveBeenCalled();
    expect(within(col('Done')).getByText('Feed raven')).toBeInTheDocument();
  });

  it('offers a "Move to…" menu with only the allowed targets', async () => {
    updateRecord.mockResolvedValue({});
    open();
    const c = await screen.findByTestId('board-card-t1');
    fireEvent.click(within(c).getByRole('button', { name: 'Move Brew potion to…' }));
    const items = within(screen.getByRole('menu')).getAllByRole('menuitem').map((i) => i.textContent);
    expect(items).toEqual(['Done']);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Done' }));
    await waitFor(() => expect(updateRecord).toHaveBeenCalledWith(expect.anything(), 'tasks', 't1', { status: 'Done' }));
  });

  it('rolls back and toasts when the PATCH fails', async () => {
    const err = vi.spyOn(toast, 'error').mockImplementation(() => '');
    updateRecord.mockRejectedValue(new Error('nope'));
    open();
    const c = await screen.findByTestId('board-card-t1');
    fireEvent.click(within(c).getByRole('button', { name: 'Move Brew potion to…' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Done' }));
    await waitFor(() => expect(err).toHaveBeenCalled());
    expect(within(col('Open')).getByText('Brew potion')).toBeInTheDocument();
    expect(within(col('Done')).queryByText('Brew potion')).not.toBeInTheDocument();
    err.mockRestore();
  });

  it('is read-only without update permission', async () => {
    signIn({ role: 'Viewer' });
    open();
    const c = await screen.findByTestId('board-card-t1');
    expect(c).not.toHaveAttribute('draggable', 'true');
    expect(within(c).queryByRole('button', { name: /Move/ })).not.toBeInTheDocument();
    fireEvent.dragStart(c, { dataTransfer: dt() });
    fireEvent.drop(col('Done'), { dataTransfer: dt() });
    expect(updateRecord).not.toHaveBeenCalled();
  });
});
