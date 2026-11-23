// Chat answers: rich cards for questions, and the confirm card for commands.
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { renderAt, signIn } from './render';
import QueryAnswer from '../voice/QUERY';
import ActionCard from '../voice/ActionCard';
import VoiceAgent from '../pages/VoiceAgent';
import { createRecord, updateRecord } from '../api/resources';
import { ask } from '../api/voice';

const resource = { key: 'notes', label: 'Notes', icon: 'box', titleField: 'title', fields: [{ name: 'title', type: 'string', label: 'Title', list: true }], rolePermissions: { read: ['Member'] }, genericDisabled: [], statusFlow: { field: 'status', transitions: {} }, due: null, softDelete: null };
vi.mock('../appRoutes', () => ({ default: [], reportPresets: [], bulkActions: {} }));
vi.mock('../api/meta', () => ({
  meta: vi.fn(async () => ({ appName: 'T', roles: ['Admin', 'Member'], superuserRole: 'Admin', resources: [resource] })),
  publicMeta: vi.fn(async () => ({})),
}));
vi.mock('../api/resources', () => ({ createRecord: vi.fn(), updateRecord: vi.fn(), listRecords: vi.fn(), getRecord: vi.fn(), recordActivity: vi.fn() }));
vi.mock('../api/voice', () => ({ ask: vi.fn(), examples: vi.fn(async () => ({ examples: ['what is on my plate'], provider: 'browser' })), speakAudio: vi.fn() }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

beforeEach(() => { localStorage.clear(); signIn({ role: 'Member' }); vi.clearAllMocks(); });
const card = (data, intent = 'QUERY') => renderAt(<QueryAnswer result={{ intent, data }} />);

describe('question answers', () => {
  it('lists the records found as links to their pages, with a "see all" link', async () => {
    card({ kind: 'query', resource: 'notes', label: 'Notes', total: 7, hasMore: true, link: '/r/notes?status=Open', items: [{ _id: 'a1', title: 'Buy candles', code: 'N-0001', status: 'Open', due: '2026-11-20T00:00:00.000Z' }] });
    const link = await screen.findByRole('link', { name: /Buy candles/ });
    expect(link).toHaveAttribute('href', '/r/notes/a1');
    expect(screen.getByText('N-0001')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /See all 7 in Notes/ })).toHaveAttribute('href', '/r/notes?status=Open');
  });

  it('shows nothing extra for a plain count', () => {
    const { container } = card({ kind: 'query', resource: 'notes', label: 'Notes', total: 0, items: [], link: '/r/notes' });
    expect(container).toBeEmptyDOMElement();
  });

  it('overview: counts per area and the most urgent records', async () => {
    card({ kind: 'overview', rows: [{ key: 'notes', label: 'Notes', overdue: 2, dueSoon: 1 }, { key: 'goals', label: 'Goals', overdue: 0, dueSoon: 0 }], items: [{ _id: 'z', key: 'notes', label: 'Notes', title: 'Renew broom', kind: 'overdue', due: '2026-11-18T00:00:00.000Z' }] }, 'OVERVIEW');
    expect(await screen.findByText('2 overdue')).toBeInTheDocument();
    expect(screen.getByText('1 due this week')).toBeInTheDocument();
    expect(screen.queryByText('Goals')).not.toBeInTheDocument(); // nothing to report there
    expect(screen.getByRole('link', { name: /Renew broom/ })).toHaveAttribute('href', '/r/notes/z');
  });

  it('lookup: the item\'s details and a link to open it', async () => {
    card({ kind: 'lookup', found: true, key: 'notes', _id: 'q1', title: 'Buy candles', code: 'N-0006', details: [{ label: 'Priority', value: 'High' }] }, 'LOOKUP');
    expect(await screen.findByRole('link', { name: /Open N-0006/ })).toHaveAttribute('href', '/r/notes/q1');
    expect(screen.getByText('High')).toBeInTheDocument();
  });

  it('plain text only: a title that looks like markup is shown as text', async () => {
    card({ kind: 'query', resource: 'notes', label: 'Notes', total: 1, items: [{ _id: 'x', title: '<img src=x onerror=alert(1)>' }] });
    expect((await screen.findByRole('link')).textContent).toContain('<img src=x onerror=alert(1)>');
    expect(document.querySelector('img[src="x"]')).toBeNull();
  });
});

