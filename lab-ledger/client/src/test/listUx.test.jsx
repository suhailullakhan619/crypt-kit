// List UX: whole-row click, sortable headers, view switcher, "Mine" chip.
import { screen, fireEvent, waitFor, within } from '@testing-library/react';
import { Route, useLocation } from 'react-router-dom';
import { vi } from 'vitest';
import { renderAt, signIn } from './render';
import ResourceList from '../pages/ResourceList';
import { availableViews, nextSort, isSortable, allowedTargets, boardColumns, monthWeeks, resolveView } from '../lib/listViews';

vi.mock('../appRoutes', () => ({
  default: [], reportPresets: [],
  bulkActions: { tasks: [{ label: 'Archive them', run: async () => 'ok' }] },
}));

const tasks = {
  key: 'tasks', label: 'Tasks', icon: 'scroll-text', titleField: 'title', searchable: true,
  fields: [
    { name: 'title', type: 'string', label: 'Title', list: true, search: true },
    { name: 'status', type: 'enum', label: 'Status', values: ['Open', 'Done'], list: true, filter: true },
    { name: 'owner', type: 'ref', ref: 'User', label: 'Owner', list: true, filter: true },
    { name: 'dueDate', type: 'date', label: 'Due', list: true },
    { name: 'notes', type: 'text', label: 'Notes', list: true },
  ],
  rolePermissions: { read: ['Member', 'Viewer'], create: ['Member'], update: ['Member'] },
  genericDisabled: [],
  statusFlow: { field: 'status', transitions: { Open: ['Done'], Done: ['Open'] }, workflowOnly: [] },
  due: { field: 'dueDate', status: 'status', from: ['Open'], to: 'Overdue' },
  softDelete: null,
};
const plain = {
  key: 'plain', label: 'Plain', icon: 'scroll-text', titleField: 'title', searchable: false,
  fields: [{ name: 'title', type: 'string', label: 'Title', list: true }],
  rolePermissions: { read: ['Member', 'Viewer'] }, genericDisabled: [], statusFlow: null, due: null, softDelete: null,
};
vi.mock('../api/meta', () => ({
  meta: vi.fn(async () => ({ appName: 'Test', roles: ['Admin', 'Member', 'Viewer'], superuserRole: 'Admin', resources: [tasks, plain] })),
  publicMeta: vi.fn(async () => ({})),
}));
const listRecords = vi.fn(async () => ({
  items: [{ _id: 'a'.repeat(24), title: 'Bat wing', status: 'Open', owner: { _id: 'u1', name: 'Tess' }, dueDate: '2026-11-12', notes: 'x' }],
  total: 1, page: 1, pages: 1,
}));
vi.mock('../api/resources', () => ({ listRecords: (...a) => listRecords(...a), updateRecord: vi.fn() }));

const ID = 'a'.repeat(24);
function Loc() { const l = useLocation(); return <output data-testid="loc">{l.pathname}{l.search}</output>; }
const detail = <Route path="/r/:key/:id" element={<p>detail page</p>} />;
const page = () => (<><ResourceList /><Loc /></>);
const open = (route = '/r/tasks') => renderAt(page(), { path: '/r/:key', route, extraRoutes: detail });

beforeEach(() => { localStorage.clear(); listRecords.mockClear(); signIn({ role: 'Member', userId: 'u1' }); });

