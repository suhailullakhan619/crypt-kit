// Pantry Ghost client behaviour — Validates: Requirements 4.5, 4.6, 5.6, 6.1, 2.3
import { screen, waitFor, fireEvent, within } from '@testing-library/react';
import { vi } from 'vitest';
import { renderAt, signIn } from './render';
import Intake from '../pages/Intake';
import Distribute from '../pages/Distribute';
import Impact from '../pages/Impact';
import IntakeConfirmCard from '../voice/INTAKE';
import { dietaryWarnings, missingFields, toRow } from '../lib/pantry';
import * as pantryApi from '../api/pantry';

const ROLES = ['Coordinator', 'Volunteer', 'Board'];
const enumField = (name, values, extra = {}) => ({ name, type: 'enum', label: name, values, ...extra });
const stockLots = {
  key: 'stock-lots', label: 'Stock', icon: 'package', titleField: 'itemName',
  fields: [
    { name: 'itemName', type: 'string', label: 'Item' },
    enumField('category', ['Produce', 'Dairy', 'Bakery', 'Frozen', 'Canned', 'Dry', 'Hygiene']),
    { name: 'quantity', type: 'number', label: 'Quantity' },
    enumField('unit', ['item', 'can', 'box', 'kg', 'lb', 'L']),
    enumField('location', ['Shelf', 'Fridge', 'Freezer']),
  ],
  rolePermissions: { read: ['Volunteer', 'Board'], create: ['Volunteer'], update: ['Volunteer'], delete: [] },
};
const households = {
  key: 'households', label: 'Households', icon: 'house', titleField: 'code',
  fields: [{ name: 'code', type: 'string' }, { name: 'size', type: 'number' }, enumField('dietary', ['Vegetarian', 'NutAllergy'], { multiple: true })],
  rolePermissions: { read: ['Volunteer'], create: ['Volunteer'], update: ['Volunteer'], delete: [] },
};
const donors = { key: 'donors', label: 'Donors', fields: [{ name: 'name', type: 'string' }], rolePermissions: { read: ['Volunteer'], create: ['Volunteer'], update: [], delete: [] } };

vi.mock('../api/meta', () => ({
  meta: vi.fn(async () => ({ appName: 'Pantry Ghost', roles: ROLES, superuserRole: 'Coordinator', resources: [stockLots, households, donors] })),
  publicMeta: vi.fn(async () => ({ appName: 'Pantry Ghost', demo: false, demoUsers: [] })),
}));
vi.mock('../api/resources', () => ({
  listRecords: vi.fn(async (_api, key) => (key === 'households'
    ? { items: [{ _id: 'h1', code: 'H-0042', size: 3, dietary: ['NutAllergy'] }], total: 1, page: 1, pages: 1 }
    : { items: [{ _id: 'd1', name: 'Fresh Mart' }], total: 1, page: 1, pages: 1 })),
  createRecord: vi.fn(),
}));
vi.mock('../api/voice', () => ({
  examples: vi.fn(async () => ({ provider: 'browser', examples: [] })),
  ask: vi.fn(),
  query: vi.fn(),
}));
vi.mock('../api/pantry', () => ({
  parseIntake: vi.fn(async (_api, text) => ({
    heard: text, quantity: 12, unit: 'can', itemName: 'Black beans', category: 'Canned', expiresOn: null,
    donorId: 'd1', donorName: 'Fresh Mart', donorGuess: null, location: 'Shelf', missing: ['expiresOn'], confidence: 0.8,
  })),
  saveIntake: vi.fn(async (_api, lots) => lots.map((l, i) => ({ _id: `l${i}`, ...l }))),
  planDistribution: vi.fn(async () => ({
    household: { _id: 'h1', code: 'H-0042', size: 3, dietary: ['NutAllergy'] },
    lines: [{ lotId: 'lot1', quantity: 2, ask: 0, itemName: 'Milk', category: 'Dairy', unit: 'L', location: 'Fridge', expiresOn: '2026-11-07', status: 'ExpiringSoon' }],
    shortfalls: [{ ask: { category: 'Dairy', quantity: 3 }, missing: 1 }],
  })),
  commitDistribution: vi.fn(),
  impactPreview: vi.fn(async () => ({ month: 'November 2026', unitsIn: 10, unitsOut: 4, households: 2, people: 5, distributions: 3, wasteUnits: 1, wasteRate: 0.1, byCategory: [], topDonors: [], weekly: [] })),
  generateImpact: vi.fn(),
}));

// jsdom has no ResizeObserver; recharts' ResponsiveContainer needs one.
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };

beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); });

