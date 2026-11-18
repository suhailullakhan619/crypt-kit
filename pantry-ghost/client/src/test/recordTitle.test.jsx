// A record whose title is a reference (a calibration's equipment, a loan's item) must show the
// target's name everywhere: table, mobile cards, aria labels, page heading, Edit dialog.
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { renderAt, signIn } from './render';
import ResourceList from '../pages/ResourceList';
import ResourceDetail from '../pages/ResourceDetail';
import { recordTitle } from '../lib/format';

const resource = {
  key: 'calibrations', label: 'Calibrations', icon: 'gauge', titleField: 'equipment',
  fields: [
    { name: 'equipment', type: 'ref', ref: 'equipment', label: 'Equipment', list: true },
    { name: 'result', type: 'enum', values: ['Pass', 'Fail'], label: 'Result', list: true },
  ],
  rolePermissions: { read: ['Member'], update: ['Member'] },
  genericDisabled: [], statusFlow: null, due: null, softDelete: null,
};
const item = { _id: '6afa00000000000000000001', equipment: { _id: 'e1', name: 'Digital Oscilloscope' }, result: 'Pass' };

vi.mock('../appRoutes', () => ({ default: [], reportPresets: [], bulkActions: {} }));
vi.mock('../api/meta', () => ({
  meta: vi.fn(async () => ({ appName: 'Test', roles: ['Admin', 'Member'], superuserRole: 'Admin', resources: [resource] })),
  publicMeta: vi.fn(async () => ({})),
}));
vi.mock('../api/resources', () => ({
  listRecords: vi.fn(async () => ({ items: [item], total: 1, page: 1, pages: 1 })),
  getRecord: vi.fn(async () => item),
  recordActivity: vi.fn(async () => []),
  updateRecord: vi.fn(),
  deleteRecord: vi.fn(),
}));

beforeEach(() => { localStorage.clear(); signIn({ role: 'Member' }); });

describe('recordTitle', () => {
  it('renders a reference title as the target name, with sensible fallbacks', () => {
    expect(recordTitle(resource, item)).toBe('Digital Oscilloscope');
    expect(recordTitle(resource, { ...item, equipment: 'abc123' })).toBe('abc123'); // not populated
    expect(recordTitle(resource, { ...item, equipment: null })).toBe('Untitled');
    expect(recordTitle({ titleField: 'name', fields: [{ name: 'name', type: 'string' }] }, { name: 'Plain' })).toBe('Plain');
    expect(recordTitle({ fields: [{ name: 'code', type: 'string' }] }, { code: 'H-1' })).toBe('H-1'); // no titleField: first field
  });
});

describe('a list whose title is a reference', () => {
  it('never shows [object Object]: link text, aria labels and mobile cards use the name', async () => {
    renderAt(<ResourceList />, { path: '/r/:key', route: '/r/calibrations' });
    expect((await screen.findAllByText('Digital Oscilloscope')).length).toBeGreaterThanOrEqual(2); // table link + mobile card
    expect(screen.getByRole('link', { name: 'Open Digital Oscilloscope' })).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('[object Object]');
    expect(document.body.innerHTML).not.toContain('[object Object]');
  });
});

describe('a detail page whose title is a reference', () => {
  it('shows the name in the heading and in the Edit dialog title', async () => {
    renderAt(<ResourceDetail />, { path: '/r/:key/:id', route: `/r/calibrations/${item._id}` });
    expect(await screen.findByRole('heading', { level: 1, name: /Digital Oscilloscope/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Edit$/ }));
    expect(await screen.findByRole('dialog')).toHaveTextContent('Edit Digital Oscilloscope');
    expect(document.body.innerHTML).not.toContain('[object Object]');
  });
});
