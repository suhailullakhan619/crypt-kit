// Checklist field: editor (add/edit/tick/remove/reorder/limits), list display, tickable on the detail page.
import { useState } from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { vi } from 'vitest';
import { ChecklistEditor, ChecklistChecks, checklistMax } from '../components/resource/ChecklistField';
import { displayValue, inputValue } from '../lib/format';
import { renderAt, signIn } from './render';
import ResourceDetail from '../pages/ResourceDetail';
import { updateRecord } from '../api/resources';

const field = { name: 'steps', type: 'checklist', label: 'Steps', max: 3 };

function Harness({ initial = [], f = field, spy }) {
  const [v, setV] = useState(initial);
  return <ChecklistEditor field={f} value={v} onChange={(n) => { spy?.(n); setV(n); }} />;
}

describe('ChecklistEditor', () => {
  it('adds items with Enter, edits, ticks, reorders and removes them', () => {
    const spy = vi.fn();
    render(<Harness spy={spy} />);
    const add = screen.getByLabelText('Add Steps item');
    fireEvent.change(add, { target: { value: '  First  ' } });
    fireEvent.keyDown(add, { key: 'Enter' });
    fireEvent.change(add, { target: { value: 'Second' } });
    fireEvent.keyDown(add, { key: 'Enter' });
    expect(spy).toHaveBeenLastCalledWith([{ text: 'First', done: false }, { text: 'Second', done: false }]);
    expect(screen.getByText('0 of 2 done')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Done: First'));
    expect(screen.getByText('1 of 2 done')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Item 2'), { target: { value: 'Second!' } });
    fireEvent.click(screen.getByLabelText('Move item 2 up'));
    expect(spy).toHaveBeenLastCalledWith([{ text: 'Second!', done: false }, { text: 'First', done: true }]);
    expect(screen.getByLabelText('Move item 1 up')).toBeDisabled();

    fireEvent.click(screen.getByLabelText('Remove item 1'));
    expect(spy).toHaveBeenLastCalledWith([{ text: 'First', done: true }]);
  });

  it('ignores blank text and stops at the max', () => {
    render(<Harness initial={[{ text: 'a', done: false }, { text: 'b', done: false }]} />);
    const add = screen.getByLabelText('Add Steps item');
    fireEvent.change(add, { target: { value: '   ' } });
    expect(screen.getByRole('button', { name: /^Add$/ })).toBeDisabled();
    fireEvent.change(add, { target: { value: 'c' } });
    fireEvent.keyDown(add, { key: 'Enter' });
    expect(screen.getByText('3 of 3 items')).toBeInTheDocument();
    expect(screen.getByLabelText('Add Steps item')).toBeDisabled();
  });

  it('defaults max to 50 and caps it at 200', () => {
    expect(checklistMax({})).toBe(50);
    expect(checklistMax({ max: 500 })).toBe(200);
    expect(checklistMax({ max: 7 })).toBe(7);
  });
});

describe('checklist display values', () => {
  it('shows done/total in lists and an empty marker otherwise', () => {
    expect(displayValue(field, [{ text: 'a', done: true }, { text: 'b', done: false }, { text: 'c', done: true }])).toBe('2/3');
    expect(displayValue(field, [])).toBe('—');
    expect(displayValue(field, null)).toBe('—');
    expect(inputValue(field, null)).toEqual([]);
  });

  it('renders read-only checkboxes without an onChange', () => {
    render(<ChecklistChecks value={[{ text: 'a', done: true }]} />);
    expect(screen.getByRole('checkbox', { name: 'a' })).toBeDisabled();
    expect(screen.getByText('1 of 1 done')).toBeInTheDocument();
  });
});

// ── detail page ──────────────────────────────────────────────────────────────
const resource = {
  key: 'jobs', label: 'Jobs', icon: 'box', titleField: 'name', comments: false,
  fields: [{ name: 'name', type: 'string', label: 'Name', list: true }, field],
  rolePermissions: { read: ['Viewer'], update: ['Editor'] }, genericDisabled: [], statusFlow: null, due: null, softDelete: null,
};
const record = { _id: 'j1', name: 'Pack up', steps: [{ text: 'Boxes', done: false }, { text: 'Tape', done: true }] };

vi.mock('../appRoutes', () => ({ default: [], reportPresets: [], bulkActions: {} }));
vi.mock('../api/meta', () => ({
  meta: vi.fn(async () => ({ appName: 'T', roles: ['Editor', 'Viewer'], superuserRole: 'Editor', resources: [resource] })),
  publicMeta: vi.fn(async () => ({})),
}));
vi.mock('../api/resources', () => ({
  getRecord: vi.fn(async () => record),
  recordActivity: vi.fn(async () => []),
  updateRecord: vi.fn(async (_a, _k, _i, body) => Object.assign(record, body)),
  deleteRecord: vi.fn(),
}));
vi.mock('../api/comments', () => ({ listComments: vi.fn(async () => []), addComment: vi.fn(), deleteComment: vi.fn() }));

const open = () => renderAt(<ResourceDetail />, { path: '/r/:key/:id', route: '/r/jobs/j1' });

describe('checklist on the detail page', () => {
  beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); record.steps = [{ text: 'Boxes', done: false }, { text: 'Tape', done: true }]; });

  it('ticking an item PATCHes the whole array', async () => {
    signIn({ role: 'Editor' });
    open();
    const box = await screen.findByRole('checkbox', { name: 'Boxes' });
    expect(screen.getByText('1 of 2 done')).toBeInTheDocument();
    fireEvent.click(box);
    await waitFor(() => expect(updateRecord).toHaveBeenCalledWith(expect.anything(), 'jobs', 'j1', { steps: [{ text: 'Boxes', done: true }, { text: 'Tape', done: true }] }));
    await screen.findByText('2 of 2 done');
  });

  it('is read-only without update permission', async () => {
    signIn({ role: 'Viewer' });
    open();
    const box = await screen.findByRole('checkbox', { name: 'Boxes' });
    expect(box).toBeDisabled();
    expect(within(document.body).queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
  });

  it('rolls back and reports when the save fails', async () => {
    signIn({ role: 'Editor' });
    updateRecord.mockRejectedValueOnce(new Error('nope'));
    open();
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Boxes' }));
    await waitFor(() => expect(updateRecord).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Boxes' })).not.toBeChecked());
  });
});
