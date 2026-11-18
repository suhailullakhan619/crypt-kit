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
  stock: [
    { category: 'Canned', units: 12, min: 40, short: 28, low: true },
    { category: 'Dry', units: 90, min: 40, short: 0, low: false },
  ],
  waste: { days: 90, donors: [{ donorId: 'd1', name: 'Fresh Mart', lots: 3, received: 50, wasted: 8, wasteRate: 16 }] },
};

beforeEach(() => { localStorage.clear(); get.mockReset(); post.mockReset(); signIn({ role: 'Volunteer' }); });

describe('Insights page', () => {
  it('marks low categories and lists donors with their waste rate', async () => {
    get.mockResolvedValue({ data });
    renderAt(<Insights />, { withMeta: false });
    expect(await screen.findByText('Canned')).toBeInTheDocument();
    expect(screen.getByText('Low')).toBeInTheDocument();
    expect(screen.getByText('OK')).toBeInTheDocument();
    expect(screen.getByText(/1 category is running low/)).toBeInTheDocument();
    expect(screen.getByText('Fresh Mart')).toBeInTheDocument();
    expect(screen.getByText('16%')).toBeInTheDocument();
  });

  it('changing the window asks again, and Download PDF builds the report for it', async () => {
    get.mockResolvedValue({ data });
    post.mockResolvedValue({ data: { report: { _id: 'r1', title: 'Stock insights' } } });
    renderAt(<Insights />, { withMeta: false });
    await screen.findByText('Canned');
    fireEvent.change(screen.getByLabelText('Donor waste over'), { target: { value: '30' } });
    await waitFor(() => expect(get).toHaveBeenLastCalledWith('/insights', { params: { days: 30 } }));
    await waitFor(() => expect(screen.getByRole('button', { name: /download pdf/i })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: /download pdf/i }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/insights/report', { days: 30 }));
  });

  it('says so when nothing is low and nobody donated, and shows server errors', async () => {
    get.mockResolvedValueOnce({ data: { stock: [{ category: 'Dry', units: 90, min: 40, short: 0, low: false }], waste: { days: 90, donors: [] } } });
    const { unmount } = renderAt(<Insights />, { withMeta: false });
    expect(await screen.findByText('Every category is at or above its minimum.')).toBeInTheDocument();
    expect(screen.getByText('No donations in this period')).toBeInTheDocument();
    unmount();
    get.mockRejectedValue({ response: { data: { error: 'Forbidden: insufficient permissions' } } });
    renderAt(<Insights />, { withMeta: false });
    expect(await screen.findByRole('alert')).toHaveTextContent(/forbidden/i);
  });
});
