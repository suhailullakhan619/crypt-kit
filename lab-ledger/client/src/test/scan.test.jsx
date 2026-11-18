// Scanning: what a scanned/typed value means, ID lookup, the "Scan or find" page and the label sheet.
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { Route } from 'react-router-dom';
import { vi } from 'vitest';
import { renderAt, signIn } from './render';
import { parseScan, findByCode } from '../lib/scan';
import { labelSheetHtml } from '../components/qr/printLabelSheet';
import ScanLookup from '../pages/ScanLookup';

const ORIGIN = window.location.origin;
const config = { gadgets: { idField: 'code', idLabel: 'Gadget ID', example: 'G-0001', target: (r) => ({ path: `/scan/${r.code}`, caption: r.code }) } };
const gadgets = [{ _id: 'aaaaaaaaaaaaaaaaaaaaaaaa', code: 'G-0001', name: 'Scope' }, { _id: 'bbbbbbbbbbbbbbbbbbbbbbbb', code: 'G-0010', name: 'Probe' }];

const listRecords = vi.fn(async (_api, _key, { q }) => ({ items: gadgets.filter((g) => g.code.includes(q.toUpperCase()) || g.name.includes(q)), total: 1, page: 1, pages: 1 }));
const getRecord = vi.fn(async (_api, _key, id) => { const g = gadgets.find((x) => x._id === id); if (!g) throw new Error('404'); return g; });
const decodeQrFile = vi.fn();
vi.mock('../api/resources', () => ({ listRecords: (...a) => listRecords(...a), getRecord: (...a) => getRecord(...a) }));
vi.mock('../components/scan/decodeQr', () => ({ decodeQrFile: (...a) => decodeQrFile(...a), decodeQr: vi.fn(), cameraAvailable: () => false }));
vi.mock('../qrCodes', () => ({ default: { gadgets: { idField: 'code', idLabel: 'Gadget ID', example: 'G-0001', target: (r) => ({ path: `/scan/${r.code}`, caption: r.code }) } } }));
vi.mock('../appRoutes', () => ({ default: [], reportPresets: [], bulkActions: {} }));
vi.mock('../api/meta', () => ({
  meta: vi.fn(async () => ({
    appName: 'Test App', roles: ['Admin', 'Member'], superuserRole: 'Admin',
    resources: [{ key: 'gadgets', label: 'Gadgets', icon: 'box', titleField: 'name', fields: [{ name: 'name', type: 'string', label: 'Name' }], rolePermissions: { read: ['Member'] }, genericDisabled: [] }],
  })),
  publicMeta: vi.fn(async () => ({})),
}));

beforeEach(() => { localStorage.clear(); listRecords.mockClear(); getRecord.mockClear(); decodeQrFile.mockReset(); signIn({ role: 'Member' }); });

describe('parseScan', () => {
  it('reads IDs, /scan links from any address, links inside this portal, and foreign links', () => {
    expect(parseScan(' SL-0012 ', ORIGIN)).toEqual({ kind: 'code', code: 'SL-0012' });
    expect(parseScan(`${ORIGIN}/scan/SL-0012`, ORIGIN)).toEqual({ kind: 'code', code: 'SL-0012' });
    expect(parseScan('https://pantry.example.org/scan/SL-0012', ORIGIN)).toEqual({ kind: 'code', code: 'SL-0012' }); // label from the live site
    expect(parseScan('/scan/LL%2D0001', ORIGIN)).toEqual({ kind: 'code', code: 'LL-0001' });
    expect(parseScan(`${ORIGIN}/r/notes/abc?x=1`, ORIGIN)).toEqual({ kind: 'path', path: '/r/notes/abc?x=1' });
    expect(parseScan('https://evil.example/login', ORIGIN)).toEqual({ kind: 'foreign', url: 'https://evil.example/login' });
    expect(parseScan('   ', ORIGIN)).toEqual({ kind: 'empty' });
  });
});

