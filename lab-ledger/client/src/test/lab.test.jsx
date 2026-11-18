// Lab Ledger client: scan page, equipment card actions by role, dialogs, My checkouts, outNow panel.
// Validates: lab-ledger Requirements 3.1, 3.3, 3.5, 3.6, 5.2, 5.3, 5.4, 7.1
import { screen, waitFor, fireEvent, render, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import fc from 'fast-check';
import { renderAt, signIn } from './render';
import Scan from '../pages/Scan';
import MyCheckouts from '../pages/MyCheckouts';
import OutNow from '../dashboard/outNow';
import { dueBackBounds, dueBackIso, tagFromScan, MAX_LOAN_DAYS } from '../lib/lab';
import * as lab from '../api/lab';

const ROLES = ['LabManager', 'Technician', 'Student'];
const equipmentMeta = {
  key: 'equipment', label: 'Equipment', icon: 'microscope', titleField: 'name', searchable: true,
  fields: [{ name: 'name', type: 'string', label: 'Name', list: true }, { name: 'status', type: 'enum', label: 'Status', values: ['Available', 'CheckedOut', 'Maintenance', 'CalibrationDue', 'Retired'], filter: true }],
  rolePermissions: { read: ['Technician', 'Student'], create: [], update: ['Technician'], delete: [] },
  statusFlow: { field: 'status', transitions: {}, workflowOnly: ['CheckedOut'] },
  due: { field: 'nextCalibration', status: 'status', from: ['Available'], to: 'CalibrationDue' },
  softDelete: { field: 'status', value: 'Retired' },
};
const checkoutsMeta = {
  key: 'checkouts', label: 'Checkouts', icon: 'hand-helping', titleField: 'equipment',
  fields: [{ name: 'status', type: 'enum', label: 'Status', values: ['Requested', 'Active', 'Overdue', 'Returned', 'Rejected', 'Cancelled'], filter: true }],
  rolePermissions: { read: ['Technician', 'Student'], create: [], update: [], delete: [] },
  statusFlow: null, due: { field: 'dueBack', status: 'status', from: ['Active'], to: 'Overdue' }, softDelete: null,
};

vi.mock('../api/meta', () => ({
  meta: vi.fn(async () => ({ appName: 'Lab Ledger', roles: ['LabManager', 'Technician', 'Student'], superuserRole: 'LabManager', resources: [equipmentMeta, checkoutsMeta] })),
  publicMeta: vi.fn(async () => ({ appName: 'Lab Ledger', demo: false, demoUsers: [] })),
}));
vi.mock('../api/lab', () => ({
  equipmentByTag: vi.fn(),
  requestCheckout: vi.fn(async () => ({ _id: 'c9', status: 'Requested', equipment: { name: 'Digital Oscilloscope' } })),
  approveCheckout: vi.fn(async () => ({ _id: 'c1', status: 'Active', equipment: { name: 'Digital Oscilloscope' } })),
  rejectCheckout: vi.fn(), cancelCheckout: vi.fn(async () => ({ status: 'Cancelled' })), returnCheckout: vi.fn(),
  myCheckouts: vi.fn(), printLabels: vi.fn(),
}));

const PRIYA = 'u-student';
const item = (over = {}) => ({ _id: 'e1', name: 'Digital Oscilloscope', assetTag: 'LL-0001', status: 'Available', condition: 'Good', category: 'Electronics', lab: { name: 'Physics B-12' }, requiresCalibration: true, nextCalibration: '2027-03-01T00:00:00Z', ...over });
const scanData = (over = {}) => ({ item: item(), activeCheckout: null, pendingRequests: [], ...over });
const showTag = (tag = 'LL-0001') => renderAt(<Scan />, { path: '/scan/:tag', route: `/scan/${tag}` });

beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); });

