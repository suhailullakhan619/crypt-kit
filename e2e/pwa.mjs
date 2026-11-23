// Installable-app check for a PRODUCTION build (a local `vite preview` or a live site):
// manifest as Chrome reads it, installability errors, service worker, offline shell, no cached API
// data, and the first-run tour. Read-only for the data: it signs in with a demo role and looks.
//   node pwa.mjs http://localhost:4171
//   node pwa.mjs https://crypt-kit.netlify.app
import { chromium } from 'playwright-core';

const base = (process.argv[2] ?? 'http://localhost:4171').replace(/\/$/, '');
const browser = await chromium.launch({ channel: process.env.CHROME_CHANNEL ?? 'chrome', headless: !process.env.HEADED });
const results = [];
async function step(name, fn) {
  const t = Date.now();
  try { const note = await fn(); results.push({ ok: true, name }); console.log(`PASS ${name}${note ? ' :: ' + note : ''} (${Date.now() - t}ms)`); }
  catch (e) {
    results.push({ ok: false, name });
    console.log(`FAIL ${name} :: ${e.message.split('\n')[0]}`);
    try { // what was on screen, to make a failure easy to read
      await page.screenshot({ path: `c:/Kiro/sites/logs/pwa-fail-${results.length}.png` });
      console.log(`     page: ${page.url()} | buttons: ${(await page.getByRole('button').allInnerTexts()).slice(0, 8).join(' / ')}`);
    } catch { /* page gone */ }
  }
}
const demoButton = (page) => page.getByRole('button', { name: /^(Admin|LabManager|Coordinator)\b/ }).first();

// A fresh context that looks like a real browser to the app (Playwright normally reports navigator.webdriver = true).
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await ctx.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => false }); });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);

await step('login page loads and links the manifest, theme colour and touch icon', async () => {
  await page.goto(`${base}/login`, { timeout: 120000 });
  await demoButton(page).waitFor({ timeout: 120000 });
  const tags = await page.evaluate(() => ({
    manifest: document.querySelector('link[rel=manifest]')?.getAttribute('href'),
    theme: document.querySelectorAll('meta[name=theme-color]').length,
    touch: document.querySelector('link[rel=apple-touch-icon]')?.getAttribute('href'),
  }));
  if (tags.manifest !== '/manifest.webmanifest') throw new Error(`manifest link is ${tags.manifest}`);
  if (tags.theme !== 1) throw new Error(`${tags.theme} theme-color tags`);
  if (!tags.touch) throw new Error('no apple-touch-icon');
});

await step('Chrome reads the manifest and reports no installability errors', async () => {
  await cdp.send('Page.enable');
  const { url, errors, data } = await cdp.send('Page.getAppManifest');
  if (errors?.length) throw new Error(`manifest errors: ${errors.map((e) => e.message).join('; ')}`);
  const m = JSON.parse(data);
  if (m.display !== 'standalone') throw new Error(`display is ${m.display}`);
  const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
  // "not-installable from this page" is reported before the worker controls the page; checked again below
  globalThis.__installErrors = installabilityErrors.map((e) => e.errorId);
  return `${m.name} (${url.split('/').pop()}); pending: ${globalThis.__installErrors.join(', ') || 'none'}`;
});

await step('the service worker registers, activates and controls the page after a reload', async () => {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 20000 });
  const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
  // 'in-incognito' only says this test browser is a throwaway profile; it is not about the app
  const real = installabilityErrors.filter((e) => e.errorId !== 'in-incognito');
  if (real.length) throw new Error(`still not installable: ${real.map((e) => e.errorId).join(', ')}`);
});