describe('command drafts', () => {
  const draft = { type: 'create', resource: 'notes', body: { title: 'Buy candles' }, summary: [{ label: 'Title', value: 'Buy candles' }] };
  const show = (d = draft) => renderAt(<ActionCard result={{ data: { draft: d } }} />);

  it('saves nothing until Confirm, then creates through the normal API', async () => {
    createRecord.mockResolvedValue({ _id: 'new1' });
    show();
    expect(await screen.findByText('Buy candles')).toBeInTheDocument();
    expect(createRecord).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(createRecord).toHaveBeenCalledWith(expect.anything(), 'notes', { title: 'Buy candles' }));
    expect(await screen.findByRole('link', { name: 'Open it' })).toHaveAttribute('href', '/r/notes/new1');
  });

  it('a status change updates the record by id', async () => {
    updateRecord.mockResolvedValue({ _id: 'n9' });
    show({ type: 'update', resource: 'notes', id: 'n9', body: { status: 'Done' }, summary: [{ label: 'Status', value: 'open to done' }] });
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(updateRecord).toHaveBeenCalledWith(expect.anything(), 'notes', 'n9', { status: 'Done' }));
  });

  it('Cancel drops the draft without saving', async () => {
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(await screen.findByText(/Nothing was saved/)).toBeInTheDocument();
    expect(createRecord).not.toHaveBeenCalled();
  });

  it('a failed save keeps the card so the user can retry', async () => {
    createRecord.mockRejectedValue({ response: { data: { error: 'Validation failed' } } });
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(createRecord).toHaveBeenCalled());
    expect(await screen.findByRole('button', { name: 'Confirm' })).toBeEnabled();
  });
});

describe('chat page', () => {
  it('a second command gets a fresh Confirm card, not the previous "Done"', async () => {
    const draftFor = (title) => ({ transcript: title, intent: 'ADD_NOTE', answer: `Ready to add ${title}.`, data: { kind: 'draft', draft: { type: 'create', resource: 'notes', body: { title }, summary: [{ label: 'Title', value: title }] } } });
    createRecord.mockResolvedValue({ _id: 'n1' });
    ask.mockResolvedValueOnce(draftFor('first')).mockResolvedValueOnce(draftFor('second'));
    renderAt(<VoiceAgent />);
    const type = async (text) => {
      fireEvent.change(await screen.findByLabelText('Or type a question'), { target: { value: text } });
      fireEvent.click(screen.getByRole('button', { name: 'Ask', exact: true }));
    };
    await type('add first');
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }));
    await screen.findByRole('link', { name: 'Open it' });
    await type('add second');
    expect(await screen.findByText('Ready to add second.')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Confirm' })).toBeInTheDocument(); // not the old "Done"
    expect(screen.queryByRole('link', { name: 'Open it' })).not.toBeInTheDocument();
  });

  it('asks the question and shows the answer with its rich card', async () => {
    ask.mockResolvedValue({ transcript: 'which notes are over due', intent: 'QUERY', answer: '2 notes (overdue): A and B.', data: { kind: 'query', resource: 'notes', label: 'Notes', total: 2, items: [{ _id: 'a', title: 'A' }, { _id: 'b', title: 'B' }], link: '/r/notes' } });
    renderAt(<VoiceAgent />);
    fireEvent.change(await screen.findByLabelText('Or type a question'), { target: { value: 'which notes are over due' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
    expect(await screen.findByText('2 notes (overdue): A and B.')).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'A' })).toHaveAttribute('href', '/r/notes/a');
  });
});
