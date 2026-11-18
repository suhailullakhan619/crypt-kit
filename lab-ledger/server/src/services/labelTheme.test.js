// The QR label sheet carries the portal colours, but its QR codes stay black for reliable scanning.
import config from '../../crypt.config.js';
import { renderLabels } from './labelService.js';
import { pdfColours } from '../../test/pdfColours.js';

const items = [{ name: 'Digital Oscilloscope', assetTag: 'LL-0001', lab: { name: 'Physics B-12' } }];

test('labels use the Lab Ledger green and theme greys; QR modules stay black', async () => {
  const colours = pdfColours(await renderLabels(items, { baseUrl: 'http://localhost:5173', theme: config.reports.theme }));
  expect(colours).toContain(config.reports.theme.primary); // app name line
  expect(colours).toContain(config.reports.theme.ink);
  expect(colours).toContain(config.reports.theme.muted);
  expect(colours).toContain('#111827'); // QR code ink
  expect(colours).not.toContain('#4b5563'); // the old fixed grey is gone
});
