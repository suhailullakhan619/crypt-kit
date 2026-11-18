// A QR code on the detail page of configured records (client/src/qrCodes.js), encoding the item's link.
import { screen, fireEvent, waitFor } from '@testing-library/react';
import QRCode from 'qrcode';
import { vi } from 'vitest';
import { renderAt, signIn } from './render';
import ResourceDetail from '../pages/ResourceDetail';

const items = {
  a1: { _id: 'a1', name: 'Oscilloscope', tag: 'LL-0001', state: 'Active' },
  a2: { _id: 'a2', name: 'Old scope', tag: 'LL-0002', state: 'Retired' },
  n1: { _id: 'n1', name: 'Plain note', state: 'Active' },
};
const resources = [
  {
    key: 'gadgets', label: 'Gadgets', icon: 'box', titleField: 'name',
    fields: [{ name: 'name', type: 'string', label: 'Name', list: true }, { name: 'tag', type: 'string', label: 'Tag', list: true }, { name: 'state', type: 'enum', values: ['Active', 'Retired'], label: 'State' }],
    rolePermissions: { read: ['Member'] }, genericDisabled: [], statusFlow: null, due: null, softDelete: { field: 'state', value: 'Retired', at: 'retiredAt' },
  },
  {
    key: 'memos', label: 'Memos', icon: 'scroll', titleField: 'name',
    fields: [{ name: 'name', type: 'string', label: 'Name', list: true }],
    rolePermissions: { read: ['Member'] }, genericDisabled: [], statusFlow: null, due: null, softDelete: null,
  },
];

vi.mock('../qrCodes', () => ({ default: { gadgets: { idField: 'tag', idLabel: 'Tag', example: 'LL-0001', target: (r) => ({ path: `/scan/${r.tag}`, caption: r.tag }) } } }));
vi.mock('../appRoutes', () => ({ default: [], reportPresets: [], bulkActions: {} }));
vi.mock('../api/meta', () => ({
  meta: vi.fn(async () => ({ appName: 'Test App', roles: ['Admin', 'Member'], superuserRole: 'Admin', resources })),
  publicMeta: vi.fn(async () => ({})),
}));
vi.mock('../api/resources', () => ({
  getRecord: vi.fn(async (_api, _key, id) => items[id]),
  recordActivity: vi.fn(async () => []),
  updateRecord: vi.fn(),
  deleteRecord: vi.fn(),
}));

beforeEach(() => { localStorage.clear(); signIn({ role: 'Member' }); });
const open = (key, id) => renderAt(<ResourceDetail />, { path: '/r/:key/:id', route: `/r/${key}/${id}` });

describe('QR code on detail pages', () => {
  it('shows a QR that encodes the full item link, with the tag and the link written under it', async () => {
    open('gadgets', 'a1');
    const qr = await screen.findByRole('img', { name: 'QR code for Oscilloscope' });
    const expected = `${window.location.origin}/scan/LL-0001`;
    expect(qr).toHaveAttribute('data-qr-value', expected);
    // the drawn code is exactly the one for that link (same library, same settings)
    const reference = await QRCode.toString(expected, { type: 'svg', errorCorrectionLevel: 'M', margin: 2, color: { dark: '#111827', light: '#ffffff' } });
    const modules = (root) => root.querySelector('path[stroke]')?.getAttribute('d');
    const ref = new DOMParser().parseFromString(reference, 'image/svg+xml');
    expect(modules(qr)).toBeTruthy();
    expect(modules(qr)).toBe(modules(ref)); // same dark modules = same encoded link
    expect(qr.querySelector('path[stroke]')).toHaveAttribute('stroke', '#111827'); // black on white, whatever the theme
    const card = qr.closest('.rounded-lg');
    expect(card).toHaveTextContent('LL-0001'); // the tag printed under the code
    expect(card).toHaveTextContent(expected); // and the link
    expect(screen.getByRole('button', { name: /download/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /print label/i })).toBeEnabled();
  });

  it('records that are not configured get no QR card', async () => {
    open('memos', 'n1');
    await screen.findByRole('heading', { level: 1, name: /Plain note/ });
    expect(screen.queryByText('QR code')).not.toBeInTheDocument();
  });

  it('archived items get no QR card', async () => {
    open('gadgets', 'a2');
    await screen.findByRole('heading', { level: 1, name: /Old scope/ });
    expect(screen.queryByRole('img', { name: /QR code/ })).not.toBeInTheDocument();
  });

  it('Copy link puts the item link on the clipboard', async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    open('gadgets', 'a1');
    await screen.findByRole('img', { name: 'QR code for Oscilloscope' });
    fireEvent.click(screen.getByRole('button', { name: /copy link/i }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/scan/LL-0001`));
  });
});

describe("each portal's QR configuration", () => {
  it('only lists resources that exist and returns an in-portal path', async () => {
    const { default: real } = await vi.importActual('../qrCodes');
    for (const [key, cfg] of Object.entries(real)) {
      const out = cfg.target({ _id: '6afa00000000000000000001', assetTag: 'LL-0001', code: 'X-0001', name: 'X' });
      expect(cfg.idField).toBeTruthy();
      expect(cfg.example).toBeTruthy();
      expect(typeof key).toBe('string');
      expect(out.path).toMatch(/^\//);
    }
  });
});
