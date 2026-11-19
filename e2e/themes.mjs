// Visits every page of the locally running portals in BOTH themes (dark and light), saves a
// screenshot of each and audits the page for unreadable text, white-on-white controls and
// sideways scrolling. Apps must be running in demo mode (see README.md).
//   node themes.mjs                 all three apps, desktop + phone
//   node themes.mjs skeleton lab    only some apps
// Output: c:/Kiro/sites/logs/themes/<app>-<theme>-<viewport>-<page>.png and a summary.
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const OUT = process.env.THEME_OUT ?? 'c:/Kiro/sites/logs/themes';
fs.mkdirSync(OUT, { recursive: true });
const APPS = {
  skeleton: { base: 'http://localhost:5171', admin: /^Admin/i, extra: [] },
  lab: { base: 'http://localhost:5172', admin: /^LabManager/i, extra: ['/insights', '/my-checkouts'] },
  pantry: { base: 'http://localhost:5173', admin: /^Coordinator/i, extra: ['/intake', '/distribute', '/insights', '/impact'] },
};
const wanted = process.argv.slice(2).filter((a) => APPS[a]);
const apps = wanted.length ? wanted : Object.keys(APPS);
const browser = await chromium.launch({ channel: process.env.CHROME_CHANNEL ?? 'chrome', headless: !process.env.HEADED });

// Runs in the page: finds text that is hard to read against the colour behind it.
const AUDIT = () => {
  // Handles rgb()/rgba() and the color(srgb r g b / a) form Chrome uses for color-mix() results.
  const parse = (c) => {
    let m = c.match(/^rgba?\(([^)]+)\)/);
    if (m) { const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p[3] ?? 1 }; }
    m = c.match(/^color\(srgb ([^)]+)\)/);
    if (m) { const p = m[1].split(/[ /]+/).filter(Boolean).map(Number); return { r: p[0] * 255, g: p[1] * 255, b: p[2] * 255, a: p[3] ?? 1 }; }
    return null;
  };
  const over = (top, bot) => { const a = top.a + bot.a * (1 - top.a); return a === 0 ? { r: 0, g: 0, b: 0, a: 0 } : { r: (top.r * top.a + bot.r * bot.a * (1 - top.a)) / a, g: (top.g * top.a + bot.g * bot.a * (1 - top.a)) / a, b: (top.b * top.a + bot.b * bot.a * (1 - top.a)) / a, a }; };
  const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const backdrop = (el) => {
    let bg = { r: 255, g: 255, b: 255, a: 0 };
    const chain = [];
    for (let n = el; n; n = n.parentElement) chain.push(n);
    for (const n of chain) { const c = parse(getComputedStyle(n).backgroundColor); if (c && c.a > 0) { bg = over(bg, c); if (bg.a >= 0.999) break; } }
    if (bg.a < 0.999) bg = over(bg, parse(getComputedStyle(document.documentElement).backgroundColor) ?? { r: 255, g: 255, b: 255, a: 1 });
    if (bg.a < 0.999) bg = over(bg, { r: 255, g: 255, b: 255, a: 1 });
    // translucent layers between the element and the page: stack them from the top down
    return bg;
  };
  const bad = [];
  const seen = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let t = walker.nextNode(); t; t = walker.nextNode()) {
    const text = t.textContent.trim();
    const el = t.parentElement;
    if (!text || !el || seen.has(el)) continue;
    const st = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    if (st.visibility === 'hidden' || st.display === 'none' || +st.opacity === 0 || rect.width < 2 || rect.height < 2) continue;
    if (el.closest('[aria-hidden="true"], .sr-only, script, style, svg, canvas')) continue;
    if (rect.bottom < 0 || rect.top > innerHeight * 3) continue;
    seen.add(el);
    const fg = parse(st.color);
    if (!fg) { bad.push({ text: text.slice(0, 40), ratio: 0, need: 0, tag: 'unparsed ' + st.color, cls: '' }); continue; }
    const bg = backdrop(el);
    const eff = over({ ...fg, a: fg.a * (+st.opacity || 1) }, bg);
    const r = ratio(eff, bg);
    const size = parseFloat(st.fontSize);
    const large = size >= 24 || (size >= 18.66 && +st.fontWeight >= 700);
    const min = el.closest('button:disabled, [aria-disabled="true"], input:disabled') ? 1.8 : (large ? 3 : 4.5);
    if (r < min) bad.push({ text: text.slice(0, 40), ratio: +r.toFixed(2), need: min, tag: el.tagName.toLowerCase(), cls: String(el.className).slice(0, 60) });
  }
  // form controls that kept the browser's white/default look in dark mode
  const dark = document.documentElement.classList.contains('dark');
  const controls = [];
  for (const el of document.querySelectorAll('input:not([type=hidden]), select, textarea')) {
    const st = getComputedStyle(el); const rect = el.getBoundingClientRect();
    if (rect.width < 2 || st.display === 'none' || el.closest('.sr-only')) continue;
    const bgc = parse(st.backgroundColor);
    if (el.type === 'checkbox' || el.type === 'radio') { if (dark && st.colorScheme !== 'dark' && !st.colorScheme.includes('dark')) controls.push(`${el.type} not themed`); continue; }
    if (dark && bgc && bgc.a > 0.9 && lum(bgc) > 0.6 && el.type !== 'file') controls.push(`${el.tagName.toLowerCase()}[${el.type || ''}] is white in dark mode`);
  }
  const sideways = document.documentElement.scrollWidth > document.documentElement.clientWidth + 2;
  return { bad: bad.slice(0, 12), badCount: bad.length, controls: [...new Set(controls)], sideways, w: [document.documentElement.scrollWidth, document.documentElement.clientWidth] };
};

