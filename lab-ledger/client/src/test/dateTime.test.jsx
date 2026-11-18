import { screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { renderAt, signIn } from './render';
import ResourceCreate from '../pages/ResourceCreate';
import { displayValue, inputValue, toLocalInput } from '../lib/format';

const createRecord = vi.fn(async (_api, _key, body) => ({ _id: 'x', ...body }));
vi.mock('../api/resources', () => ({ createRecord: (...a) => createRecord(...a) }));
vi.mock('../api/meta', () => ({
  meta: vi.fn(async () => ({
    appName: 'Test', roles: ['Admin', 'Member'], superuserRole: 'Admin',
    resources: [{
      key: 'bookings', label: 'Bookings', icon: 'calendar', titleField: 'name',
      fields: [
        { name: 'name', type: 'string', label: 'Name', required: true, list: true },
        { name: 'startAt', type: 'date', time: true, label: 'From', required: true, list: true },
        { name: 'due', type: 'date', label: 'Due', list: true },
      ],
      rolePermissions: { read: ['Member'], create: ['Member'] },
      genericDisabled: [], statusFlow: null, due: null, softDelete: null,
    }],
  })),
  publicMeta: vi.fn(async () => ({})),
}));

beforeEach(() => { localStorage.clear(); createRecord.mockClear(); signIn({ role: 'Member' }); });

describe('date fields with a time', () => {
  it('shows the time in lists and keeps plain dates date-only', () => {
    expect(displayValue({ type: 'date', time: true }, '2030-05-06T14:30:00.000Z')).toMatch(/\d{2}:\d{2}/);
    expect(displayValue({ type: 'date' }, '2030-05-06T14:30:00.000Z')).not.toMatch(/:/);
  });

  it('converts a stored instant to a datetime-local value and back to the same instant', () => {
    const iso = '2030-05-06T14:30:00.000Z';
    const local = toLocalInput(iso);
    expect(local).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(new Date(local).toISOString()).toBe(iso);
    expect(inputValue({ type: 'date', time: true }, iso)).toBe(local);
    expect(inputValue({ type: 'date' }, iso)).toBe('2030-05-06');
    expect(toLocalInput('garbage')).toBe('');
  });

  it('the form renders a datetime-local input and submits an ISO instant', async () => {
    renderAt(<ResourceCreate />, { path: '/r/:key/new', route: '/r/bookings/new' });
    const from = await screen.findByLabelText(/From/);
    expect(from).toHaveAttribute('type', 'datetime-local');
    expect(screen.getByLabelText('Due')).toHaveAttribute('type', 'date');

    fireEvent.change(screen.getByLabelText(/Name/), { target: { value: 'Microscope' } });
    fireEvent.change(from, { target: { value: '2030-05-06T14:30' } });
    fireEvent.click(screen.getByRole('button', { name: /^(save|create)/i }));
    await waitFor(() => expect(createRecord).toHaveBeenCalled());
    expect(createRecord.mock.calls[0][2].startAt).toBe(new Date('2030-05-06T14:30').toISOString());
    expect(createRecord.mock.calls[0][2].due).toBeNull();
  });
});