describe('Scan page (Req 5.2–5.4)', () => {
  it('shows "No equipment haunts this tag" with a search link for unknown tags', async () => {
    signIn({ role: 'Student', userId: PRIYA });
    lab.equipmentByTag.mockRejectedValueOnce(Object.assign(new Error('nf'), { response: { status: 404 } }));
    showTag('NOPE-1');
    expect(await screen.findByText('No equipment haunts this tag')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /search equipment/i })).toHaveAttribute('href', '/r/equipment?q=NOPE-1');
  });

  it('always offers scanning from a photo and typing the tag; the camera only when the device has one', async () => {
    signIn({ role: 'Student', userId: PRIYA });
    renderAt(<Scan />, { path: '/scan', route: '/scan' });
    expect(await screen.findByLabelText('Asset tag or link')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /scan from a photo/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /scan with camera/i })).not.toBeInTheDocument(); // jsdom has no camera
  });

  it('shows the camera button whenever a camera exists, even without the built-in QR detector', async () => {
    signIn({ role: 'Student', userId: PRIYA });
    Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: async () => { throw new Error('no'); } }, configurable: true });
    try {
      renderAt(<Scan />, { path: '/scan', route: '/scan' });
      expect(await screen.findByRole('button', { name: /scan with camera/i })).toBeInTheDocument();
    } finally {
      delete navigator.mediaDevices;
    }
  });

  it('extracts tags from scanned label URLs', () => {
    expect(tagFromScan('http://localhost:5173/scan/LL-0042')).toBe('LL-0042');
    expect(tagFromScan('https://lab.example.edu/scan/ll-0007?x=1')).toBe('LL-0007');
    expect(tagFromScan(' ll-0003 ')).toBe('LL-0003');
  });
});

describe('Equipment card actions by role (Req 3.1, 3.3, 3.5, 3.6, 5.3)', () => {
  it('a Student sees status, lab and "Request checkout" on an Available item — no staff controls', async () => {
    signIn({ role: 'Student', userId: PRIYA });
    lab.equipmentByTag.mockResolvedValueOnce(scanData());
    showTag();
    expect(await screen.findByRole('heading', { name: 'Digital Oscilloscope' })).toBeInTheDocument();
    expect(screen.getByText('Physics B-12')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /request checkout/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /approve/i })).not.toBeInTheDocument();
  });

  it('the request dialog sends equipmentId and a due-back within 30 days', async () => {
    signIn({ role: 'Student', userId: PRIYA });
    lab.equipmentByTag.mockResolvedValue(scanData());
    showTag();
    fireEvent.click(await screen.findByRole('button', { name: /request checkout/i }));
    fireEvent.change(screen.getByLabelText('Purpose (optional)'), { target: { value: 'Signals lab' } });
    fireEvent.click(screen.getByRole('button', { name: /send request/i }));
    await waitFor(() => expect(lab.requestCheckout).toHaveBeenCalled());
    const [, body] = lab.requestCheckout.mock.calls[0];
    expect(body).toMatchObject({ equipmentId: 'e1', purpose: 'Signals lab' });
    const due = new Date(body.dueBack).getTime();
    expect(due).toBeGreaterThan(Date.now());
    expect(due).toBeLessThanOrEqual(Date.now() + MAX_LOAN_DAYS * 86400000);
  });

  it('a Student sees the borrower and due date of a checked-out item but cannot record the return', async () => {
    signIn({ role: 'Student', userId: PRIYA });
    lab.equipmentByTag.mockResolvedValueOnce(scanData({
      item: item({ status: 'CheckedOut' }),
      activeCheckout: { _id: 'c1', status: 'Overdue', dueBack: '2026-11-01T18:00:00Z', borrower: { _id: 'u2', name: 'Sam Student' } },
    }));
    showTag();
    expect(await screen.findByText('Sam Student')).toBeInTheDocument();
    expect(screen.getByText(/overdue/i, { selector: 'span' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /request checkout/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /record return/i })).not.toBeInTheDocument();
  });

  it('a Technician sees Record return on loans and Approve/Reject on pending requests', async () => {
    signIn({ role: 'Technician', userId: 'u-tech' });
    lab.equipmentByTag.mockResolvedValueOnce(scanData({
      item: item({ status: 'CheckedOut' }),
      activeCheckout: { _id: 'c1', status: 'Active', dueBack: '2030-01-01T18:00:00Z', borrower: { _id: 'u2', name: 'Sam Student' } },
      pendingRequests: [{ _id: 'c2', status: 'Requested', dueBack: '2030-01-05T18:00:00Z', borrower: { _id: PRIYA, name: 'Priya Student' } }],
    }));
    showTag();
    expect(await screen.findByRole('button', { name: /record return of digital oscilloscope/i })).toBeInTheDocument();
    const pending = screen.getByRole('region', { name: /pending requests/i });
    expect(within(pending).getByRole('button', { name: /reject request/i })).toBeInTheDocument();
    fireEvent.click(within(pending).getByRole('button', { name: /approve request/i }));
    await waitFor(() => expect(lab.approveCheckout).toHaveBeenCalledWith(expect.anything(), 'c2'));
  });

  it('the return dialog warns that Damaged items go to Maintenance', async () => {
    signIn({ role: 'Technician', userId: 'u-tech' });
    lab.equipmentByTag.mockResolvedValueOnce(scanData({
      item: item({ status: 'CheckedOut' }),
      activeCheckout: { _id: 'c1', status: 'Active', dueBack: '2030-01-01T18:00:00Z', borrower: { _id: 'u2', name: 'Sam Student' } },
    }));
    showTag();
    fireEvent.click(await screen.findByRole('button', { name: /record return/i }));
    fireEvent.change(screen.getByLabelText('Condition'), { target: { value: 'Damaged' } });
    expect(screen.getByText(/moved to maintenance/i)).toBeInTheDocument();
  });

  it('a Student can cancel only their own pending request', async () => {
    signIn({ role: 'Student', userId: PRIYA });
    lab.equipmentByTag.mockResolvedValueOnce(scanData({
      pendingRequests: [{ _id: 'c3', status: 'Requested', dueBack: '2030-01-05T18:00:00Z', borrower: { _id: PRIYA, name: 'Priya Student' } }],
    }));
    showTag();
    fireEvent.click(await screen.findByRole('button', { name: /cancel request/i }));
    await waitFor(() => expect(lab.cancelCheckout).toHaveBeenCalledWith(expect.anything(), 'c3'));
    expect(screen.queryByRole('button', { name: /approve/i })).not.toBeInTheDocument();
  });
});