describe('listViews helpers', () => {
  it('sorts asc, desc, then clears', () => {
    expect(nextSort(null, 'title')).toBe('title');
    expect(nextSort('title', 'title')).toBe('-title');
    expect(nextSort('-title', 'title')).toBeNull();
    expect(nextSort('-other', 'title')).toBe('title');
  });
  it('only scalar types are sortable', () => {
    expect(['string', 'number', 'date', 'enum', 'boolean'].every((type) => isSortable({ type }))).toBe(true);
    expect(isSortable({ type: 'ref' })).toBe(false);
    expect(isSortable({ type: 'text' })).toBe(false);
    expect(isSortable({ type: 'checklist' })).toBe(false);
    expect(isSortable({ type: 'enum', multiple: true })).toBe(false);
  });
  it('offers Board and Calendar only when the resource supports them', () => {
    expect(availableViews(tasks)).toEqual(['list', 'board', 'calendar']);
    expect(availableViews(plain)).toEqual(['list']);
    expect(availableViews({ ...plain, fields: [{ name: 'd', type: 'date', label: 'D', list: true }] })).toEqual(['list', 'calendar']);
    expect(availableViews({ ...plain, fields: [{ name: 'd', type: 'date', label: 'D' }] })).toEqual(['list']);
  });
  it('ignores a view the resource does not support', () => {
    expect(resolveView(plain, 'board')).toBe('list');
  });
  it('board columns follow transitions, hide the soft-delete status unless filtered', () => {
    const r = {
      ...tasks,
      fields: [{ name: 'status', type: 'enum', values: ['A', 'B', 'Gone'] }],
      statusFlow: { field: 'status', transitions: { A: ['B'], B: ['A', 'Gone'] }, workflowOnly: ['Gone'] },
      softDelete: { field: 'status', value: 'Gone' },
    };
    expect(boardColumns(r)).toEqual(['A', 'B']);
    expect(boardColumns(r, 'Gone')).toEqual(['Gone']);
    expect(allowedTargets(r, 'B')).toEqual(['A']);
  });
  it('month grid starts on Monday and covers whole weeks', () => {
    const weeks = monthWeeks({ year: 2026, month: 10 });
    expect(weeks[0][0].getDay()).toBe(1);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(weeks[0][0].getDate()).toBe(26);
  });
});

describe('whole row opens the record', () => {
  it('navigates when a plain cell is clicked', async () => {
    open();
    const table = await screen.findByRole('table');
    fireEvent.click(within(table).getByText('Tess'));
    expect(await screen.findByText('detail page')).toBeInTheDocument();
  });

  it('marks rows as clickable', async () => {
    open();
    const table = await screen.findByRole('table');
    expect(within(table).getAllByRole('row')[1].className).toContain('cursor-pointer');
  });

  it('keeps the title a real link and the row out of the tab order', async () => {
    open();
    const table = await screen.findByRole('table');
    const row = within(table).getAllByRole('row')[1];
    expect(row).not.toHaveAttribute('tabindex');
    expect(within(row).getByRole('link', { name: 'Bat wing' })).toHaveAttribute('href', `/r/tasks/${ID}`);
  });

  it('does not navigate from the checkbox or its cell', async () => {
    open();
    const table = await screen.findByRole('table');
    const box = within(table).getByRole('checkbox', { name: 'Select Bat wing' });
    fireEvent.click(box);
    expect(box).toBeChecked();
    fireEvent.click(box.closest('td'));
    expect(screen.queryByText('detail page')).not.toBeInTheDocument();
    expect(screen.getByTestId('loc')).toHaveTextContent('/r/tasks');
  });

  it('a click on the title link navigates once through the link', async () => {
    open();
    const table = await screen.findByRole('table');
    fireEvent.click(within(table).getByRole('link', { name: 'Bat wing' }));
    expect(await screen.findByText('detail page')).toBeInTheDocument();
  });

  it('opens in a new tab with ctrl/cmd-click and middle-click, without navigating', async () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    open();
    const table = await screen.findByRole('table');
    const cell = within(table).getByText('Tess');
    fireEvent.click(cell, { ctrlKey: true });
    fireEvent.click(cell, { metaKey: true });
    fireEvent(cell, new MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 1 }));
    expect(openSpy).toHaveBeenCalledTimes(3);
    expect(openSpy.mock.calls[0][0]).toBe(`/r/tasks/${ID}`);
    expect(screen.queryByText('detail page')).not.toBeInTheDocument();
    openSpy.mockRestore();
  });

  it('does not navigate when the user is selecting text', async () => {
    open();
    const table = await screen.findByRole('table');
    const spy = vi.spyOn(window, 'getSelection').mockReturnValue({ toString: () => 'Tess' });
    fireEvent.click(within(table).getByText('Tess'));
    expect(screen.queryByText('detail page')).not.toBeInTheDocument();
    spy.mockRestore();
  });

  it('mobile cards are one big link', async () => {
    open();
    await screen.findByRole('table');
    const links = screen.getAllByRole('link', { name: /Bat wing/ }).filter((a) => a.closest('li'));
    expect(links[0]).toHaveAttribute('href', `/r/tasks/${ID}`);
    expect(links[0]).toHaveTextContent('Due');
  });
});