const results = [];
const slug = (s) => (s.replace(/^\//, '').replace(/[^a-z0-9]+/gi, '-') || 'home').slice(0, 40);

async function visit(page, app, theme, vp, name, url, prep) {
  const errors = [];
  const onErr = (e) => errors.push(e.message);
  page.on('pageerror', onErr);
  try {
    await page.goto(url, { timeout: 45000 });
    await page.waitForLoadState('networkidle').catch(() => {});
    if (prep) await prep();
    await page.waitForTimeout(500);
    const isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
    if (isDark !== (theme === 'dark')) errors.push(`theme is ${isDark ? 'dark' : 'light'}, expected ${theme}`);
    const audit = await page.evaluate(AUDIT);
    await page.screenshot({ path: `${OUT}/${app}-${theme}-${vp}-${slug(name)}.png` });
    results.push({ app, theme, vp, name, ...audit, errors: [...errors] });
  } catch (e) {
    results.push({ app, theme, vp, name, bad: [], badCount: 0, controls: [], sideways: false, errors: [...errors, e.message.split('\n')[0]] });
  }
  page.off('pageerror', onErr);
}

for (const app of apps) {
  const cfg = APPS[app];
  for (const theme of ['dark', 'light']) {
    for (const vp of [{ n: 'desktop', width: 1440, height: 900 }, { n: 'phone', width: 375, height: 800 }]) {
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      await ctx.addInitScript((t) => { try { localStorage.setItem('crypt-theme', t); } catch { /* ignore */ } }, theme);
      const page = await ctx.newPage();
      // signed-out pages
      await visit(page, app, theme, vp.n, 'login', `${cfg.base}/login`);
      await visit(page, app, theme, vp.n, 'signup', `${cfg.base}/signup`);
      await visit(page, app, theme, vp.n, 'forgot', `${cfg.base}/forgot-password`);
      // sign in
      await page.goto(`${cfg.base}/login`);
      await page.getByRole('button', { name: cfg.admin }).first().click();
      await page.waitForURL((u) => !u.pathname.includes('login'), { timeout: 30000 });
      await page.waitForFunction(() => document.querySelector('aside a, header button'), null, { timeout: 20000 });
      const token = await page.evaluate(() => localStorage.getItem('crypt_token'));
      const meta = await (await fetch(`${cfg.base}/api/meta`, { headers: { Authorization: `Bearer ${token}` } })).json();
      const get = async (p) => (await fetch(`${cfg.base}/api${p}`, { headers: { Authorization: `Bearer ${token}` } })).json();
      const pages = ['/', ...meta.resources.map((r) => `/r/${r.key}`), '/reports', '/voice', '/scan', '/users', ...cfg.extra];
      for (const p of pages) await visit(page, app, theme, vp.n, p, `${cfg.base}${p}`);
      for (const r of meta.resources) {
        const first = (await get(`/r/${r.key}?limit=1`)).items?.[0];
        if (first) await visit(page, app, theme, vp.n, `${r.key} detail`, `${cfg.base}/r/${r.key}/${first._id}`);
        await visit(page, app, theme, vp.n, `${r.key} new`, `${cfg.base}/r/${r.key}/new`);
        const views = [];
        if (r.statusFlow) views.push('board');
        if (r.due || r.fields.some((f) => f.type === 'date' && f.list)) views.push('calendar');
        for (const v of views) await visit(page, app, theme, vp.n, `${r.key} ${v}`, `${cfg.base}/r/${r.key}?view=${v}`);
      }
      const k0 = meta.resources[0].key;
      await visit(page, app, theme, vp.n, 'search palette', `${cfg.base}/`, async () => { await page.keyboard.press('Control+k'); await page.getByRole('combobox').fill(meta.resources[0].label.slice(0, 3)); await page.waitForTimeout(900); });
      // the first record whose detail page has an Edit button (workflow-only records have none)
      let editUrl = null;
      for (const r of meta.resources) {
        const rec = (await get(`/r/${r.key}?limit=1`)).items?.[0];
        if (!rec) continue;
        await page.goto(`${cfg.base}/r/${r.key}/${rec._id}`);
        if (await page.getByRole('button', { name: /^Edit$/ }).waitFor({ timeout: 6000 }).then(() => true, () => false)) { editUrl = `${cfg.base}/r/${r.key}/${rec._id}`; break; }
      }
      if (editUrl) await visit(page, app, theme, vp.n, 'edit dialog', editUrl, async () => { await page.getByRole('button', { name: /^Edit$/ }).click(); await page.getByRole('dialog').waitFor(); });
      await visit(page, app, theme, vp.n, 'notifications', `${cfg.base}/`, async () => { await page.getByRole('button', { name: /^Notifications/ }).click(); await page.waitForTimeout(500); });
      await visit(page, app, theme, vp.n, 'sign out dialog', `${cfg.base}/`, async () => { await page.getByRole('button', { name: 'Sign out' }).first().click(); await page.getByRole('dialog').waitFor(); });
      await ctx.close();
    }
  }
}
await browser.close();

// ---- report ----
const problems = results.filter((r) => r.badCount || r.controls.length || r.sideways || r.errors.length);
console.log(`Checked ${results.length} screens (${apps.join(', ')}; dark + light; desktop + phone).`);
for (const r of problems) {
  const bits = [];
  if (r.badCount) bits.push(`${r.badCount} low-contrast text, e.g. ${r.bad.slice(0, 3).map((b) => `"${b.text}" ${b.ratio}:1 (<${b.need}) <${b.tag}> ${b.cls}`).join(' | ')}`);
  if (r.controls.length) bits.push(r.controls.join(', '));
  if (r.sideways) bits.push(`sideways scroll ${r.w?.join('/')}`);
  if (r.errors.length) bits.push(`errors: ${r.errors.join('; ')}`);
  console.log(`- ${r.app} ${r.theme} ${r.vp} ${r.name}: ${bits.join(' ; ')}`);
}
if (!problems.length) console.log('No problems found.');
fs.writeFileSync(`${OUT}/summary.json`, JSON.stringify(results, null, 1));
process.exit(problems.length ? 1 : 0);
