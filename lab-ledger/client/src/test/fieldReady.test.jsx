// Field-ready: tour logic and dialog, offline banner, service-worker registration and behaviour, manifest.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { act, screen, fireEvent, waitFor } from '@testing-library/react';
import { Route, useLocation } from 'react-router-dom';
import { vi } from 'vitest';
import { renderAt, signIn } from './render';
import { AppShell } from '../components/layout/AppShell';
import { OfflineBanner } from '../components/layout/OfflineBanner';
import { registerSW } from '../lib/registerSW';
import { buildSteps, shouldAutoOpen, tourKey } from '../lib/tour';

const resources = [{ key: 'notes', label: 'Notes', icon: 'box', titleField: 'title', fields: [{ name: 'title', type: 'string', label: 'Title' }], rolePermissions: { read: ['Member'], create: ['Member'] }, genericDisabled: [] }];
vi.mock('../appRoutes', () => ({ default: [{ path: 'scan', element: null, label: 'Scan or find', icon: 'scan-line' }], reportPresets: [], bulkActions: {} }));
vi.mock('../hooks/useApi', () => ({ useApi: () => ({ get: vi.fn(async () => ({ data: { items: [], unread: 0 } })), post: vi.fn() }) }));
vi.mock('../api/meta', () => ({
  meta: vi.fn(async () => ({ appName: 'Test App', roles: ['Admin', 'Member'], superuserRole: 'Admin', resources })),
  publicMeta: vi.fn(async () => ({})),
}));
vi.mock('../api/voice', () => ({ examples: vi.fn(async () => ({ examples: ['help', 'which notes are over due'], provider: 'browser' })), ask: vi.fn() }));
vi.mock('../api/search', () => ({ searchAll: vi.fn(async () => []) }));
vi.mock('../qrCodes', () => ({ default: { notes: { idField: 'code' } } }));

function Where() { const l = useLocation(); return <p data-testid="where">{l.pathname}</p>; }
beforeEach(() => { localStorage.clear(); signIn({ role: 'Member', userId: 'u1' }); vi.clearAllMocks(); });

describe('tour logic', () => {
  it('opens by itself only for a first visit to a production build in a real browser', () => {
    expect(shouldAutoOpen({ seen: false, prod: true, webdriver: false, forced: false })).toBe(true);
    expect(shouldAutoOpen({ seen: true, prod: true, webdriver: false, forced: false })).toBe(false);
    expect(shouldAutoOpen({ seen: false, prod: false, webdriver: false, forced: false })).toBe(false); // development and tests
    expect(shouldAutoOpen({ seen: false, prod: true, webdriver: true, forced: false })).toBe(false); // automated browsers
    expect(shouldAutoOpen({ seen: true, prod: false, webdriver: true, forced: true })).toBe(true); // ?tour=1
  });

  it('is remembered per user', () => {
    expect(tourKey('a')).not.toBe(tourKey('b'));
  });

  it('builds steps for this app: the scan step only when there are QR codes, and an example question', () => {
    const withQr = buildSteps({ appName: 'Lab Ledger', hasQr: true, example: 'who has the oscilloscope' });
    expect(withQr.map((s) => s.id)).toEqual(['welcome', 'search', 'assistant', 'scan', 'yours']);
    expect(withQr[0].title).toBe('Welcome to Lab Ledger');
    expect(withQr[2].body).toContain('who has the oscilloscope');
    expect(buildSteps({ appName: 'X', hasQr: false }).map((s) => s.id)).not.toContain('scan');
    expect(buildSteps({ appName: 'X', hasQr: false })[2].body).toContain('what is on my plate'); // fallback example
  });
});