describe('sortable headers', () => {
  it('renders buttons only for sortable columns', async () => {
    open();
    const table = await screen.findByRole('table');
    expect(within(table).getByRole('button', { name: 'Title' })).toBeInTheDocument();
    expect(within(table).getByRole('button', { name: 'Due' })).toBeInTheDocument();
    expect(within(table).queryByRole('button', { name: 'Owner' })).not.toBeInTheDocument();
    expect(within(table).queryByRole('button', { name: 'Notes' })).not.toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: 'Title' })).toHaveAttribute('aria-sort', 'none');
  });

  it('cycles asc, desc, default through the URL, sets aria-sort and resets the page', async () => {
    open('/r/tasks?page=2');
    const table = await screen.findByRole('table');
    const btn = () => within(screen.getByRole('table')).getByRole('button', { name: 'Title' });
    const th = () => within(screen.getByRole('table')).getByRole('columnheader', { name: 'Title' });
    fireEvent.click(btn());
    expect(screen.getByTestId('loc')).toHaveTextContent('/r/tasks?sort=title');
    expect(screen.getByTestId('loc').textContent).not.toContain('page');
    expect(th()).toHaveAttribute('aria-sort', 'ascending');
    await waitFor(() => expect(listRecords.mock.calls.some((c) => c[2]?.sort === 'title')).toBe(true));
    fireEvent.click(btn());
    expect(screen.getByTestId('loc')).toHaveTextContent('sort=-title');
    expect(th()).toHaveAttribute('aria-sort', 'descending');
    fireEvent.click(btn());
    expect(screen.getByTestId('loc').textContent).not.toContain('sort');
    expect(th()).toHaveAttribute('aria-sort', 'none');
    expect(table).toBeInTheDocument();
  });
});

describe('view switcher', () => {
  it('shows List/Board/Calendar, stores the choice in the URL and per resource', async () => {
    open();
    const group = await screen.findByRole('group', { name: 'View' });
    expect(within(group).getByRole('button', { name: /List/ })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(within(group).getByRole('button', { name: /Board/ }));
    expect(screen.getByTestId('loc')).toHaveTextContent('view=board');
    expect(localStorage.getItem('crypt_listview_tasks')).toBe('board');
    expect(await screen.findByTestId('board')).toBeInTheDocument();
    fireEvent.click(within(group).getByRole('button', { name: /Calendar/ }));
    expect(screen.getByTestId('loc')).toHaveTextContent('view=calendar');
    expect(await screen.findByTestId('calendar')).toBeInTheDocument();
    fireEvent.click(within(group).getByRole('button', { name: /List/ }));
    expect(screen.getByTestId('loc').textContent).not.toContain('view=');
    expect(await screen.findByRole('table')).toBeInTheDocument();
  });

  it('restores the remembered view when the URL has none', async () => {
    localStorage.setItem('crypt_listview_tasks', 'calendar');
    open();
    expect(await screen.findByTestId('calendar')).toBeInTheDocument();
  });

  it('is hidden for a resource that only has a list', async () => {
    renderAt(page(), { path: '/r/:key', route: '/r/plain', extraRoutes: detail });
    await screen.findByRole('table');
    expect(screen.queryByRole('group', { name: 'View' })).not.toBeInTheDocument();
  });

  it('keeps search and filters when switching views', async () => {
    open('/r/tasks?status=Open');
    fireEvent.click(await screen.findByRole('button', { name: /Calendar/ }));
    expect(screen.getByTestId('loc')).toHaveTextContent('status=Open');
    expect(screen.getByTestId('loc')).toHaveTextContent('view=calendar');
    await waitFor(() => expect(listRecords.mock.calls.some((c) => c[2]?.status === 'Open' && c[2]?.dueDate_from)).toBe(true));
  });
});

describe('Mine chip', () => {
  it('sets and clears the owner filter with the signed-in user id', async () => {
    open();
    const chip = await screen.findByRole('button', { name: 'Mine' });
    expect(chip).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(chip);
    expect(screen.getByTestId('loc')).toHaveTextContent('owner=u1');
    expect(screen.getByRole('button', { name: 'Mine' })).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(listRecords.mock.calls.some((c) => c[2]?.owner === 'u1')).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: 'Mine' }));
    expect(screen.getByTestId('loc').textContent).not.toContain('owner');
  });

  it('is absent without a filterable User reference', async () => {
    renderAt(page(), { path: '/r/:key', route: '/r/plain', extraRoutes: detail });
    await screen.findByRole('table');
    expect(screen.queryByRole('button', { name: 'Mine' })).not.toBeInTheDocument();
  });
});
