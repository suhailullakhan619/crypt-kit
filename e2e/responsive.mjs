// Responsive audit: opens every page of a site at five screen widths and flags
//   - the page scrolling sideways,
//   - elements sticking out past the screen edge (outside a deliberate scroll area),
//   - tap targets smaller than 24 x 24 px on touch-size screens (WCAG 2.5.8),
//   - a missing viewport meta tag.
// Works on the live sites or local copies, signed in with the first one-click demo role.
//   node responsive.mjs                          the three live sites
//   LIVE_SITES=http://localhost:5172 node responsive.mjs
// Output: c:/Kiro/sites/logs/responsive/<site>-<width>-<page>.png and a summary.
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const OUT = process.env.RESP_OUT ?? 'c:/Kiro/sites/logs/responsive';
fs.mkdirSync(OUT, { recursive: true });
const LOCAL = { skeleton: 'http://localhost:5171', lab: 'http://localhost:5172', pantry: 'http://localhost:5173' };
const SITES = (process.env.E2E_APPS && LOCAL[process.env.E2E_APPS] && !process.argv.slice(2).length ? [LOCAL[process.env.E2E_APPS]] : process.argv.slice(2).length ? process.argv.slice(2) : (process.env.LIVE_SITES ?? 'https://crypt-kit.netlify.app,https://leb-ledger.netlify.app,https://pantry-ghost.netlify.app').split(',')).map((s) => s.trim().replace(/\/$/, ''));
const WIDTHS = [{ n: 320, h: 640 }, { n: 375, h: 800 }, { n: 768, h: 1024 }, { n: 1024, h: 768 }, { n: 1440, h: 900 }];
const browser = await chromium.launch({ channel: process.env.CHROME_CHANNEL ?? 'chrome', headless: !process.env.HEADED });
const results = [];
const slug = (s) => (s.replace(/^\//, '').replace(/[^a-z0-9]+/gi, '-') || 'home').slice(0, 40);

// Runs in the page.
const AUDIT = (touch) => {
  const vw = document.documentElement.clientWidth;
  const out = { sideways: document.documentElement.scrollWidth > vw + 1, scrollW: document.documentElement.scrollWidth, vw, outside: [], tiny: [], noViewportMeta: !document.querySelector('meta[name=viewport]') };
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return null;
    const st = getComputedStyle(el);
    if (st.visibility === 'hidden' || st.display === 'none' || +st.opacity === 0) return null;
    return r;
  };
  // an element inside a deliberate horizontal scroller (table wrapper, board, calendar) may extend past the edge
  const inScroller = (el) => {
    for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
      const ox = getComputedStyle(n).overflowX;
      if ((ox === 'auto' || ox === 'scroll' || ox === 'hidden' || ox === 'clip') && n.scrollWidth > n.clientWidth) return true;
      if ((ox === 'auto' || ox === 'scroll') ) return true;
    }
    return false;
  };
  const describe = (el) => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${String(el.className).split(/\s+/).slice(0, 3).join('.')} "${(el.innerText || el.getAttribute('aria-label') || '').trim().slice(0, 30)}"`;
  for (const el of document.body.querySelectorAll('*')) {
    if (el.closest('.sr-only, svg, [aria-hidden="true"], script, style')) continue;
    const r = visible(el);
    if (!r) continue;
    const st = getComputedStyle(el);
    if (st.position === 'fixed' && (r.right <= 0 || r.left >= vw)) continue; // parked off-screen on purpose
    if ((r.right > vw + 1 || r.left < -1) && !inScroller(el) && out.outside.length < 6) out.outside.push(`${describe(el)} spans ${Math.round(r.left)}..${Math.round(r.right)} of ${vw}`);
  }
  if (touch) {
    const sel = 'button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=checkbox], [role=tab], [role=menuitem]';
    for (const el of document.body.querySelectorAll(sel)) {
      if (el.closest('.sr-only, [aria-hidden="true"]')) continue;
      let r = visible(el);
      if (!r) continue;
      // a small checkbox inside a bigger label is as easy to hit as the label
      const label = el.closest('label');
      if (label) { const lr = label.getBoundingClientRect(); if (lr.width >= 24 && lr.height >= 24) r = lr; }
      // plain links inside a sentence are exempt
      if (el.tagName === 'A' && getComputedStyle(el).display === 'inline') continue;
      if ((r.width < 24 || r.height < 24) && out.tiny.length < 6) out.tiny.push(`${describe(el)} is ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
  }
  return out;
};

async function check(page, site, w, name, url, prep) {
  const rec = { site: new URL(site).host, w, name, errors: [] };
  try {
    await page.goto(url, { timeout: 60000 });
    await page.waitForLoadState('networkidle').catch(() => {});
    if (prep) await prep();
    await page.waitForTimeout(400);
    Object.assign(rec, await page.evaluate(AUDIT, w <= 768));
    await page.screenshot({ path: `${OUT}/${rec.site.split('.')[0]}-${w}-${slug(name)}.png` });
  } catch (e) { rec.errors.push(e.message.split('\n')[0]); }
  results.push(rec);
}

