// The "server is waking up" notice, in a real browser. The API is made slow on purpose (like a free-plan
// host that has gone to sleep), so this only ever reads. Run it against one local app:
//   E2E_APPS=skeleton node slowserver.mjs        (the e2e-app.ps1 runner sets E2E_APPS and starts the app)
import { chromium } from 'playwright-core';
const APPS = {
  skeleton: { base: 'http://localhost:5171', admin: /^Admin/i },
  lab: { base: 'http://localhost:5172', admin: /^LabManager/i },
  pantry: { base: 'http://localhost:5173', admin: /^Coordinator/i },
};
const key = (process.env.E2E_APPS ?? 'skeleton').split(',')[0].trim();
const app = APPS[key];
const browser = await chromium.launch({ channel: process.env.CHROME_CHANNEL ?? 'chrome', headless: !process.env.HEADED });
const results = [];
async function step(name, fn) {
  const t = Date.now();
  try { const note = await fn(); results.push(true); console.log(`PASS [${key}] ${name}${note ? ' :: ' + note : ''} (${Date.now() - t}ms)`); }
  catch (e) { results.push(false); console.log(`FAIL [${key}] ${name} :: ${e.message.split('\n')[0]}`); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const notice = (page) => page.getByText(/Waking the server up/);

const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
let slow = true;
await page.route((u) => new URL(u).pathname.startsWith('/api/'), async (route) => { if (slow) await sleep(7000); await route.continue(); });

await step('a slow API shows the waking-up notice, not a blank page', async () => {
  const nav = page.goto(`${app.base}/login`, { timeout: 60000 });
  await notice(page).waitFor({ timeout: 15000 });
  slow = false; // later calls are quick again
  const text = await notice(page).innerText();
  if (!/free plan/.test(text) || !/minute/.test(text)) throw new Error(`notice wording: ${text}`);
  await nav;
});
await step('the notice is announced to screen readers (role=status)', async () => {
  const live = await page.locator('[role=status]').filter({ hasText: /Waking the server up|The server is ready/ }).count();
  if (live < 1) throw new Error('no role=status element carries the notice');
});
await step('when the server answers it says "The server is ready." and then goes away', async () => {
  await page.getByText('The server is ready.').waitFor({ timeout: 15000 });
  await notice(page).waitFor({ state: 'detached', timeout: 5000 });
  await page.getByText('The server is ready.').waitFor({ state: 'detached', timeout: 8000 });
});
await step('the page then works normally (demo sign-in reaches the dashboard)', async () => {
  const btn = page.getByRole('button', { name: app.admin }).first();
  await btn.waitFor({ timeout: 20000 });
  await btn.click();
  await page.waitForURL((u) => !u.pathname.includes('login'), { timeout: 20000 });
});
await step('a normal-speed visit shows no notice at all', async () => {
  const fast = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const p = await fast.newPage();
  await p.goto(`${app.base}/login`, { timeout: 60000 });
  await p.getByRole('button', { name: app.admin }).first().waitFor({ timeout: 20000 });
  await sleep(5500);
  if (await p.getByText(/Waking the server up|The server is ready/).count()) throw new Error('notice shown for a fast server');
  await fast.close();
});
await browser.close();
const ok = results.filter(Boolean).length;
console.log(`E2E RESULT: ${ok}/${results.length} passed`);
process.exit(ok === results.length ? 0 : 1);