describe('findByCode', () => {
  it('matches the ID exactly, ignoring case, not a partial match', async () => {
    expect(await findByCode({}, config, 'g-0001')).toEqual({ key: 'gadgets', item: gadgets[0] });
    expect(await findByCode({}, config, 'G-001')).toBeNull();
  });
  it('also accepts a database id, and skips resources the user cannot read', async () => {
    expect((await findByCode({}, config, 'bbbbbbbbbbbbbbbbbbbbbbbb')).item.name).toBe('Probe');
    listRecords.mockClear();
    expect(await findByCode({}, config, 'G-0001', () => false)).toBeNull();
    expect(listRecords).not.toHaveBeenCalled(); // a resource the user cannot read is never queried
  });
});

describe('Scan or find page', () => {
  const render = (route = '/scan') => renderAt(<ScanLookup />, { path: route.startsWith('/scan/') ? '/scan/:code' : '/scan', route, extraRoutes: <Route path="/r/:key/:id" element={<p>Opened item</p>} /> });

  it('typing an ID opens the item', async () => {
    render();
    fireEvent.change(await screen.findByLabelText('ID or link'), { target: { value: 'g-0010' } });
    fireEvent.click(screen.getByRole('button', { name: 'Find' }));
    expect(await screen.findByText('Opened item')).toBeInTheDocument();
  });

  it('a label link (/scan/<id>) looks the ID up straight away', async () => {
    render('/scan/G-0001');
    expect(await screen.findByText('Opened item')).toBeInTheDocument();
  });

  it('scanning a photo of a label opens the item', async () => {
    decodeQrFile.mockResolvedValue(`${ORIGIN}/scan/G-0001`);
    render();
    const input = await screen.findByTestId('qr-photo-input');
    fireEvent.change(input, { target: { files: [new File(['x'], 'label.png', { type: 'image/png' })] } });
    expect(await screen.findByText('Opened item')).toBeInTheDocument();
  });

  it('a photo without a QR code explains what to do', async () => {
    decodeQrFile.mockResolvedValue(null);
    render();
    fireEvent.change(await screen.findByTestId('qr-photo-input'), { target: { files: [new File(['x'], 'blurry.png', { type: 'image/png' })] } });
    expect(await screen.findByRole('alert')).toHaveTextContent(/No QR code was found/);
  });

  it('an unknown ID and a link to another website are explained, never opened', async () => {
    render();
    const box = await screen.findByLabelText('ID or link');
    fireEvent.change(box, { target: { value: 'G-9999' } });
    fireEvent.click(screen.getByRole('button', { name: 'Find' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Nothing in Test App has the ID G-9999');
    fireEvent.change(box, { target: { value: 'https://evil.example/steal' } });
    fireEvent.click(screen.getByRole('button', { name: 'Find' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/not for Test App/);
    expect(screen.queryByText('Opened item')).not.toBeInTheDocument();
  });

  it('shows which IDs it understands', async () => {
    render();
    await screen.findByLabelText('ID or link');
    expect(screen.getByText(/Gadgets:/)).toHaveTextContent('G-0001');
  });
});

describe('labelSheetHtml', () => {
  it('lays out one label per item with its code, ID and name, and escapes names', () => {
    const html = labelSheetHtml({ appName: 'Pantry Ghost', labels: [
      { title: 'Rice <b>bag</b>', caption: 'SL-0001', svg: '<svg id="q1"></svg>' },
      { title: 'Beans', caption: 'SL-0002', svg: '<svg id="q2"></svg>' },
    ] });
    expect(html.match(/class="l"/g)).toHaveLength(2);
    expect(html).toContain('<svg id="q1"></svg>');
    expect(html).toContain('SL-0002');
    expect(html).toContain('Rice &lt;b&gt;bag&lt;/b&gt;');
    expect(html).not.toContain('<b>bag</b>');
    expect(html).toContain('grid-template-columns:repeat(3,70mm)');
    expect(html).toContain('@page{size:A4');
  });
});