for (const site of SITES) {
  // sign in once at desktop size, reuse the session for every width
  const first = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p0 = await first.newPage();
  await p0.goto(`${site}/login`, { timeout: 120000 });
  const demo = p0.getByRole('button', { name: /^(Admin|LabManager|Coordinator)\b/ }).first();
  await demo.waitFor({ timeout: 120000 });
  await demo.click();
  await p0.waitForURL((u) => !u.pathname.includes('login'), { timeout: 30000 });
  await p0.waitForFunction(() => [...document.querySelectorAll('aside a')].some((a) => a.getAttribute('href')?.startsWith('/r/')), null, { timeout: 30000 });
  const token = await p0.evaluate(() => localStorage.getItem('crypt_token'));
  const hrefs = [...new Set(await p0.locator('aside a').evaluateAll((as) => as.map((a) => a.getAttribute('href')).filter(Boolean)))];
  const api = `${site.replace('https://', 'https://')}`;
  const state = await first.storageState();
  await first.close();

  const metaRes = hrefs.filter((h) => h.startsWith('/r/')).map((h) => h.slice(3));
  for (const vp of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width: vp.n, height: vp.h }, storageState: state, hasTouch: vp.n <= 768, isMobile: vp.n <= 480 });
    const page = await ctx.newPage();
    await check(page, site, vp.n, 'login (signed out)', `${site}/login`, async () => { await page.evaluate(() => localStorage.removeItem('crypt_token')); await page.reload(); await page.waitForLoadState('networkidle').catch(() => {}); });
    await ctx.addInitScript((t) => { try { localStorage.setItem('crypt_token', t); } catch { /* ignore */ } }, token);
    for (const h of hrefs) await check(page, site, vp.n, h, `${site}${h}`);
    // first record, new-record form, board and calendar of the first resource
    const key = metaRes[0];
    if (key) {
      await check(page, site, vp.n, `${key} detail`, `${site}/r/${key}`, async () => {
        const href = await page.waitForFunction((k) => [...document.querySelectorAll('main a[href]')].map((a) => a.getAttribute('href')).find((x) => new RegExp(`/r/${k}/[0-9a-f]{24}$`).test(x)), key, { timeout: 20000 }).then((h) => h.jsonValue());
        await page.goto(`${site}${href}`);
        await page.waitForLoadState('networkidle').catch(() => {});
      });
      await check(page, site, vp.n, `${key} new`, `${site}/r/${key}/new`);
      await check(page, site, vp.n, `${key} board`, `${site}/r/${key}?view=board`);
      await check(page, site, vp.n, `${key} calendar`, `${site}/r/${key}?view=calendar`);
    }
    await check(page, site, vp.n, 'search palette', `${site}/`, async () => { await page.keyboard.press('Control+k').catch(() => {}); if (vp.n < 1024) await page.getByRole('button', { name: 'Search everything' }).click().catch(() => {}); await page.getByRole('combobox').fill('a').catch(() => {}); await page.waitForTimeout(700); });
    await check(page, site, vp.n, 'chat answer', `${site}/voice`, async () => { await page.getByLabel('Or type a question').fill('what is on my plate'); await page.getByRole('button', { name: 'Ask', exact: true }).click(); await page.getByText('You asked').waitFor({ timeout: 20000 }); await page.waitForTimeout(500); });
    await check(page, site, vp.n, 'notifications', `${site}/`, async () => { await page.getByRole('button', { name: /^Notifications/ }).click(); await page.waitForTimeout(400); });
    if (vp.n < 768) await check(page, site, vp.n, 'mobile menu', `${site}/`, async () => { await page.getByRole('button', { name: /menu/i }).first().click(); await page.waitForTimeout(500); });
    await ctx.close();
  }
}
await browser.close();

const bad = results.filter((r) => r.sideways || r.outside?.length || r.tiny?.length || r.noViewportMeta || r.errors.length);
console.log(`Checked ${results.length} screens (${[...new Set(results.map((r) => r.site))].join(', ')}; widths ${WIDTHS.map((w) => w.n).join(', ')}).`);
for (const r of bad) {
  const bits = [];
  if (r.sideways) bits.push(`page scrolls sideways (${r.scrollW} wide in ${r.vw})`);
  if (r.outside?.length) bits.push(`sticks out: ${r.outside.join(' | ')}`);
  if (r.tiny?.length) bits.push(`tiny targets: ${r.tiny.join(' | ')}`);
  if (r.noViewportMeta) bits.push('no viewport meta tag');
  if (r.errors.length) bits.push(`errors: ${r.errors.join('; ')}`);
  console.log(`- ${r.site} ${r.w}px ${r.name}: ${bits.join(' ; ')}`);
}
if (!bad.length) console.log('No problems found.');
fs.writeFileSync(`${OUT}/summary.json`, JSON.stringify(results, null, 1));
process.exit(bad.length ? 1 : 0);
