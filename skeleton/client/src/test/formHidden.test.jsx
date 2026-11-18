import { screen } from '@testing-library/react';
import { vi } from 'vitest';
import { renderAt, signIn } from './render';
import ResourceCreate from '../pages/ResourceCreate';
import { editableFields } from '../components/resource/ResourceForm';

vi.mock('../api/resources', () => ({ createRecord: vi.fn() }));
vi.mock('../api/meta', () => ({
  meta: vi.fn(async () => ({
    appName: 'Test', roles: ['Admin', 'Member'], superuserRole: 'Admin',
    resources: [{
      key: 'bookings', label: 'Bookings', icon: 'calendar', titleField: 'name',
      fields: [
        { name: 'name', type: 'string', label: 'Name', required: true, list: true },
        { name: 'owner', type: 'ref', ref: 'User', label: 'Owned by', list: true, formHidden: true },
        { name: 'state', type: 'enum', values: ['Booked', 'Cancelled'], label: 'State', list: true, formHidden: true },
      ],
      rolePermissions: { read: ['Member'], create: ['Member'] },
      genericDisabled: [], statusFlow: null, due: null, softDelete: null,
    }],
  })),
  publicMeta: vi.fn(async () => ({})),
}));

beforeEach(() => { localStorage.clear(); signIn({ role: 'Member' }); });

describe('formHidden fields', () => {
  it('are left out of create and edit forms', () => {
    const resource = { fields: [{ name: 'a' }, { name: 'b', formHidden: true }], statusFlow: null };
    expect(editableFields(resource, { editing: false }).map((f) => f.name)).toEqual(['a']);
    expect(editableFields(resource, { editing: true }).map((f) => f.name)).toEqual(['a']);
  });

  it('the create page shows only the fields a person should fill in', async () => {
    renderAt(<ResourceCreate />, { path: '/r/:key/new', route: '/r/bookings/new' });
    expect(await screen.findByLabelText(/Name/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Owned by')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('State')).not.toBeInTheDocument();
  });
});
