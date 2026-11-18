import { screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { renderAt, signIn } from './render';
import Insights from '../pages/Insights';

const get = vi.fn();
const post = vi.fn();
vi.mock('../hooks/useApi', () => ({ useApi: () => ({ get: (...a) => get(...a), post: (...a) => post(...a) }) }));
vi.mock('../appRoutes', () => ({ default: [], reportPresets: [], bulkActions: {} }));
vi.mock('../api/reports', () => ({ downloadReport: vi.fn(async () => {}) }));

const data = {
  utilization: {
    days: 90, totalLoans: 7, neverBorrowed: 3,
    mostUsed: [{ equipmentId: 'a', name: 'Oscilloscope', assetTag: 'LL-0001', loans: 5, daysOut: 12.5 }],
    leastUsed: [{ equipmentId: 'b', name: 'Spare lens', assetTag: 'LL-0009', loans: 0, daysOut: 0 }],
    items: [],
  },
  late: { days: 180, borrowers: [{ borrowerId: 'u1', name: 'Ada Student', loans: 4, late: 2, lateRate: 50, stillOut: 1 }] },
};

beforeEach(() => { localStorage.clear(); get.mockReset(); post.mockReset(); signIn({ role: 'Technician' }); });

describe('Insights page', () => {
  it('shows the numbers, most and least used equipment, and late borrowers', async () => {
    get.mockResolvedValue({ data });
    renderAt(<Insights />, { withMeta: false });
    expect(await screen.findByText('Oscilloscope')).toBeInTheDocument();
    expect(screen.getByText('Spare lens')).toBeInTheDocument();
    expect(screen.getByText('Ada Student')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByText('Never borrowed').nextSibling).toHaveTextContent('3');
  });

  it('changing a period asks the server again with the new window', async () => {
    get.mockResolvedValue({ data });
    renderAt(<Insights />, { withMeta: false });
    await screen.findByText('Oscilloscope');
    fireEvent.change(screen.getByLabelText('Equipment use over'), { target: { value: '30' } });
    await waitFor(() => expect(get).toHaveBeenLastCalledWith('/insights', { params: { usageDays: 30, lateDays: 180 } }));
  });

  it('Download PDF asks the server to build the report with the chosen windows', async () => {
    get.mockResolvedValue({ data });
    post.mockResolvedValue({ data: { report: { _id: 'r1', title: 'Lab insights' } } });
    renderAt(<Insights />, { withMeta: false });
    await screen.findByText('Oscilloscope');
    fireEvent.click(screen.getByRole('button', { name: /download pdf/i }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/insights/report', { usageDays: 90, lateDays: 180 }));
  });

  it('says so when nobody is late and shows the server error otherwise', async () => {
    get.mockResolvedValueOnce({ data: { ...data, late: { days: 180, borrowers: [] } } });
    const { unmount } = renderAt(<Insights />, { withMeta: false });
    expect(await screen.findByText('Everyone returns on time')).toBeInTheDocument();
    unmount();
    get.mockRejectedValue({ response: { data: { error: 'Forbidden: insufficient permissions' } } });
    renderAt(<Insights />, { withMeta: false });
    expect(await screen.findByRole('alert')).toHaveTextContent(/forbidden/i);
  });
});
