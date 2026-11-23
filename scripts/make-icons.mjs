#!/usr/bin/env node
/**
 * Generates each portal's installable-app files from its own logo and name:
 *   client/public/manifest.webmanifest, icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png
 * and adds the manifest / theme-color / touch-icon tags to client/index.html (once).
 *
 *   node scripts/make-icons.mjs                 all three apps
 *   node scripts/make-icons.mjs lab-ledger      one app
 *
 * Needs Chrome installed (rendered through playwright-core from /e2e). Run it when a logo or name changes
 * and commit the result; nothing here runs at build time.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APPS = ['skeleton', 'lab-ledger', 'pantry-ghost'];

/** '262 20% 7%' -> '#0f0d14' (the dark background token). */
export function hslToHex(h, s, l) {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const c = l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * c).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** The first `--background` inside the `.dark { ... }` block of tokens.css, as hex. */
export function darkBackground(css) {
  const block = css.slice(css.indexOf('.dark'));
  const m = block.match(/--background:\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%/);
  if (!m) throw new Error('no dark --background in tokens.css');
  return hslToHex(Number(m[1]), Number(m[2]), Number(m[3]));
}

/** Builds the manifest object for an app (pure, so it is unit tested). */
export function buildManifest({ name, description, color }) {
  return {
    name,
    short_name: name.length > 12 ? name.slice(0, 12).trim() : name,
    description,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: color,
    theme_color: color,
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Scan or find', url: '/scan' },
      { name: 'Ask the assistant', url: '/voice' },
    ],
  };
}

const TAGS = (color) => `    <link rel="manifest" href="/manifest.webmanifest" />
    <meta name="theme-color" content="${color}" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <meta name="mobile-web-app-capable" content="yes" />
`;

async function main() {
  const wanted = process.argv.slice(2).filter((a) => /^[a-z][a-z0-9-]*$/.test(a));
  const apps = wanted.length ? wanted : APPS;
  const require = createRequire(path.join(ROOT, 'e2e/package.json'));
  const { chromium } = require('playwright-core');
  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage();

  for (const app of apps) {
    const dir = path.join(ROOT, app, 'client');
    const svg = await readFile(path.join(dir, 'public/favicon.svg'), 'utf8');
    const css = await readFile(path.join(dir, 'src/theme/tokens.css'), 'utf8');
    const cfg = await readFile(path.join(ROOT, app, 'server/crypt.config.js'), 'utf8');
    const html = await readFile(path.join(dir, 'index.html'), 'utf8');
    const name = cfg.match(/appName:\s*'([^']*)'/)?.[1];
    if (!name) throw new Error(`${app}: appName not found`);
    const description = html.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? name;
    const color = darkBackground(css);
    const solid = svg.match(/<rect[^>]*fill="(#[0-9a-fA-F]{6})"/)?.[1] ?? color;
    const uri = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

    // transparent corners for "any"; full-bleed colour with the logo inside the safe zone for maskable and Apple
    const render = async (file, size, { bleed }) => {
      await page.setViewportSize({ width: size, height: size });
      const inner = bleed ? Math.round(size * 0.66) : size;
      await page.setContent(`<body style="margin:0;width:${size}px;height:${size}px;background:${bleed ? solid : 'transparent'};display:grid;place-items:center"><img src="${uri}" width="${inner}" height="${inner}" style="display:block"></body>`);
      await page.screenshot({ path: path.join(dir, 'public', file), omitBackground: !bleed });
    };
    await render('icon-192.png', 192, { bleed: false });
    await render('icon-512.png', 512, { bleed: false });
    await render('icon-maskable-512.png', 512, { bleed: true });
    await render('apple-touch-icon.png', 180, { bleed: true });

    await writeFile(path.join(dir, 'public/manifest.webmanifest'), `${JSON.stringify(buildManifest({ name, description, color }), null, 2)}\n`);
    if (!html.includes('rel="manifest"')) {
      const withTags = html.replace(/(\s*<link rel="icon"[^>]*>\r?\n)/, `$1${TAGS(color)}`);
      if (withTags === html) throw new Error(`${app}: could not find the favicon link in index.html`);
      await writeFile(path.join(dir, 'index.html'), withTags);
    }
    console.log(`${app}: "${name}" ${color} -> manifest + 4 icons`);
  }
  await browser.close();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
