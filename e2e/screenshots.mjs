// Captures the README / Devpost screenshots from the local demo apps (dev servers on 5171-5173, demo mode).
//   node screenshots.mjs                 all three
//   E2E_APPS=lab node screenshots.mjs    one
// Writes docs/screenshots/<app>-<name>.png. Run it after the interface changes, then commit the images.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../docs/screenshots');
fs.mkdirSync(OUT, { recursive: true });
const APPS = {
  skeleton: { prefix: 'crypt', base: 'http://localhost:5171', admin: /^Admin/i, qr: 'notes', board: 'projects', detail: 'goals' },
  lab: { prefix: 'lab', base: 'http://localhost:5172', admin: /^LabManager/i, qr: 'equipment', board: 'checkouts', detail: 'equipment' },
  pantry: { prefix: 'pantry', base: 'http://localhost:5173', admin: /^Coordinator/i, qr: 'stock-lots', board: 'stock-lots', detail: 'stock-lots' },
};
const only = (process.env.E2E_APPS ?? process.argv[2] ?? '').split(',').filter((k) => APPS[k]);
const apps = only.length ? only : Object.keys(APPS);
const browser = await chromium.launch({ channel: process.env.CHROME_CHANNEL ?? 'chrome' });

async function session(cfg, { theme, width, height }) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, hasTouch: width < 600 });
  await ctx.addInitScript((t) => { try { localStorage.setItem('crypt-theme', t); } catch { /* ignore */ } }, theme);
  const page = await ctx.newPage();
  await page.goto(`${cfg.base}/login`, { timeout: 60000 });
  await page.getByRole('button', { name: cfg.admin }).first().click();
  await page.waitForURL((u) => !u.pathname.includes('login'), { timeout: 30000 });
  await page.waitForFunction(() => [...document.querySelectorAll('aside a, header button')].length > 2, null, { timeout: 30000 });
  return { ctx, page };
}
const settle = async (page, ms = 900) => { await page.waitForLoadState('networkidle').catch(() => {}); await page.waitForTimeout(ms); };
// `full` captures the whole page (the chat answer sits below the fold); the rest are one screen
const shot = async (page, cfg, name, { full = false } = {}) => { await settle(page); await page.screenshot({ path: path.join(OUT, `${cfg.prefix}-${name}.png`), fullPage: full }); console.log(`  ${cfg.prefix}-${name}.png`); };

for (const key of apps) {
  const cfg = APPS[key];
  console.log(key);
  // desktop, dark
  let { ctx, page } = await session(cfg, { theme: 'dark', width: 1440, height: 900 });
  await page.goto(`${cfg.base}/`); await shot(page, cfg, 'dashboard');
  await page.goto(`${cfg.base}/r/${cfg.board}?view=board`); await shot(page, cfg, 'board');
  const token = await page.evaluate(() => localStorage.getItem('crypt_token'));
  const first = (await (await fetch(`${cfg.base}/api/r/${cfg.detail}?limit=1&sort=-createdAt`, { headers: { Authorization: `Bearer ${token}` } })).json()).items[0];
  await page.goto(`${cfg.base}/r/${cfg.detail}/${first._id}`); await shot(page, cfg, 'detail');
  await page.goto(`${cfg.base}/voice`);
  await page.getByLabel('Or type a question').fill('what is on my plate');
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  await page.getByText('You asked').waitFor({ timeout: 20000 });
  await shot(page, cfg, 'chat', { full: true });
  if (key === 'skeleton') {
    await page.getByLabel('Or type a question').fill('add a note to buy candles due friday high priority');
    await page.getByRole('button', { name: 'Ask', exact: true }).click();
    await page.getByRole('group', { name: 'Confirm this change' }).waitFor({ timeout: 20000 });
    await shot(page, cfg, 'chat-command', { full: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${cfg.base}/?tour=1`);
    await page.getByRole('dialog').waitFor({ timeout: 10000 });
    await shot(page, cfg, 'tour');
  }
  await ctx.close();

  // desktop, light
  ({ ctx, page } = await session(cfg, { theme: 'light', width: 1440, height: 900 }));
  await page.goto(`${cfg.base}/r/${cfg.qr}`); await shot(page, cfg, 'list-light');
  await page.goto(`${cfg.base}/`);
  await page.keyboard.press('Control+k');
  await page.getByRole('combobox').fill(key === 'pantry' ? 'milk' : key === 'lab' ? 'micro' : 'plan');
  await page.waitForTimeout(1200);
  await shot(page, cfg, 'search-light');
  await ctx.close();

  // phone, dark
  ({ ctx, page } = await session(cfg, { theme: 'dark', width: 375, height: 760 }));
  await page.goto(`${cfg.base}/r/${cfg.qr}`); await shot(page, cfg, 'phone-list');
  await ctx.close();
}
await browser.close();
console.log('done');