describe('My checkouts', () => {
  it('lists the user\'s loans, highlights overdue ones and offers Cancel on requests', async () => {
    signIn({ role: 'Student', userId: PRIYA });
    lab.myCheckouts.mockResolvedValue({
      items: [
        { _id: 'c1', status: 'Overdue', dueBack: '2026-11-01T18:00:00Z', borrower: { _id: PRIYA }, equipment: { name: 'Thermal Camera', assetTag: 'LL-0012', lab: { name: 'Physics B-12' } } },
        { _id: 'c2', status: 'Requested', dueBack: '2030-01-01T18:00:00Z', borrower: { _id: PRIYA }, equipment: { name: 'Function Generator', assetTag: 'LL-0002' } },
      ],
      total: 2, page: 1, pages: 1,
    });
    renderAt(<MyCheckouts />, { path: '/my-checkouts', route: '/my-checkouts' });
    expect(await screen.findByRole('link', { name: 'Thermal Camera' })).toHaveAttribute('href', '/scan/LL-0012');
    expect(screen.getByText(/overdue, please return it/i)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /cancel request/i })).toHaveLength(1);
    expect(lab.myCheckouts).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ status: 'Requested,Active,Overdue' }));
  });
});

describe('"Out right now" panel (Req 7.1)', () => {
  it('highlights overdue rows', () => {
    render(
      <MemoryRouter>
        <OutNow data={{ total: 2, overdue: 1, rows: [
          { _id: 'a', item: 'Thermal Camera', assetTag: 'LL-0012', borrower: 'Priya Student', dueBack: '2026-11-01', overdue: true },
          { _id: 'b', item: 'Digital Oscilloscope', assetTag: 'LL-0001', borrower: 'Priya Student', dueBack: '2030-11-08', overdue: false },
        ] }} />
      </MemoryRouter>
    );
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows[0]).toHaveAttribute('data-overdue', 'true');
    expect(within(rows[0]).getByText('(overdue)')).toBeInTheDocument();
    expect(rows[1]).not.toHaveAttribute('data-overdue');
    expect(screen.getByText('1 overdue')).toBeInTheDocument();
  });
});

describe('due-back bounds always satisfy the server rule (Req 3.2)', () => {
  it('min and max days map to now < dueBack ≤ now + 30 days', () => {
    fc.assert(
      fc.property(fc.date({ min: new Date('2025-01-01'), max: new Date('2035-01-01') }), (now) => {
        const b = dueBackBounds(now);
        for (const day of [b.min, b.max, b.default]) {
          const due = new Date(dueBackIso(day)).getTime();
          expect(due).toBeGreaterThan(now.getTime());
          expect(due).toBeLessThanOrEqual(now.getTime() + MAX_LOAN_DAYS * 86400000);
        }
      }),
      { numRuns: 300 }
    );
  });
});