describe('tour dialog', () => {
  const shell = (route = '/?tour=1') => renderAt(<AppShell />, { path: '/', route, withMeta: false, extraRoutes: <Route path="*" element={<Where />} /> });
  const setUrl = (url) => window.history.replaceState({}, '', url);
  afterEach(() => setUrl('/'));

  it('does not open on its own in tests', async () => {
    shell('/');
    await screen.findByRole('button', { name: 'Search everything' });
    expect(screen.queryByText(/Step 1 of/)).not.toBeInTheDocument();
  });

  it('?tour=1 opens it; Next and Back move through the steps; arrow keys work too', async () => {
    setUrl('/?tour=1');
    shell();
    expect(await screen.findByText('Welcome to Test App')).toBeInTheDocument();
    expect(screen.getByText('Step 1 of 5')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    expect(screen.getByText('Find anything')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowRight' });
    await screen.findByText('Ask in plain words');
    await waitFor(() => expect(screen.getByRole('dialog').textContent).toContain('which notes are over due'));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowLeft' });
    expect(screen.getByText('Find anything')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Back/ }));
    expect(screen.getByText('Welcome to Test App')).toBeInTheDocument();
  });

  it('Skip closes it and remembers, per user', async () => {
    setUrl('/?tour=1');
    shell();
    fireEvent.click(await screen.findByRole('button', { name: 'Skip' }));
    await waitFor(() => expect(screen.queryByText(/Step 1 of/)).not.toBeInTheDocument());
    expect(localStorage.getItem(tourKey('u1'))).toBe('1');
  });

  it('finishing the last step ("Done") also remembers; Escape counts as finished', async () => {
    setUrl('/?tour=1');
    shell();
    await screen.findByText('Welcome to Test App');
    for (let i = 0; i < 4; i++) fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    expect(screen.getByText('Step 5 of 5')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(screen.queryByText(/Step 5 of/)).not.toBeInTheDocument());
    expect(localStorage.getItem(tourKey('u1'))).toBe('1');
  });

  it('a step\'s action link goes to that page and ends the tour', async () => {
    setUrl('/?tour=1');
    shell();
    await screen.findByText('Welcome to Test App');
    fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Open the assistant/ }));
    expect(await screen.findByTestId('where')).toHaveTextContent('/voice');
    expect(localStorage.getItem(tourKey('u1'))).toBe('1');
  });

  it('the palette offers "Take the tour" when asked, and it opens the tour', async () => {
    setUrl('/');
    shell('/');
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    const box = await screen.findByRole('combobox');
    fireEvent.change(box, { target: { value: 'tour' } });
    const option = await screen.findByRole('option', { name: /Take the tour/ });
    fireEvent.click(option);
    expect(await screen.findByText('Welcome to Test App', {}, { timeout: 2000 })).toBeInTheDocument();
  });

  it('the palette does not list the tour until you type for it', async () => {
    setUrl('/');
    shell('/');
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    await screen.findByRole('combobox');
    expect(screen.queryByRole('option', { name: /Take the tour/ })).not.toBeInTheDocument();
  });
});

