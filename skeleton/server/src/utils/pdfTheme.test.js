// PDFs use the colours of the portal they come from (crypt.config.js reports.theme, which must match
// the light palette in client/src/theme/tokens.css).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import config from '../../crypt.config.js';
import { DEFAULT_PDF_THEME, resolvePdfTheme, hslToHex, pdfThemeFromTokens } from './pdfTheme.js';
import { PdfBuilder } from './pdfGenerator.js';
import { createReport, setReportDir } from '../services/reportService.js';
import { startDb, makeActor } from '../../test/db.js';
import { pdfColours } from '../../test/pdfColours.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const TOKENS = path.resolve(here, '../../../client/src/theme/tokens.css');

async function sample(theme) {
  const b = new PdfBuilder({ appName: 'Test', title: 'Colours', theme, count: 2 });
  b.helpers.heading('Section');
  b.table([{ key: 'name', label: 'Name' }, { key: 'url', label: 'Link', link: (r) => r.url }], [{ name: 'A', url: 'https://x.test' }, { name: 'B', url: null }]);
  b.helpers.barChart([{ label: 'W1', value: 3 }, { label: 'W2', value: 5 }]);
  return b.finish();
}

describe('resolvePdfTheme', () => {
  test('no theme keeps the original neutral look', () => {
    expect(resolvePdfTheme()).toBe(DEFAULT_PDF_THEME);
    expect(resolvePdfTheme(null)).toBe(DEFAULT_PDF_THEME);
  });
  test('fills gaps from the defaults, and links follow the primary colour', () => {
    const t = resolvePdfTheme({ primary: '#107535' });
    expect(t).toMatchObject({ primary: '#107535', link: '#107535', ink: DEFAULT_PDF_THEME.ink });
    expect(resolvePdfTheme({ primary: '#107535', link: '#000000' }).link).toBe('#000000');
  });
  test('rejects typos with a message that names the problem', () => {
    expect(() => resolvePdfTheme({ primry: '#107535' })).toThrow(/unknown colour "primry"/);
    expect(() => resolvePdfTheme({ primary: 'green' })).toThrow(/reports\.theme\.primary must look like #1a2b3c/);
    expect(() => resolvePdfTheme({ primary: '#fff' })).toThrow(/#1a2b3c/);
    expect(() => resolvePdfTheme('green')).toThrow(/must be an object/);
  });
});

describe('hslToHex', () => {
  test('matches the CSS conversion', () => {
    expect(hslToHex(0, 100, 50)).toBe('#ff0000');
    expect(hslToHex(120, 100, 25)).toBe('#008000');
    expect(hslToHex(0, 0, 100)).toBe('#ffffff');
    expect(hslToHex(240, 100, 50)).toBe('#0000ff');
  });
});

describe(`${config.appName}: PDF colours`, () => {
  test('crypt.config.js reports.theme matches the portal light theme in tokens.css', () => {
    if (!fs.existsSync(TOKENS)) return; // server deployed without the client folder: nothing to compare
    expect(config.reports?.theme).toEqual(pdfThemeFromTokens(fs.readFileSync(TOKENS, 'utf8')));
  });

  test('a themed PDF draws in the portal colours and never in the old navy', async () => {
    const colours = pdfColours(await sample(config.reports.theme));
    const t = resolvePdfTheme(config.reports.theme);
    for (const k of ['primary', 'primaryForeground', 'ink', 'muted', 'border', 'zebra']) expect(colours).toContain(t[k]);
    expect(colours).not.toContain(DEFAULT_PDF_THEME.primary);
    expect(colours).not.toContain(DEFAULT_PDF_THEME.link);
  });

  test('without a theme the PDF keeps the original navy', async () => {
    expect(pdfColours(await sample())).toContain(DEFAULT_PDF_THEME.primary);
  });
});

describe('createReport', () => {
  let db;
  beforeAll(async () => {
    db = await startDb([]);
    setReportDir(fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-theme-')));
  });
  afterAll(() => db.stop());

  test('every stored report uses the app theme from crypt.config.js', async () => {
    const user = await makeActor(config.roles[0], 'Reporter');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-theme-'));
    setReportDir(dir);
    const report = await createReport({ title: 'Themed', resource: 'x', user, count: 0, render: (_doc, h) => h.heading('Hello') });
    const colours = pdfColours(fs.readFileSync(path.join(dir, report.fileName)));
    expect(colours).toContain(config.reports.theme.primary);
    expect(colours).not.toContain(DEFAULT_PDF_THEME.primary);
  });
});
