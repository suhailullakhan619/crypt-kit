// Command palette: shortcuts, grouped search results, quick navigation, keyboard handling.
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { Route, useLocation } from 'react-router-dom';
import { vi } from 'vitest';
import { renderAt, signIn } from './render';
import { AppShell } from '../components/layout/AppShell';
import { searchAll } from '../api/search';

const resources = [
  { key: 'notes', label: 'Notes', icon: 'box', titleField: 'title', fields: [{ name: 'title', type: 'string', label: 'Title' }], rolePermissions: { read: ['Member'], create: ['Member'] }, genericDisabled: [] },
  { key: 'tasks', label: 'Tasks', icon: 'box', titleField: 'title', fields: [{ name: 'title', type: 'string', label: 'Title' }], rolePermissions: { read: ['Member'] }, genericDisabled: [] },
];
vi.mock('../appRoutes', () => ({ default: [{ path: 'scan', element: null, label: 'Scan or find', icon: 'scan-line' }], reportPresets: [], bulkActions: {} }));
vi.mock('../hooks/useApi', () => ({ useApi: () => ({ get: vi.fn(async () => ({ data: { items: [], unread: 0 } })), post: vi.fn() }) }));
vi.mock('../api/meta', () => ({
  meta: vi.fn(async () => ({ appName: 'T', roles: ['Admin', 'Member'], superuserRole: 'Admin', resources })),
  publicMeta: vi.fn(async () => ({})),
}));
vi.mock('../api/search', () => ({ searchAll: vi.fn() }));

function Where() { const l = useLocation(); return <p data-testid="where">{l.pathname}</p>; }

beforeEach(() => {
  localStorage.clear(); signIn({ role: 'Member' }); vi.clearAllMocks();
  searchAll.mockResolvedValue([
    { key: 'notes', label: 'Notes', icon: 'box', items: [{ _id: 'n1', title: 'Quarterly plan', subtitle: 'NT-1' }, { _id: 'n2', title: 'Plan B', subtitle: null }] },
    { key: 'tasks', label: 'Tasks', icon: 'box', items: [{ _id: 't1', title: 'Plan the launch', subtitle: null }] },
  ]);
});
const shell = () => renderAt(<AppShell />, { path: '/', route: '/', withMeta: false, extraRoutes: <Route path="*" element={<Where />} /> });
const openPalette = async () => {
  fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
  return screen.findByRole('combobox');
};

describe('command palette', () => {
  it('opens with Ctrl+K and from the top-bar button, closes with Escape', async () => {
    shell();
    await openPalette();
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('combobox')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Search everything' }));
    await screen.findByRole('combobox');
  });

  it('"/" opens it only when not typing in a field', async () => {
    shell();
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    fireEvent.keyDown(input, { key: '/' });
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    input.remove();
    fireEvent.keyDown(document.body, { key: '/' });
    await screen.findByRole('combobox');
  });

  it('lists pages the user can see and create entries only where permitted', async () => {
    shell();
    await openPalette();
    await screen.findByRole('option', { name: 'Create new note' });
    const names = screen.getAllByRole('option').map((o) => o.textContent);
    expect(names).toEqual(expect.arrayContaining(['Dashboard', 'Notes', 'Tasks', 'Scan or find', 'Reports', 'Voice agent', 'Create new note']));
    expect(names).not.toContain('Users'); // not a superuser
    expect(names).not.toContain('Create new task'); // no create permission
  });

  it('searches after a debounce and groups results by resource', async () => {
    shell();
    const box = await openPalette();
    fireEvent.change(box, { target: { value: 'plan' } });
    expect(searchAll).not.toHaveBeenCalled(); // debounced
    await screen.findByText('Quarterly plan');
    expect(searchAll).toHaveBeenCalledTimes(1);
    expect(searchAll.mock.calls[0][1]).toBe('plan');
    const groups = screen.getAllByRole('group');
    expect(groups[0]).toHaveAccessibleName('Notes');
    expect(groups[0]).toHaveTextContent('Plan B');
    expect(groups[1]).toHaveAccessibleName('Tasks');
    expect(groups[1]).toHaveTextContent('Plan the launch');
  });

  it('moves with the arrow keys (aria-activedescendant) and Enter opens the record', async () => {
    shell();
    const box = await openPalette();
    fireEvent.change(box, { target: { value: 'plan' } });
    await screen.findByText('Quarterly plan');
    expect(box).toHaveAttribute('aria-activedescendant', 'cmdk-opt-0');
    expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(box, { key: 'ArrowDown' });
    fireEvent.keyDown(box, { key: 'ArrowDown' });
    expect(box).toHaveAttribute('aria-activedescendant', 'cmdk-opt-2');
    expect(screen.getByText('Plan the launch').closest('[role=option]')).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(box, { key: 'ArrowUp' });
    fireEvent.keyDown(box, { key: 'ArrowUp' });
    fireEvent.keyDown(box, { key: 'ArrowUp' }); // wraps to the last entry
    expect(box).toHaveAttribute('aria-activedescendant', `cmdk-opt-${screen.getAllByRole('option').length - 1}`);
    fireEvent.keyDown(box, { key: 'Home' });
    fireEvent.keyDown(box, { key: 'Enter' });
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/r/notes/n1'));
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('navigates to a create page and filters pages by typed text without searching for one letter', async () => {
    shell();
    const box = await openPalette();
    fireEvent.change(box, { target: { value: 'c' } });
    await new Promise((r) => setTimeout(r, 300));
    expect(searchAll).not.toHaveBeenCalled(); // under 2 characters
    fireEvent.change(box, { target: { value: 'create' } });
    const opt = await screen.findByRole('option', { name: 'Create new note' });
    fireEvent.click(opt);
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/r/notes/new'));
  });
});
