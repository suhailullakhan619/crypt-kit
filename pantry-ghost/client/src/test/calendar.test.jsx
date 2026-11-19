// Calendar view of the list page.
import { screen, fireEvent, waitFor, within } from '@testing-library/react';
import { useLocation } from 'react-router-dom';
import { vi } from 'vitest';
import { renderAt, signIn } from './render';
import ResourceList from '../pages/ResourceList';

vi.mock('../appRoutes', () => ({ default: [], reportPresets: [], bulkActions: {} }));

const tasks = {
  key: 'tasks', label: 'Tasks', icon: 'scroll-text', titleField: 'title', searchable: true,
  fields: [
    { name: 'title', type: 'string', label: 'Title', list: true, search: true },
    { name: 'status', type: 'enum', label: 'Status', values: ['Open', 'Done', 'Overdue'], list: true, filter: true },
    { name: 'dueDate', type: 'date', label: 'Due', list: true },
  ],
  rolePermissions: { read: ['Member', 'Viewer'] }, genericDisabled: [],
  statusFlow: null,
  due: { field: 'dueDate', status: 'status', from: ['Open'], to: 'Overdue' },
  softDelete: null,
};
vi.mock('../api/meta', () => ({
  meta: vi.fn(async () => ({ appName: 'Test', roles: ['Admin', 'Member', 'Viewer'], superuserRole: 'Admin', resources: [tasks] })),
  publicMeta: vi.fn(async () => ({})),
}));

let items;
const listRecords = vi.fn(async () => ({ items, total: items.length, page: 1, pages: 1 }));
vi.mock('../api/resources', () => ({ listRecords: (...a) => listRecords(...a), updateRecord: vi.fn() }));

function Loc() { const l = useLocation(); return <output data-testid="loc">{l.pathname}{l.search}</output>; }
const open = (r = '/r/tasks?view=calendar&month=2026-11') => renderAt(<><ResourceList /><Loc /></>, { path: '/r/:key', route: r });
const day = (k) => screen.getByTestId(`calendar-day-${k}`);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 20, 12, 0, 0));
  localStorage.clear();
  listRecords.mockClear();
  signIn({ role: 'Viewer' });
  items = [
    { _id: 'c1', title: 'Late potion', status: 'Open', dueDate: '2026-11-12T00:00:00.000Z' },
    { _id: 'c2', title: 'Future potion', status: 'Open', dueDate: '2026-11-25T00:00:00.000Z' },
    { _id: 'c3', title: 'Finished potion', status: 'Done', dueDate: '2026-11-05T00:00:00.000Z' },
  ];
});
afterEach(() => vi.useRealTimers());

describe('Calendar view', () => {
  it('asks for the visible weeks with <field>_from/_to and limit 100, plus the current filters', async () => {
    open('/r/tasks?view=calendar&month=2026-11&status=Open&q=po');
    await screen.findByTestId('calendar');
    await waitFor(() => expect(listRecords).toHaveBeenCalled());
    const params = listRecords.mock.calls[0][2];
    expect(params).toMatchObject({ dueDate_from: '2026-10-26', dueDate_to: '2026-12-06', limit: 100, status: 'Open', q: 'po' });
    expect(params.view).toBeUndefined();
    expect(params.month).toBeUndefined();
  });

  it('shows the month name and Monday-first columns', async () => {
    open();
    const heads = (await screen.findAllByRole('columnheader')).map((h) => h.textContent);
    expect(screen.getByRole('heading', { level: 2 }).textContent).toMatch(/2026/);
    expect(heads).toHaveLength(7);
    expect(heads[0]).toBe(new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(new Date(2026, 9, 26)));
  });

  it('places records on their day as links to the record', async () => {
    open();
    await screen.findByTestId('calendar-agenda'); await screen.findAllByRole('link', { name: 'Future potion' });
    const link = within(day('2026-11-25')).getByRole('link', { name: 'Future potion' });
    expect(link).toHaveAttribute('href', '/r/tasks/c2');
    expect(within(day('2026-11-05')).getByRole('link', { name: /Finished potion/ })).toBeInTheDocument();
    expect(within(day('2026-11-12')).queryByRole('link', { name: 'Future potion' })).not.toBeInTheDocument();
  });

  it('styles overdue records with the destructive token, and only those', async () => {
    open();
    await screen.findByTestId('calendar-agenda'); await screen.findAllByRole('link', { name: 'Future potion' });
    expect(within(day('2026-11-12')).getByRole('link', { name: /Late potion/ }).className).toContain('text-destructive');
    expect(within(day('2026-11-25')).getByRole('link', { name: 'Future potion' }).className).not.toContain('text-destructive');
    expect(within(day('2026-11-05')).getByRole('link', { name: /Finished potion/ }).className).not.toContain('text-destructive');
  });

  it('collapses crowded days behind "+N more"', async () => {
    items = Array.from({ length: 5 }, (_, i) => ({ _id: `m${i}`, title: `Crowd ${i}`, status: 'Done', dueDate: '2026-11-15' }));
    open();
    await screen.findByTestId('calendar-day-2026-11-15');
    await waitFor(() => expect(within(day('2026-11-15')).getAllByRole('link')).toHaveLength(3));
    fireEvent.click(within(day('2026-11-15')).getByRole('button', { name: '+2 more' }));
    expect(within(day('2026-11-15')).getAllByRole('link')).toHaveLength(5);
  });

  it('navigates months through the URL and refetches the new range; Today returns', async () => {
    open();
    await screen.findByTestId('calendar');
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
    expect(screen.getByTestId('loc')).toHaveTextContent('month=2026-12');
    await waitFor(() => expect(listRecords.mock.calls.some((c) => c[2].dueDate_from === '2026-11-30' && c[2].dueDate_to === '2027-01-03')).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(screen.getByTestId('loc')).toHaveTextContent('month=2026-10');
    fireEvent.click(screen.getByRole('button', { name: 'Today' }));
    expect(screen.getByTestId('loc').textContent).not.toContain('month=');
  });

  it('renders an agenda list for the month (used on mobile)', async () => {
    open();
    await screen.findByTestId('calendar-agenda'); await screen.findAllByRole('link', { name: 'Future potion' });
    const agenda = screen.getByTestId('calendar-agenda');
    const names = within(agenda).getAllByRole('link').map((a) => a.textContent.replace(' (overdue)', ''));
    expect(names).toEqual(['Finished potion', 'Late potion', 'Future potion']);
  });
});
