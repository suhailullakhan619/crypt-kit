// QR label sheets (lab-ledger Req 5.1)
import fc from 'fast-check';
import QRCode from 'qrcode';
import { renderLabels, labelSlot, scanUrl, PER_PAGE, COLS, ROWS } from './labelService.js';

test('labels fill a 3 × 8 grid per A4 page without overlap', () => {
  fc.assert(
    fc.property(fc.nat(200), (i) => {
      const { page, x, y } = labelSlot(i);
      expect(page).toBe(Math.floor(i / PER_PAGE));
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x + 595.28 / COLS).toBeLessThanOrEqual(595.29);
      expect(y + 841.89 / ROWS).toBeLessThanOrEqual(841.9);
      const next = labelSlot(i + 1);
      if (next.page === page) expect(next.x !== x || next.y !== y).toBe(true);
    })
  );
});

test('QR target is <CLIENT_URL>/scan/<assetTag>', () => {
  expect(scanUrl('https://lab.example.edu/', 'LL-0042')).toBe('https://lab.example.edu/scan/LL-0042');
  expect(scanUrl('http://localhost:5173', 'A B/1')).toBe('http://localhost:5173/scan/A%20B%2F1');
  expect(QRCode.create(scanUrl('http://localhost:5173', 'LL-0042')).modules.size).toBeGreaterThan(20);
});

test('renders one page per 24 labels', async () => {
  const items = Array.from({ length: 25 }, (_, i) => ({ name: `Item ${i}`, assetTag: `LL-${i}`, lab: { name: 'Physics B-12' } }));
  const pdf = await renderLabels(items, { baseUrl: 'http://localhost:5173' });
  expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
  expect(pdf.toString('latin1').match(/\/Type \/Page\b/g)).toHaveLength(2);
});
