// The "server is waking up" notice for the free hosting plan.
import { renderHook } from '@testing-library/react';
import { vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { createSlowServerWatch, SLOW_MESSAGE, STILL_MESSAGE } from '../lib/slowServer';
import toast from 'react-hot-toast';
import { useApi } from '../hooks/useApi';
import { AuthProvider } from '../context/AuthContext';

vi.mock('react-hot-toast', () => ({ default: Object.assign(vi.fn(), { loading: vi.fn(), success: vi.fn(), error: vi.fn(), dismiss: vi.fn() }) }));

function harness(opts = {}) {
  const calls = [];
  const w = createSlowServerWatch({
    slowAfter: 4000,
    stillAfter: 25000,
    show: (m) => calls.push(['show', m]),
    ready: () => calls.push(['ready']),
    hide: () => calls.push(['hide']),
    ...opts,
  });
  return { w, calls };
}

describe('createSlowServerWatch', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('says nothing for a request that answers quickly', () => {
    const { w, calls } = harness();
    const end = w.begin();
    vi.advanceTimersByTime(3900);
    end(true);
    vi.advanceTimersByTime(60000);
    expect(calls).toEqual([]);
  });

  it('shows the notice after 4 seconds, then "ready" when the server answers', () => {
    const { w, calls } = harness();
    const end = w.begin();
    vi.advanceTimersByTime(4000);
    expect(calls).toEqual([['show', SLOW_MESSAGE]]);
    vi.advanceTimersByTime(10000);
    end(true);
    expect(calls).toEqual([['show', SLOW_MESSAGE], ['ready']]);
  });

  it('changes the wording if it is still waiting after 25 seconds', () => {
    const { w, calls } = harness();
    const end = w.begin();
    vi.advanceTimersByTime(25000);
    expect(calls).toEqual([['show', SLOW_MESSAGE], ['show', STILL_MESSAGE]]);
    end(true);
  });

  it('one notice for many requests; "ready" only when the last one is done', () => {
    const { w, calls } = harness();
    const a = w.begin();
    vi.advanceTimersByTime(1000);
    const b = w.begin();
    vi.advanceTimersByTime(3000);
    expect(calls.filter((c) => c[0] === 'show')).toHaveLength(1);
    a(true);
    expect(calls.some((c) => c[0] === 'ready')).toBe(false);
    b(true);
    expect(calls.filter((c) => c[0] === 'ready')).toHaveLength(1);
  });

  it('a failed request just removes the notice instead of claiming the server is ready', () => {
    const { w, calls } = harness();
    const end = w.begin();
    vi.advanceTimersByTime(5000);
    end(false);
    expect(calls).toEqual([['show', SLOW_MESSAGE], ['hide']]);
  });

  it('finishing twice does nothing the second time, and a later slow request shows the notice again', () => {
    const { w, calls } = harness();
    const end = w.begin();
    vi.advanceTimersByTime(5000);
    end(true);
    end(true);
    expect(calls.filter((c) => c[0] === 'ready')).toHaveLength(1);
    expect(w.pending).toBe(0);
    w.begin();
    vi.advanceTimersByTime(4000);
    expect(calls.filter((c) => c[0] === 'show')).toHaveLength(2);
  });
});

describe('useApi', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); localStorage.clear(); });
  afterEach(() => vi.useRealTimers());

  const wrapper = ({ children }) => <MemoryRouter><AuthProvider>{children}</AuthProvider></MemoryRouter>;
  const slowAdapter = (ms, status = 200) => (config) => new Promise((resolve, reject) => {
    setTimeout(() => {
      const res = { data: {}, status, statusText: '', headers: {}, config };
      status < 400 ? resolve(res) : reject(Object.assign(new Error('fail'), { config, response: res }));
    }, ms);
  });

  it('a slow API call shows the notice, and the answer replaces it with "ready"', async () => {
    const { result } = renderHook(() => useApi(), { wrapper });
    const p = result.current.get('/slow', { adapter: slowAdapter(7000) });
    await vi.advanceTimersByTimeAsync(4100);
    expect(toast.loading).toHaveBeenCalledWith(SLOW_MESSAGE, expect.objectContaining({ id: 'slow-server' }));
    await vi.advanceTimersByTimeAsync(3000);
    await p;
    expect(toast.success).toHaveBeenCalledWith('The server is ready.', expect.objectContaining({ id: 'slow-server' }));
  });

  it('a fast API call shows nothing', async () => {
    const { result } = renderHook(() => useApi(), { wrapper });
    const p = result.current.get('/fast', { adapter: slowAdapter(50) });
    await vi.advanceTimersByTimeAsync(100);
    await p;
    await vi.advanceTimersByTimeAsync(10000);
    expect(toast.loading).not.toHaveBeenCalled();
  });

  it('a slow API call that fails takes the notice away', async () => {
    const { result } = renderHook(() => useApi(), { wrapper });
    const p = result.current.get('/boom', { adapter: slowAdapter(6000, 500) }).catch((e) => e);
    await vi.advanceTimersByTimeAsync(6100);
    await p;
    expect(toast.dismiss).toHaveBeenCalledWith('slow-server');
    expect(toast.success).not.toHaveBeenCalled();
  });
});
