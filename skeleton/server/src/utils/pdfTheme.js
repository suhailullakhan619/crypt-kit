/**
 * PDF colours. Each app sets `reports.theme` in crypt.config.js to its portal's light theme
 * (client/src/theme/tokens.css), so reports look like the portal they come from. PDFs are printed
 * on white paper, so the light theme is used even when the portal is shown in dark mode.
 * A parity test (pdfTheme.test.js) fails if the config drifts from tokens.css.
 */

/** Used when an app sets no theme: the neutral navy look the reports always had. */
export const DEFAULT_PDF_THEME = Object.freeze({
  primary: '#1f3a68', // title, headings, table header band, chart bars, top accent bar
  primaryForeground: '#ffffff', // text on the table header band
  ink: '#1f2937', // body text
  muted: '#4b5563', // labels, meta line, footer
  border: '#c7ced9', // table grid and chart axis
  zebra: '#f3f5f9', // every other table row
  link: '#1d4ed8', // link sub-lines in tables
});

const KEYS = Object.keys(DEFAULT_PDF_THEME);
const HEX = /^#[0-9a-fA-F]{6}$/;

/**
 * Fills a partial theme with the defaults. `link` defaults to the theme's `primary`, so a link
 * matches the portal instead of staying blue.
 * @param {Partial<typeof DEFAULT_PDF_THEME>} [theme]
 * @throws {Error} for an unknown key or a value that is not #rrggbb, naming it
 */
export function resolvePdfTheme(theme) {
  if (theme === undefined || theme === null) return DEFAULT_PDF_THEME;
  if (typeof theme !== 'object' || Array.isArray(theme)) throw new Error('reports.theme must be an object of #rrggbb colours');
  for (const [k, v] of Object.entries(theme)) {
    if (!KEYS.includes(k)) throw new Error(`reports.theme has unknown colour "${k}" (allowed: ${KEYS.join(', ')})`);
    if (typeof v !== 'string' || !HEX.test(v)) throw new Error(`reports.theme.${k} must look like #1a2b3c (got ${JSON.stringify(v)})`);
  }
  return Object.freeze({ ...DEFAULT_PDF_THEME, link: theme.primary ?? DEFAULT_PDF_THEME.link, ...theme });
}

/** `hsl(h s% l%)` → `#rrggbb` (the CSS colour conversion). */
export function hslToHex(h, s, l) {
  const sat = s / 100;
  const light = l / 100;
  const a = sat * Math.min(light, 1 - light);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    return light - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return `#${[f(0), f(8), f(4)].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Reads the light (`:root`) palette of a tokens.css file and maps it to PDF colours, the same way
 * the portal uses them: primary for headers, foreground for text, muted-foreground for labels,
 * border for lines and muted for zebra rows.
 * @param {string} css
 */
export function pdfThemeFromTokens(css) {
  const start = css.indexOf(':root');
  if (start < 0) throw new Error('tokens.css has no :root block');
  const root = css.slice(start, css.indexOf('}', start));
  const token = (name) => {
    const m = root.match(new RegExp(`--${name}:\\s*([\\d.]+)\\s+([\\d.]+)%\\s+([\\d.]+)%`));
    if (!m) throw new Error(`tokens.css :root has no --${name}`);
    return hslToHex(Number(m[1]), Number(m[2]), Number(m[3]));
  };
  return {
    primary: token('primary'),
    primaryForeground: token('primary-foreground'),
    ink: token('foreground'),
    muted: token('muted-foreground'),
    border: token('border'),
    zebra: token('muted'),
  };
}