describe('offline banner', () => {
  it('appears when the browser goes offline and disappears when it returns', () => {
    renderAt(<OfflineBanner />, { withMeta: false });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    act(() => { window.dispatchEvent(new Event('offline')); });
    expect(screen.getByRole('status')).toHaveTextContent(/offline.*cannot be saved/i);
    act(() => { window.dispatchEvent(new Event('online')); });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

describe('service worker registration', () => {
  const nav = () => ({ serviceWorker: { register: vi.fn(async () => ({})) } });
  const win = (state) => ({ document: { readyState: state }, addEventListener: vi.fn() });

  it('does nothing outside production, without support, or without a window', () => {
    expect(registerSW({ prod: false, nav: nav(), win: win('complete') })).toBe(false);
    expect(registerSW({ prod: true, nav: {}, win: win('complete') })).toBe(false);
    expect(registerSW({ prod: true, nav: null, win: win('complete') })).toBe(false);
    expect(registerSW({ prod: true, nav: nav(), win: null })).toBe(false);
  });

  it('registers /sw.js once the page has loaded', () => {
    const n = nav();
    expect(registerSW({ prod: true, nav: n, win: win('complete') })).toBe(true);
    expect(n.serviceWorker.register).toHaveBeenCalledWith('/sw.js');
    const n2 = nav();
    const w = win('loading');
    registerSW({ prod: true, nav: n2, win: w });
    expect(n2.serviceWorker.register).not.toHaveBeenCalled();
    expect(w.addEventListener).toHaveBeenCalledWith('load', expect.any(Function), { once: true });
  });

  it('is off in tests (import.meta.env.PROD is false)', () => {
    expect(registerSW()).toBe(false);
  });
});

describe('service worker behaviour', () => {
  // Runs public/sw.js in a fake worker scope and fires events at it.
  const source = fs.readFileSync(path.resolve(__dirname, '../../public/sw.js'), 'utf8').replaceAll('__BUILD_ID__', 'test1');
  function load({ stored = {}, fetchImpl } = {}) {
    const listeners = {};
    const store = new Map(Object.entries(stored)); // cacheName -> Map
    const caches = {
      open: async (name) => {
        const m = store.get(name) ?? new Map(); store.set(name, m);
        return { match: async (k) => m.get(typeof k === 'string' ? k : new URL(k.url).pathname), put: async (k, v) => { m.set(typeof k === 'string' ? k : new URL(k.url).pathname, v); }, addAll: async (urls) => { urls.forEach((u) => m.set(u, { cached: u })); }, add: async (u) => { m.set(u, { cached: u }); } };
      },
      keys: async () => [...store.keys()],
      delete: async (k) => store.delete(k),
    };
    const self = { location: { origin: 'https://app.test' }, addEventListener: (t, fn) => { listeners[t] = fn; } };
    const ctx = { self, caches, fetch: fetchImpl ?? (async () => ({ ok: true, clone() { return this; }, text: async () => '<script src="/assets/index-abc.js"></script>' })), Response: { error: () => ({ error: true }) }, URL, setTimeout, clearTimeout, Promise };
    vm.runInNewContext(source, ctx);
    const fire = (type, extra = {}) => {
      const out = { responded: undefined, waited: undefined };
      listeners[type]({ ...extra, respondWith: (p) => { out.responded = p; }, waitUntil: (p) => { out.waited = p; } });
      return out;
    };
    return { fire, store };
  }
  const req = (url, over = {}) => ({ url: `https://app.test${url}`, method: 'GET', mode: 'cors', ...over });

  it('never handles API calls, other origins or non-GET requests', () => {
    const { fire } = load();
    expect(fire('fetch', { request: req('/api/r/notes') }).responded).toBeUndefined();
    expect(fire('fetch', { request: { url: 'https://api.example.com/api/r/notes', method: 'GET', mode: 'cors' } }).responded).toBeUndefined();
    expect(fire('fetch', { request: req('/r/notes', { method: 'POST' }) }).responded).toBeUndefined();
    expect(fire('fetch', { request: req('/other.json') }).responded).toBeUndefined();
  });

  it('handles page navigations and hashed assets', () => {
    const { fire } = load();
    expect(fire('fetch', { request: req('/r/notes', { mode: 'navigate' }) }).responded).toBeDefined();
    expect(fire('fetch', { request: req('/assets/index-abc.js') }).responded).toBeDefined();
  });

  it('offline: a navigation is answered with the cached shell', async () => {
    const { fire, store } = load({ fetchImpl: async () => { throw new Error('offline'); } });
    (await Promise.resolve()); store.set('shell-test1', new Map([['/index.html', { shell: true }]]));
    const res = await fire('fetch', { request: req('/r/notes', { mode: 'navigate' }) }).responded;
    expect(res).toEqual({ shell: true });
  });

  it('install caches the shell and the assets index.html points at; activate removes older caches only', async () => {
    const { fire, store } = load();
    await fire('install').waited;
    const cache = store.get('shell-test1');
    expect([...cache.keys()]).toEqual(expect.arrayContaining(['/', '/index.html', '/manifest.webmanifest', '/assets/index-abc.js']));
    store.set('shell-old', new Map());
    store.set('something-else', new Map());
    await fire('activate').waited;
    expect([...store.keys()].sort()).toEqual(['shell-test1', 'something-else']);
  });

  it('exactly one build-id placeholder exists, so the stamp cannot miss it; and it does not take over open tabs', () => {
    const raw = fs.readFileSync(path.resolve(__dirname, '../../public/sw.js'), 'utf8');
    expect(raw.split('__BUILD_ID__')).toHaveLength(2);
    expect(source).not.toMatch(/skipWaiting|clients\.claim/);
  });
});

describe('installable app files', () => {
  const root = path.resolve(__dirname, '../..');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public/manifest.webmanifest'), 'utf8'));
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

  it('the manifest has what browsers need to offer installation, and every icon exists', () => {
    expect(manifest).toMatchObject({ display: 'standalone', start_url: '/', scope: '/' });
    expect(manifest.name.length).toBeGreaterThan(1);
    expect(manifest.short_name.length).toBeLessThanOrEqual(12);
    const sizes = manifest.icons.map((i) => i.sizes);
    expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']));
    expect(manifest.icons.some((i) => i.purpose === 'maskable')).toBe(true);
    for (const i of manifest.icons) expect(fs.existsSync(path.join(root, 'public', i.src.replace(/^\//, '')))).toBe(true);
  });

  it('index.html links the manifest, theme colour and touch icon', () => {
    expect(html).toContain('rel="manifest" href="/manifest.webmanifest"');
    expect(html).toContain(`name="theme-color" content="${manifest.theme_color}"`);
    expect(html).toContain('rel="apple-touch-icon"');
    expect(fs.existsSync(path.join(root, 'public/apple-touch-icon.png'))).toBe(true);
  });

  it('netlify serves the worker and manifest uncached', () => {
    const toml = fs.readFileSync(path.join(root, 'netlify.toml'), 'utf8');
    expect(toml).toMatch(/for = "\/sw\.js"[\s\S]*?Cache-Control = "no-cache"/);
    expect(toml).toMatch(/for = "\/manifest\.webmanifest"[\s\S]*?Cache-Control = "no-cache"/);
  });
});