describe('Intake page (Req 4.6)', () => {
  it('appends a draft row, highlights the missing expiry date and saves only on "Save all"', async () => {
    signIn({ role: 'Volunteer' });
    renderAt(<Intake />, { path: '/intake', route: '/intake' });
    fireEvent.change(await screen.findByLabelText(/type/i), { target: { value: 'twelve cans of black beans from fresh mart' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add draft' }));

    const row = await screen.findByRole('group', { name: 'Draft 1' });
    const expiry = within(row).getByLabelText('Expires on');
    expect(expiry).toHaveAttribute('aria-invalid', 'true');
    expect(within(row).getByText("The ghost didn't catch the expiry date")).toBeInTheDocument();
    expect(within(row).getByLabelText('Item')).toHaveValue('Black beans');
    expect(within(row).getByLabelText('Item')).not.toHaveAttribute('aria-invalid');

    const saveAll = screen.getByRole('button', { name: /save all/i });
    expect(saveAll).toBeDisabled();
    expect(pantryApi.saveIntake).not.toHaveBeenCalled();

    fireEvent.change(expiry, { target: { value: '2027-03-03' } });
    expect(expiry).not.toHaveAttribute('aria-invalid');
    expect(saveAll).toBeEnabled();
    fireEvent.click(saveAll);
    await waitFor(() => expect(pantryApi.saveIntake).toHaveBeenCalledTimes(1));
    expect(pantryApi.saveIntake.mock.calls[0][1]).toEqual([
      { quantity: 12, unit: 'can', itemName: 'Black beans', category: 'Canned', expiresOn: '2027-03-03', donorId: 'd1', location: 'Shelf' },
    ]);
    await waitFor(() => expect(screen.queryByRole('group', { name: 'Draft 1' })).not.toBeInTheDocument());
  });

  it('is hidden from Board (no intake controls)', async () => {
    signIn({ role: 'Board' });
    renderAt(<Intake />, { path: '/intake', route: '/intake' });
    expect(await screen.findByText(/intake is for coordinators and volunteers/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add draft' })).not.toBeInTheDocument();
  });
});

describe('Distribute stepper (Req 5.6)', () => {
  it('walks household → items (dietary warning) → pick list and blocks Confirm while short', async () => {
    signIn({ role: 'Volunteer' });
    renderAt(<Distribute />, { path: '/distribute', route: '/distribute' });
    fireEvent.click(await screen.findByRole('button', { name: /H-0042/ }));
    fireEvent.click(screen.getByRole('button', { name: /next: items/i }));

    fireEvent.click(await screen.findByRole('button', { name: 'One more Dry' }));
    expect(screen.getByText(/can contain nuts/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'One less Dry' }));
    fireEvent.click(screen.getByRole('button', { name: 'One more Dairy' }));
    fireEvent.click(screen.getByRole('button', { name: /plan pick list/i }));

    expect(await screen.findByRole('region', { name: 'Fridge' })).toBeInTheDocument();
    expect(pantryApi.planDistribution.mock.calls[0][1]).toEqual({ householdId: 'h1', items: [{ category: 'Dairy', quantity: 1 }] });
    expect(screen.getByRole('alert')).toHaveTextContent('Dairy: 1 of 3 missing');
    expect(screen.getByRole('button', { name: /confirm distribution/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /use what we have/i })).toBeInTheDocument();
    expect(pantryApi.commitDistribution).not.toHaveBeenCalled();
  });

  it('is hidden from Board', async () => {
    signIn({ role: 'Board' });
    renderAt(<Distribute />, { path: '/distribute', route: '/distribute' });
    expect(await screen.findByText(/distribution is for coordinators and volunteers/i)).toBeInTheDocument();
  });
});

describe('Voice INTAKE confirm card (Req 4.5, 6.1)', () => {
  const result = (missing = []) => ({
    transcript: 'add twelve cans of black beans expiring march 3rd from fresh mart', intent: 'INTAKE', answer: 'I heard…',
    data: { saved: false, draft: { quantity: 12, unit: 'can', itemName: 'Black beans', category: 'Canned', expiresOn: '2027-03-03T00:00:00.000Z', donorId: 'd1', donorName: 'Fresh Mart', location: 'Shelf', missing } },
  });

  it('never saves without an explicit confirm', async () => {
    signIn({ role: 'Volunteer' });
    renderAt(<IntakeConfirmCard result={result()} />, { path: '/voice', route: '/voice' });
    expect(await screen.findByText('12 cans')).toBeInTheDocument();
    expect(pantryApi.saveIntake).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /confirm & save/i }));
    await waitFor(() => expect(pantryApi.saveIntake).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/saved to stock/i)).toBeInTheDocument();
  });

  it('blocks confirm while fields are missing, and shows nothing to Board', async () => {
    signIn({ role: 'Volunteer' });
    const { unmount } = renderAt(<IntakeConfirmCard result={result(['expiresOn'])} />, { path: '/voice', route: '/voice' });
    expect(await screen.findByRole('button', { name: /confirm & save/i })).toBeDisabled();
    unmount();
    localStorage.clear();
    signIn({ role: 'Board' });
    renderAt(<div data-testid="host"><IntakeConfirmCard result={result()} /></div>, { path: '/voice', route: '/voice' });
    await waitFor(() => expect(screen.getByTestId('host')).toBeEmptyDOMElement());
  });
});

describe('Impact page (Req 7.1)', () => {
  it('previews the month for Board and hides it from Volunteers', async () => {
    signIn({ role: 'Board' });
    const { unmount } = renderAt(<Impact />, { path: '/impact', route: '/impact' });
    expect(await screen.findByText('People reached')).toBeInTheDocument();
    expect(screen.getByLabelText('Month')).toBeInTheDocument();
    unmount();
    localStorage.clear();
    signIn({ role: 'Volunteer' });
    renderAt(<Impact />, { path: '/impact', route: '/impact' });
    expect(await screen.findByText(/for coordinators and the board/i)).toBeInTheDocument();
  });
});

describe('helpers', () => {
  it('dietary warnings and missing fields', () => {
    expect(dietaryWarnings(['NutAllergy', 'Halal'], ['Dry', 'Produce'])).toEqual([{ flag: 'NutAllergy', category: 'Dry', message: expect.stringMatching(/nuts/) }]);
    expect(missingFields({ ...toRow({}), itemName: 'Soap', category: 'Hygiene', quantity: '3' })).toEqual([]);
    expect(missingFields(toRow({}))).toEqual(['quantity', 'itemName', 'category', 'expiresOn']);
  });
});