await step('the service worker cache holds the shell, and nothing from the API', async () => {
  await demoButton(page).waitFor({ timeout: 30000 });
  await demoButton(page).click();
  await page.waitForURL((u) => !u.pathname.includes('login'), { timeout: 30000 });
  await page.waitForFunction(() => [...document.querySelectorAll('aside a')].some((a) => a.getAttribute('href')?.startsWith('/r/')), null, { timeout: 30000 });
  // a first visit in a real browser opens the tour; a user would skip it
  const tour = page.getByRole('button', { name: 'Skip' });
  if (await tour.waitFor({ timeout: 5000 }).then(() => true, () => false)) await tour.click();
  await page.goto(`${base}/voice`);
  await page.getByLabel('Or type a question').fill('what is on my plate');
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  await page.getByText('You asked').waitFor({ timeout: 30000 });
  const cached = await page.evaluate(async () => {
    const out = {};
    for (const name of await caches.keys()) out[name] = (await (await caches.open(name)).keys()).map((r) => new URL(r.url).pathname);
    return out;
  });
  const names = Object.keys(cached);
  if (names.length !== 1 || !names[0].startsWith('shell-')) throw new Error(`caches: ${names.join(', ')}`);
  const paths = cached[names[0]];
  if (!paths.includes('/index.html')) throw new Error('no index.html in the cache');
  if (!paths.some((p) => p.startsWith('/assets/'))) throw new Error('no hashed assets in the cache');
  const leaked = paths.filter((p) => p.startsWith('/api') || /\/r\/[a-z-]+\/[0-9a-f]{24}/.test(p) === false && /token|notes|checkouts|stock/.test(p));
  if (leaked.length) throw new Error(`cached API-looking paths: ${leaked.join(', ')}`);
  return `${paths.length} files, no API data`;
});

await step('offline: the app still opens from the cache and says it is offline', async () => {
  await page.goto(`${base}/`);
  await page.locator('header').first().waitFor({ timeout: 20000 });
  await ctx.setOffline(true);
  await page.waitForFunction(() => /You are offline/.test(document.body.innerText), null, { timeout: 10000 });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('header').first().waitFor({ timeout: 20000 }); // the shell opened with no network
  await page.goto(`${base}/r/anything`, { waitUntil: 'domcontentloaded' }); // a deep link, also from the cache
  await page.locator('header').first().waitFor({ timeout: 20000 });
  // A really offline phone reports navigator.onLine = false at load, and then the banner is there from the start.
  // Chrome's offline emulation reports true on a fresh load, so only assert the banner when the page says offline.
  const reported = await page.evaluate(() => navigator.onLine);
  if (reported === false) await page.getByText(/You are offline/).waitFor({ timeout: 10000 });
  return reported === false ? 'banner shown on load' : 'shell opened offline (banner verified by the offline event above)';
});

await step('back online: the banner goes away and data loads again', async () => {
  await ctx.setOffline(false);
  await page.waitForFunction(() => !/You are offline/.test(document.body.innerText), null, { timeout: 10000 });
  await page.goto(`${base}/`);
  await page.locator('aside a').nth(1).waitFor({ timeout: 30000 });
});

// the tour, in a context that is signed out and has seen nothing
const fresh = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await fresh.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => false }); });
const p2 = await fresh.newPage();
await step('first visit: the tour opens by itself, covers the app, and Skip is remembered', async () => {
  await p2.goto(`${base}/login`, { timeout: 120000 });
  await demoButton(p2).click();
  await p2.getByText(/^Step 1 of \d$/).waitFor({ timeout: 30000 });
  await p2.getByRole('dialog').getByRole('heading', { name: /^Welcome to / }).waitFor({ timeout: 5000 });
  await p2.getByRole('button', { name: 'Next' }).click();
  await p2.getByText('Find anything').waitFor({ timeout: 5000 });
  await p2.getByRole('button', { name: 'Back' }).click();
  await p2.getByRole('button', { name: 'Skip' }).click();
  await p2.getByRole('dialog').waitFor({ state: 'detached', timeout: 5000 });
  await p2.reload();
  await p2.locator('aside a').nth(1).waitFor({ timeout: 30000 });
  await p2.waitForTimeout(1200);
  if (await p2.getByText(/^Step \d of \d$/).count()) throw new Error('the tour came back after Skip');
});
await step('the tour can be replayed from search ("tour") and runs to Done', async () => {
  await p2.keyboard.press('Control+k');
  await p2.getByRole('combobox').fill('tour');
  await p2.getByRole('option', { name: /Take the tour/ }).click();
  await p2.getByText(/^Step 1 of \d$/).waitFor({ timeout: 5000 });
  const total = Number(((await p2.getByText(/^Step 1 of \d$/).textContent()) ?? '').match(/of (\d)/)[1]);
  for (let i = 1; i < total; i++) await p2.getByRole('button', { name: /^Next/ }).click();
  await p2.getByRole('button', { name: 'Done' }).click();
  await p2.getByRole('dialog').waitFor({ state: 'detached', timeout: 5000 });
});

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\nPWA RESULT: ${results.length - failed.length}/${results.length} passed${failed.length ? `; failed: ${failed.map((f) => f.name).join(' ; ')}` : ''}`);
process.exit(failed.length ? 1 : 0);
