// Read-only browser check of the deployed sites: signs in with every one-click demo role, opens every
// sidebar page, a record, its QR card and the scan lookup, and the public account pages. It never
// submits a form, so the shared demo data is not changed.
//   node live.mjs                 (uses the URLs below)
//   LIVE_SITES=https://a.netlify.app,https://b.netlify.app node live.mjs
import { chromium } from 'playwright-core';

const SITES = (process.env.LIVE_SITES ?? 'https://crypt-kit.netlify.app,https://leb-ledger.netlify.app,https://pantry-ghost.netlify.app').split(',').map((s) => s.trim().replace(/\/$/, ''));
const QR_KEYS = ['notes', 'equipment', 'stock-lots'];
const browser = await chromium.launch({ channel: process.env.CHROME_CHANNEL ?? 'chrome', headless: !process.env.HEADED });
const results = [];
async function step(name, fn) {
  const t = Date.now();
  try { const note = await fn(); results.push({ ok: true }); console.log(`PASS ${name}${note ? ' :: ' + note : ''} (${Date.now() - t}ms)`); }
  catch (e) { results.push({ ok: false, name }); console.log(`FAIL ${name} :: ${e.message.split('\n')[0]}`); }
}
function watch(page, sink) {
  page.on('pageerror', (e) => sink.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') sink.push(`console: ${m.text().slice(0, 160)}`); });
  page.on('requestfailed', (r) => { if (/\/api\//.test(r.url()) && r.failure()?.errorText !== 'net::ERR_ABORTED') sink.push(`request failed: ${r.url()} ${r.failure()?.errorText}`); });
  page.on('response', (r) => { if (/\/api\//.test(r.url()) && r.status() >= 500) sink.push(`HTTP ${r.status()}: ${r.url()}`); });
}
const textProblems = async (page) => {
  const html = await page.content();
  const text = await page.locator('body').innerText();
  return [html.includes('[object Object]') && '[object Object]', /\bundefined\b|\bNaN\b/.test(text) && '"undefined"/"NaN"'].filter(Boolean);
};

for (const site of SITES) {
  const host = new URL(site).host;
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  watch(page, errors);
  let roles = [];
  await step(`[${host}] login page loads its demo buttons (wakes the API)`, async () => {
    await page.goto(`${site}/login`, { timeout: 60000 });
    const demo = page.getByRole('button', { name: /^(Admin|Member|Viewer|LabManager|Technician|Student|Coordinator|Volunteer|Board)\b/ });
    await demo.first().waitFor({ timeout: 120000 }); // a sleeping free-tier API can take a minute
    roles = (await demo.allInnerTexts()).map((t) => t.split(/\s/)[0]);
    return roles.join(', ');
  });
  await step(`[${host}] sign-up and forgot-password pages render`, async () => {
    await page.goto(`${site}/signup`);
    await page.getByRole('button', { name: 'Create account' }).waitFor({ timeout: 20000 });
    await page.goto(`${site}/forgot-password`);
    await page.getByLabel('Email').waitFor({ timeout: 20000 });
  });
  await ctx.close();

  for (const role of roles) {
    const c = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const p = await c.newPage();
    watch(p, errors);
    const visited = [];
    await step(`[${host}] ${role}: one-click sign-in, every sidebar page renders cleanly`, async () => {
      await p.goto(`${site}/login`, { timeout: 60000 });
      await p.getByRole('button', { name: new RegExp(`^${role}\\b`) }).first().click();
      await p.waitForURL((u) => !u.pathname.includes('login'), { timeout: 30000 });
      await p.waitForFunction(() => [...document.querySelectorAll('aside a')].some((a) => a.getAttribute('href')?.startsWith('/r/')), null, { timeout: 30000 });
      const hrefs = [...new Set(await p.locator('aside a').evaluateAll((as) => as.map((a) => a.getAttribute('href'))))];
      const bad = [];
      for (const h of hrefs) {
        await p.goto(`${site}${h}`);
        await p.waitForLoadState('networkidle').catch(() => {});
        await p.waitForTimeout(300);
        visited.push(h);
        for (const prob of await textProblems(p)) bad.push(`${h}: ${prob}`);
      }
      if (bad.length) throw new Error(bad.join(' | '));
      return hrefs.join(' ');
    });
    const qrKey = visited.map((h) => h.replace(/^\/r\//, '')).find((k) => QR_KEYS.includes(k));
    if (qrKey) {
      await step(`[${host}] ${role}: a ${qrKey} record shows its QR card and short ID, and the ID lookup finds it`, async () => {
        await p.goto(`${site}/r/${qrKey}`);
        const href = await p.waitForFunction((k) => [...document.querySelectorAll('main a[href]')].map((a) => a.getAttribute('href')).find((h) => new RegExp(`/r/${k}/[0-9a-f]{24}$`).test(h)), qrKey, { timeout: 20000 }).then((h) => h.jsonValue());
        await p.goto(`${site}${href}`);
        await p.getByRole('img', { name: /^QR code for / }).waitFor({ timeout: 20000 });
        const caption = await p.locator('main').innerText();
        const code = caption.match(/\b(N|LL|SL)-\d{4}\b/)?.[0];
        if (!code) throw new Error('no short ID on the detail page');
        for (const prob of await textProblems(p)) throw new Error(`detail: ${prob}`);
        await p.goto(`${site}/scan/${code}`);
        if (qrKey === 'equipment') {
          await p.getByText(/scan another label/i).first().waitFor({ timeout: 20000 });
        } else {
          await p.waitForURL((u) => /\/r\/[a-z-]+\/[0-9a-f]{24}$/.test(u.pathname), { timeout: 20000 });
          if (!p.url().endsWith(href)) throw new Error(`/scan/${code} opened ${p.url()}`);
        }
        return code;
      });
    }
    await step(`[${host}] ${role}: sign-out asks to confirm (cancelled)`, async () => {
      await p.goto(`${site}/`);
      await p.getByRole('button', { name: 'Sign out' }).first().click();
      const dlg = p.getByRole('dialog');
      await dlg.waitFor({ timeout: 8000 });
      await p.keyboard.press('Escape');
      await dlg.waitFor({ state: 'detached', timeout: 5000 });
    });
    await c.close();
  }
  await step(`[${host}] no console errors, failed API calls or server errors`, async () => {
    if (errors.length) throw new Error([...new Set(errors)].slice(0, 4).join(' | '));
  });
}
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\nLIVE RESULT: ${results.length - failed.length}/${results.length} passed${failed.length ? `; failed: ${failed.map((f) => f.name).join(' ; ')}` : ''}`);
process.exit(failed.length ? 1 : 0);
