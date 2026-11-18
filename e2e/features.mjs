import { chromium } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SINK = process.env.SINK_FILE ?? 'c:/Kiro/sites/sink.jsonl';
const APPS = {
  skeleton: { base: 'http://localhost:5171', admin: /^Admin/i, title: 'Crypt Kit' },
  lab: { base: 'http://localhost:5172', admin: /^LabManager/i, title: 'Lab Ledger' },
  pantry: { base: 'http://localhost:5173', admin: /^Coordinator/i, title: 'Pantry Ghost' },
};
const wanted = process.argv.slice(2);
const run = (name) => wanted.length === 0 || wanted.includes(name);
// E2E_APPS=lab limits the cross-app sections (dialogs, sweep) to apps that are running.
const onlyApps = (process.env.E2E_APPS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const activeApps = () => Object.entries(APPS).filter(([k]) => !onlyApps.length || onlyApps.includes(k));

const browser = await chromium.launch({ channel: process.env.CHROME_CHANNEL ?? 'chrome', headless: !process.env.HEADED });
const results = [];
const consoleErrors = [];
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-'));

// ───────────── helpers ─────────────
async function newPage(viewport = { width: 1440, height: 900 }) {
  const ctx = await browser.newContext({ viewport, acceptDownloads: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) consoleErrors.push(`console: ${m.text()}`); });
  return page;
}
async function signIn(page, base, role) {
  // The demo buttons appear once the login page has loaded its public config. On a busy machine
  // that can take a while, so reload and retry instead of failing the whole run.
  for (let attempt = 1; ; attempt += 1) {
    const loaded = await page.goto(`${base}/login`, { timeout: 60000 }).then(() => true, () => false);
    const btn = page.getByRole('button', { name: role }).first();
    if (loaded && (await btn.waitFor({ timeout: 30000 }).then(() => true, () => false))) { await btn.click(); break; }
    if (attempt === 3) throw new Error(`sign-in button ${role} never appeared on ${base}/login (machine too busy?)`);
  }
  await page.waitForURL((u) => !u.pathname.includes('login'), { timeout: 20000 });
  await page.locator('header').first().waitFor({ timeout: 15000 });
  const isMobile = (page.viewportSize()?.width ?? 1440) < 768;
  if (!isMobile) await page.locator('aside a').nth(2).waitFor({ timeout: 15000 });
  await page.waitForTimeout(400);
}
async function step(name, fn) {
  const t = Date.now();
  try { const note = await fn(); results.push({ name, ok: true }); console.log(`PASS ${name}${note ? ' :: ' + note : ''} (${Date.now() - t}ms)`); }
  catch (e) { results.push({ name, ok: false, note: e.message.split('\n')[0] }); console.log(`FAIL ${name} :: ${e.message.split('\n')[0]}`); }
}
const links = (page) => page.locator('aside a').allInnerTexts();
const expectText = (page, re, timeout = 8000) => page.getByText(re).first().waitFor({ timeout });
async function downloadPdf(page, click) {
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), click()]);
  const bytes = fs.readFileSync(await dl.path());
  if (bytes.subarray(0, 4).toString() !== '%PDF') throw new Error('download was not a PDF');
  return `${dl.suggestedFilename()} ${bytes.length} bytes`;
}
async function downloadCsv(page, click, headerRe) {
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), click()]);
  const head = fs.readFileSync(await dl.path(), 'utf8').split(/\r?\n/)[0];
  if (!headerRe.test(head)) throw new Error(`unexpected CSV header: ${head}`);
  return dl.suggestedFilename();
}
const mailCount = () => (fs.existsSync(SINK) ? fs.readFileSync(SINK, 'utf8').split('\n').filter(Boolean).length : 0);
const lastMail = () => { const l = fs.readFileSync(SINK, 'utf8').split('\n').filter(Boolean); return l.length ? JSON.parse(l.at(-1)) : null; };
async function firstRecordHref(page, key) {
  const re = key ? `/r/${key}/[0-9a-f]{24}$` : '/r/[a-z-]+/[0-9a-f]{24}$';
  await page.waitForFunction((r) => [...document.querySelectorAll('main a[href]')].some((a) => new RegExp(r).test(a.getAttribute('href'))), re, { timeout: 10000 });
  return page.evaluate((r) => [...document.querySelectorAll('main a[href]')].map((a) => a.getAttribute('href')).find((h) => new RegExp(r).test(h)), re);
}
const noHorizontalScroll = async (page) => {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(500);
  const w = await page.evaluate(() => ({ s: document.documentElement.scrollWidth, c: document.documentElement.clientWidth }));
  if (w.s > w.c + 2) throw new Error(`page is ${w.s}px wide in a ${w.c}px viewport`);
  return `${w.s}/${w.c}`;
};
const localInput = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:00`;

// the bell's test email: spam notice, success toast, and a real message on the (fake) mail server
async function bellEmailTest(page, recipient, appTitle) {
  const before = mailCount();
  await page.getByRole('button', { name: /^Notifications/ }).click();
  await page.getByText('Alerts are also emailed. They may land in spam.').waitFor({ timeout: 8000 });
  await page.getByRole('button', { name: /email me a test/i }).click();
  await page.getByText(new RegExp(`Email sent to ${recipient.replace(/[.]/g, '\\.')}.*spam folder`)).first().waitFor({ timeout: 8000 });
  await page.waitForTimeout(500);
  if (mailCount() !== before + 1) throw new Error(`expected one new email, got ${mailCount() - before}`);
  const m = lastMail();
  if (!new RegExp(`Subject: \\[${appTitle}\\] Test email`).test(m.data)) throw new Error('wrong subject');
  if (!/Reply-To: boss@example\.test/i.test(m.data)) throw new Error('missing reply-to');
  await page.keyboard.press('Escape');
}
async function changePasswordMismatch(page, current) {
  await page.getByRole('button', { name: 'Change password' }).click();
  await page.getByLabel('Current password').fill(current);
  await page.getByLabel('New password', { exact: true }).fill('another-pass-1');
  await page.getByLabel('Confirm new password').fill('different-pass-2');
  await page.getByRole('button', { name: 'Change password' }).last().click();
  await expectText(page, /do not match/i);
  await page.keyboard.press('Escape');
}

// ═════════════ SKELETON (Crypt Kit) ═════════════
if (run('skeleton')) {
  const { base } = APPS.skeleton;
  let page = await newPage();
  await signIn(page, base, /^Admin/i);

  await step('[skeleton] Admin sidebar has Notes, Users and Reports', async () => {
    const l = (await links(page)).join('|');
    for (const need of ['Notes', 'Users', 'Reports']) if (!l.includes(need)) throw new Error(`missing ${need}`);
  });
  await step('[skeleton] Create a note through the form, see it in the list', async () => {
    await page.goto(`${base}/r/notes/new`);
    const title = `E2E note ${Date.now()}`;
    await page.getByLabel(/Title/).fill(title);
    await page.locator('form button[type=submit]').click();
    await page.waitForURL(/\/r\/notes\/[0-9a-f]{24}/, { timeout: 10000 });
    await expectText(page, title);
    globalThis.noteUrl = page.url();
    globalThis.noteTitle = title;
  });
  await step('[skeleton] Status transition appears in the history', async () => {
    await page.goto(globalThis.noteUrl);
    await page.getByRole('button', { name: /^Done$/ }).first().click();
    await expectText(page, /moved it from Open to Done/);
  });
  await step('[skeleton] Search finds the note and Export CSV downloads it', async () => {
    await page.goto(`${base}/r/notes`);
    await page.getByLabel('Search').fill('E2E note');
    await page.getByText(globalThis.noteTitle).first().waitFor({ timeout: 8000 });
    return await downloadCsv(page, () => page.getByRole('button', { name: /export csv/i }).click(), /Title,/);
  });
  await step('[skeleton] Invite a user, then see them in the list', async () => {
    await page.goto(`${base}/users`);
    await page.getByRole('button', { name: /invite user/i }).click();
    const email = `e2e-${Date.now()}@crypt.test`;
    await page.getByRole('dialog').getByLabel(/Name/).fill('E2E Person');
    await page.getByRole('dialog').getByLabel(/Email/).fill(email);
    await page.getByRole('dialog').getByLabel('Temporary password').fill('e2e-password-1');
    await page.getByRole('dialog').getByRole('button', { name: /create user/i }).click();
    // Each row also has a phone-only copy of the email that is hidden on desktop, so look for the visible Email cell.
    await page.getByRole('cell', { name: email, exact: true }).waitFor({ timeout: 8000 });
  });
  await step('[skeleton] Sign up from the login page, wait for approval, get approved, sign in', async () => {
    const email = `signup-${Date.now()}@crypt.test`;
    globalThis.signupEmail = email;
    const guest = await newPage();
    await guest.goto(`${base}/login`, { timeout: 60000 });
    await guest.getByRole('link', { name: 'Create an account' }).click();
    await guest.waitForURL(/\/signup/);
    await guest.getByLabel('Name').fill('Signup Person');
    await guest.getByLabel('Email').fill(email);
    await guest.getByLabel('Password', { exact: true }).fill('signup-password-1');
    await guest.getByLabel('Confirm password').fill('signup-password-1');
    await guest.getByRole('button', { name: 'Create account' }).click();
    await guest.getByRole('status').getByText(/waiting for approval/i).waitFor({ timeout: 10000 });
    // signing in before approval explains why it fails
    await guest.goto(`${base}/login`);
    await guest.getByLabel('Email').fill(email);
    await guest.getByLabel('Password', { exact: true }).fill('signup-password-1');
    await guest.getByRole('button', { name: 'Sign in' }).click();
    await guest.getByText(/waiting for approval/i).first().waitFor({ timeout: 8000 });
    // the admin sees the request and approves it
    await page.goto(`${base}/users`);
    const row = page.getByRole('row').filter({ hasText: email });
    await row.getByText('Waiting for approval').waitFor({ timeout: 8000 });
    await row.getByRole('button', { name: 'Approve' }).click();
    await row.getByText('Waiting for approval').waitFor({ state: 'detached', timeout: 8000 });
    // now the person can sign in
    await guest.goto(`${base}/login`);
    await guest.getByLabel('Email').fill(email);
    await guest.getByLabel('Password', { exact: true }).fill('signup-password-1');
    await guest.getByRole('button', { name: 'Sign in' }).click();
    await guest.waitForURL((u) => !u.pathname.includes('login'), { timeout: 10000 });
    await guest.context().close();
  });
  await step('[skeleton] Forgot password: the emailed link sets a new password', async () => {
    const guest = await newPage();
    await guest.goto(`${base}/login`, { timeout: 60000 });
    await guest.getByRole('link', { name: 'Forgot password?' }).click();
    await guest.waitForURL(/\/forgot-password/);
    const before = mailCount();
    if (!globalThis.signupEmail) throw new Error('needs the account from the sign-up step');
    await guest.getByLabel('Email').fill(globalThis.signupEmail);
    await guest.getByRole('button', { name: 'Send reset link' }).click();
    await guest.getByRole('status').getByText(/spam folder/).waitFor({ timeout: 10000 });
    for (let i = 0; i < 20 && mailCount() === before; i += 1) await guest.waitForTimeout(250);
    if (mailCount() !== before + 1) throw new Error('no reset email was sent');
    // decode quoted-printable soft line breaks before reading the link
    const body = lastMail().data.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/g, (_m, h) => String.fromCharCode(parseInt(h, 16)));
    const link = body.match(/https?:\/\/[^\s"<>]+\/reset-password\?token=[A-Za-z0-9_-]+/)?.[0];
    if (!link) throw new Error('reset email has no link');
    await guest.goto(link.replace(/^https?:\/\/[^/]+/, base));
    await guest.getByLabel('New password', { exact: true }).fill('member-new-pass-1');
    await guest.getByLabel('Confirm new password').fill('member-new-pass-1');
    await guest.getByRole('button', { name: 'Set new password' }).click();
    await guest.waitForURL(/\/login/, { timeout: 10000 });
    await guest.getByLabel('Email').fill(globalThis.signupEmail);
    await guest.getByLabel('Password', { exact: true }).fill('member-new-pass-1');
    await guest.getByRole('button', { name: 'Sign in' }).click();
    await guest.waitForURL((u) => !u.pathname.includes('login'), { timeout: 10000 });
    // the link works only once
    await guest.goto(link.replace(/^https?:\/\/[^/]+/, base));
    await guest.getByLabel('New password', { exact: true }).fill('member-third-pass-1');
    await guest.getByLabel('Confirm new password').fill('member-third-pass-1');
    await guest.getByRole('button', { name: 'Set new password' }).click();
    await guest.getByRole('alert').getByText(/expired/).waitFor({ timeout: 8000 });
    await guest.context().close();
  });
  await step('[skeleton] Reports page loads', async () => { await page.goto(`${base}/reports`); await expectText(page, /report/i); });
  await step('[skeleton] Voice agent answers a typed question', async () => {
    await page.goto(`${base}/voice`);
    const box = page.getByRole('textbox').first();
    await box.fill('how many notes are open?');
    await box.press('Enter');
    await expectText(page, /note/i, 15000);
  });
  await step('[skeleton] Bell: Email me a test sends a real message and warns about spam', async () => bellEmailTest(page, 'admin@crypt.test', 'Crypt Kit'));
  await step('[skeleton] Change password: mismatch is caught in the form', async () => changePasswordMismatch(page, 'crypt-admin-demo'));
  await step('[skeleton] Sign out asks first: Cancel stays, confirming goes to the login page', async () => {
    await page.goto(`${base}/`);
    await page.getByRole('button', { name: 'Sign out' }).click();
    const dlg = page.getByRole('dialog');
    await dlg.getByText(/Are you sure you want to sign out/).waitFor({ timeout: 8000 });
    await dlg.getByRole('button', { name: 'Cancel' }).click();
    await dlg.waitFor({ state: 'detached', timeout: 4000 });
    if (page.url().includes('/login')) throw new Error('Cancel signed out anyway');
    await page.getByRole('button', { name: 'Sign out' }).click();
    await page.getByRole('dialog').getByRole('button', { name: /sign out/i }).click();
    await page.waitForURL(/\/login/, { timeout: 8000 });
    await page.getByRole('button', { name: /^Admin/i }).first().waitFor({ timeout: 15000 }); // demo buttons still offered
  });
  await page.context().close();

  page = await newPage();
  await signIn(page, base, /^Viewer/i);
  await step('[skeleton] Viewer is read-only: no New, Import or Users', async () => {
    await page.goto(`${base}/r/notes`);
    await page.getByRole('button', { name: /export csv/i }).waitFor();
    if (await page.getByRole('link', { name: /new note/i }).count()) throw new Error('New visible to viewer');
    if (await page.getByRole('button', { name: /import csv/i }).count()) throw new Error('Import visible to viewer');
    if ((await links(page)).some((l) => /Users/.test(l))) throw new Error('Users link visible to viewer');
  });
  await page.context().close();

  page = await newPage({ width: 375, height: 800 });
  await signIn(page, base, /^Member/i);
  for (const [label, p] of [['dashboard', '/'], ['notes list', '/r/notes'], ['new note', '/r/notes/new']]) {
    await step(`[skeleton] Mobile 375px: ${label} has no horizontal scroll`, async () => { await page.goto(`${base}${p}`); return noHorizontalScroll(page); });
  }
  await page.context().close();
}

// ═════════════ LAB LEDGER ═════════════
if (run('lab')) {
  const { base } = APPS.lab;
  let page = await newPage();
  await signIn(page, base, /^Student/i);

  await step('[lab] Student sidebar: Reservations present, Insights hidden', async () => {
    const l = await links(page);
    if (!l.some((x) => /Reservations/.test(x))) throw new Error('no Reservations link');
    if (l.some((x) => /Insights/.test(x))) throw new Error('Insights visible to a student');
  });
  await step('[lab] Bell: Email me a test sends a real message and warns about spam', async () => bellEmailTest(page, 'student@lab.test', 'Lab Ledger'));
  await step('[lab] Change password: mismatch is caught in the form', async () => changePasswordMismatch(page, 'lab-student-demo'));
  await step('[lab] Scan: a label opens the item card', async () => {
    await page.goto(`${base}/scan/LL-0001`);
    await expectText(page, /Digital Oscilloscope/);
  });
  await step('[lab] Scan: an unknown tag gets the friendly message', async () => {
    await page.goto(`${base}/scan/NOPE-1`);
    await expectText(page, /No equipment haunts this tag/i);
  });
  await step('[lab] Reservations: the form hides server-set fields and books a slot', async () => {
    await page.goto(`${base}/r/reservations/new`);
    await page.getByLabel(/Equipment/).waitFor();
    if ((await page.getByLabel('Booked by').count()) || (await page.getByLabel('Status', { exact: true }).count())) throw new Error('server-set fields are shown');
    await page.waitForTimeout(500);
    const val = await page.locator('select#field-equipment option', { hasText: 'Oscilloscope' }).first().getAttribute('value');
    await page.getByLabel(/Equipment/).selectOption(val);
    const d = new Date(); d.setDate(d.getDate() + 10); d.setHours(10, 0, 0, 0);
    const e = new Date(d); e.setHours(12);
    await page.getByLabel(/From/).fill(localInput(d));
    await page.getByLabel(/Until/).fill(localInput(e));
    await page.getByLabel(/Purpose/).fill('E2E booking');
    await page.locator('form button[type=submit]').click();
    await page.waitForURL(/\/r\/reservations\/[0-9a-f]{24}/, { timeout: 10000 });
    await expectText(page, /Booked/);
    globalThis.bookedUrl = page.url();
    globalThis.slot = { start: localInput(d), end: localInput(e), val };
  });
  await step('[lab] Reservations: an overlapping booking is refused clearly', async () => {
    await page.goto(`${base}/r/reservations/new`);
    await page.getByLabel(/Equipment/).waitFor();
    await page.waitForTimeout(500);
    await page.getByLabel(/Equipment/).selectOption(globalThis.slot.val);
    await page.getByLabel(/From/).fill(globalThis.slot.start);
    await page.getByLabel(/Until/).fill(globalThis.slot.end);
    await page.locator('form button[type=submit]').click();
    await expectText(page, /already reserved/i);
  });
  await step('[lab] Reservations: the owner cancels', async () => {
    await page.goto(globalThis.bookedUrl);
    await page.getByRole('button', { name: /cancel/i }).first().click();
    await expectText(page, /Cancelled/);
  });
  await step('[lab] Dashboard: Reservations card does not call finished bookings overdue', async () => {
    await page.goto(`${base}/`);
    await expectText(page, /Out right now/);
    const cards = await page.locator('main div.rounded-lg').allInnerTexts();
    const resv = cards.find((c) => /^\s*Reservations/.test(c));
    if (!resv) throw new Error('no Reservations card');
    if (/overdue/i.test(resv)) throw new Error(`still says overdue: ${resv.replace(/\s+/g, ' ')}`);
  });
  await step('[lab] Equipment: Export CSV, saved view survives a reload, no Import for a student', async () => {
    await page.goto(`${base}/r/equipment`);
    if (await page.getByRole('button', { name: /import csv/i }).count()) throw new Error('Import visible to student');
    await downloadCsv(page, () => page.getByRole('button', { name: /export csv/i }).click(), /Name,Asset tag/);
    await page.getByLabel('Search').fill('scope');
    await page.getByRole('button', { name: /save view/i }).click();
    await page.getByLabel('View name').fill('Scopes');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByRole('button', { name: 'Scopes', exact: true }).waitFor();
    await page.goto(`${base}/r/equipment`);
    await page.getByRole('button', { name: 'Scopes', exact: true }).click();
    await page.waitForURL(/q=scope/);
    if ((await page.locator('tbody tr').count()) < 1) throw new Error('view applied but no rows');
  });
  await step('[lab] Calibrations: titles show the equipment name', async () => {
    await page.goto(`${base}/r/calibrations`);
    await page.waitForSelector('tbody tr');
    const href = await firstRecordHref(page, 'calibrations');
    await page.goto(`${base}${href}`);
    const h1 = await page.getByRole('heading', { level: 1 }).first().innerText();
    if (/object Object|^Untitled$/.test(h1)) throw new Error(`bad title: ${h1}`);
  });
  await step('[lab] Student opening /insights gets a clear error, not a crash', async () => {
    await page.goto(`${base}/insights`);
    await page.getByRole('alert').waitFor({ timeout: 10000 });
  });
  await step('[lab] Voice agent: "who has the oscilloscope?"', async () => {
    await page.goto(`${base}/voice`);
    const box = page.getByRole('textbox').first();
    await box.fill('who has the oscilloscope?');
    await box.press('Enter');
    await expectText(page, /Digital Oscilloscope/i, 15000);
  });
  await page.context().close();

  page = await newPage();
  await signIn(page, base, /^Technician/i);
  await step('[lab] Technician: Insights shows tables, changes window, downloads a PDF', async () => {
    await page.locator('aside a', { hasText: 'Insights' }).click();
    await page.waitForURL(/\/insights/);
    for (const t of [/Most used/, /Least used/, /Late returns/]) await expectText(page, t);
    await page.getByLabel('Equipment use over').selectOption('365');
    await expectText(page, /Loans started/);
    return await downloadPdf(page, () => page.getByRole('button', { name: /download pdf/i }).click());
  });
  await step('[lab] Technician: Reports page lists the Insights PDF', async () => {
    await page.goto(`${base}/reports`);
    await expectText(page, /Lab insights/);
  });
  await page.context().close();

  page = await newPage();
  await signIn(page, base, /^LabManager/i);
  await step('[lab] Manager: CSV import checks first, then creates only the good row', async () => {
    await page.goto(`${base}/r/labs`);
    await page.getByRole('button', { name: /import csv/i }).click();
    const name = `E2E Lab ${Date.now()}`;
    const file = path.join(tmp, 'labs.csv');
    fs.writeFileSync(file, `Name,Building,Room\n${name},Annex,B-2\n,Nowhere,Z-9\n`);
    await page.getByLabel('CSV file').setInputFiles(file);
    await page.getByRole('button', { name: 'Check file' }).click();
    await expectText(page, /1 of 2 rows are ready/);
    await expectText(page, /Row 3/);
    await page.getByRole('button', { name: /^Import 1 row/ }).click();
    await expectText(page, /Imported 1 of 2/);
    await page.keyboard.press('Escape');
    await page.getByText(name).first().waitFor({ timeout: 8000 });
  });
  await page.context().close();

  page = await newPage({ width: 375, height: 800 });
  await signIn(page, base, /^Student/i);
  for (const [label, p] of [['dashboard', '/'], ['reservations', '/r/reservations'], ['new reservation', '/r/reservations/new'], ['scan page', '/scan/LL-0005'], ['equipment', '/r/equipment'], ['my checkouts', '/my-checkouts']]) {
    await step(`[lab] Mobile 375px: ${label} has no horizontal scroll`, async () => { await page.goto(`${base}${p}`); return noHorizontalScroll(page); });
  }
  await page.context().close();
}

// ═════════════ PANTRY GHOST ═════════════
if (run('pantry')) {
  const { base } = APPS.pantry;
  let page = await newPage();
  await signIn(page, base, /^Coordinator/i);

  await step('[pantry] Coordinator sidebar has Insights, Intake, Distribute and Impact', async () => {
    const l = (await links(page)).join('|');
    for (const need of ['Insights', 'Intake', 'Distribute', 'Impact report']) if (!l.includes(need)) throw new Error(`missing ${need}`);
  });
  await step('[pantry] Dashboard shows Use first and This month', async () => {
    await page.goto(`${base}/`);
    await expectText(page, /Use first/i, 10000);
    await expectText(page, /This month/i, 10000);
  });
  await step('[pantry] Bell: Email me a test sends a real message and warns about spam', async () => bellEmailTest(page, 'coordinator@pantry.test', 'Pantry Ghost'));
  await step('[pantry] Intake: a sentence becomes a draft, Save all stores the lot', async () => {
    await page.goto(`${base}/intake`);
    await page.getByPlaceholder(/e\.g\./).fill('twelve cans of black beans expiring March third from Fresh Mart');
    await page.locator('main button[type=submit]').click();
    await page.getByText(/black beans/i).first().waitFor({ timeout: 8000 });
    await page.waitForTimeout(500);
    const fields = await page.locator('main input, main select, main textarea').evaluateAll((els) => els.map((e) => `${e.value}`));
    const everything = `${await page.locator('main').innerText()} ${fields.join(' ')}`;
    if (!fields.includes('12')) throw new Error(`quantity 12 not in the draft: ${JSON.stringify(fields)}`);
    if (!/Fresh Mart/i.test(everything)) throw new Error('donor not matched');
    if (!/Canned/i.test(everything)) throw new Error('category not detected');
    await page.getByRole('button', { name: /save all/i }).click();
    await page.getByText('No drafts yet').waitFor({ timeout: 8000 });
    await page.goto(`${base}/r/stock-lots?q=black%20beans`);
    await page.getByText(/black beans/i).first().waitFor({ timeout: 8000 });
  });
  await step('[pantry] Distribute page loads with its household step', async () => {
    await page.goto(`${base}/distribute`);
    await page.waitForTimeout(1000);
    if (!/household/i.test(await page.locator('main').innerText())) throw new Error('no household step');
  });
  await step('[pantry] Impact report: preview and PDF', async () => {
    await page.goto(`${base}/impact`);
    await expectText(page, /received/i, 10000);
    return await downloadPdf(page, () => page.getByRole('button', { name: /generate pdf/i }).click());
  });
  await step('[pantry] Insights: stock table, donor waste, window change, PDF', async () => {
    await page.goto(`${base}/insights`);
    await expectText(page, 'Stock against minimum', 10000);
    await page.getByText('Waste by donor').first().waitFor();
    if ((await page.locator('tbody tr').count()) < 8) throw new Error('tables look empty');
    await page.getByLabel('Donor waste over').selectOption('365');
    await page.getByText('Waste by donor').first().waitFor();
    await page.waitForTimeout(600);
    return await downloadPdf(page, () => page.getByRole('button', { name: /download pdf/i }).click());
  });
  await step('[pantry] Donor receipt: preview count and PDF', async () => {
    await page.goto(`${base}/r/donors`);
    await page.waitForSelector('tbody tr');
    const hrefs = await page.locator('tbody tr td:first-child a').evaluateAll((els) => els.map((e) => e.getAttribute('href')));
    for (const h of hrefs) {
      await page.goto(`${base}${h}`);
      await expectText(page, 'Donation receipt', 8000);
      await page.waitForTimeout(900);
      const status = await page.getByRole('status').first().innerText().catch(() => '');
      if (/\d+ donations?, \d+ units/.test(status)) return `${status} :: ${await downloadPdf(page, () => page.getByRole('button', { name: /download receipt/i }).click())}`;
    }
    throw new Error('no donor had donations in the default period');
  });
  await step('[pantry] Stock: Export CSV', async () => {
    await page.goto(`${base}/r/stock-lots`);
    await page.waitForSelector('tbody tr');
    return await downloadCsv(page, () => page.getByRole('button', { name: /export csv/i }).click(), /Item,Category,Quantity/);
  });
  await step('[pantry] Voice agent answers a typed question', async () => {
    await page.goto(`${base}/voice`);
    const box = page.getByRole('textbox').first();
    await box.fill('what expires this week?');
    await box.press('Enter');
    await expectText(page, /expir/i, 15000);
  });
  await page.context().close();

  page = await newPage();
  await signIn(page, base, /^Volunteer/i);
  await step('[pantry] Volunteer sees Insights, Intake, Distribute but not Users, and opens Insights', async () => {
    const l = (await links(page)).join('|');
    for (const need of ['Insights', 'Intake', 'Distribute']) if (!l.includes(need)) throw new Error(`missing ${need}`);
    if (/Users/.test(l)) throw new Error('Users visible to a volunteer');
    await page.goto(`${base}/insights`);
    await expectText(page, 'Stock against minimum', 10000);
  });
  await page.context().close();

  page = await newPage();
  await signIn(page, base, /^Board/i);
  await step('[pantry] Board: sees Impact; no Insights, Donors, Households or Users; /insights is refused', async () => {
    const l = (await links(page)).join('|');
    if (!l.includes('Impact')) throw new Error('Impact missing');
    for (const bad of ['Insights', 'Donors', 'Households', 'Users']) if (l.includes(bad)) throw new Error(`${bad} visible to the board`);
    await page.goto(`${base}/insights`);
    await page.getByRole('alert').waitFor({ timeout: 10000 });
  });
  await step('[pantry] Board never sees a household code', async () => {
    for (const p of ['/', '/impact', '/r/stock-lots', '/r/households', '/r/distributions']) {
      await page.goto(`${base}${p}`);
      await page.waitForLoadState('networkidle').catch(() => {});
      await page.waitForTimeout(500);
      if (/H-\d{4}/.test(await page.locator('body').innerText())) throw new Error(`household code visible on ${p}`);
    }
  });
  await page.context().close();

  page = await newPage({ width: 375, height: 800 });
  await signIn(page, base, /^Volunteer/i);
  for (const [label, p] of [['dashboard', '/'], ['intake', '/intake'], ['insights', '/insights'], ['stock', '/r/stock-lots'], ['donors', '/r/donors']]) {
    await step(`[pantry] Mobile 375px: ${label} has no horizontal scroll`, async () => { await page.goto(`${base}${p}`); return noHorizontalScroll(page); });
  }
  await page.context().close();
}

// ═════════════ DIALOGS: position, size, closing ═════════════
async function checkDialog(page, label, open) {
  await step(`[dialog] ${label}`, async () => {
    await open();
    const dlg = page.getByRole('dialog').first();
    await dlg.waitFor({ timeout: 8000 });
    // Measure only after the opening animation has finished (on a busy machine it can take longer than its 0.2s).
    await dlg.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished.catch(() => {}))));
    await page.waitForTimeout(100);
    const b = await dlg.boundingBox();
    const view = page.viewportSize();
    const dx = Math.abs(b.x + b.width / 2 - view.width / 2);
    const dy = Math.abs(b.y + b.height / 2 - view.height / 2);
    const tall = b.height >= view.height * 0.88;
    const problems = [];
    if (dx > 2) problems.push(`off-centre horizontally by ${dx.toFixed(0)}px`);
    if (!tall && dy > 2) problems.push(`off-centre vertically by ${dy.toFixed(0)}px`);
    if (b.x < -0.5 || b.y < -0.5 || b.x + b.width > view.width + 0.5 || b.y + b.height > view.height + 0.5) problems.push('not fully on screen');
    await page.keyboard.press('Escape');
    await dlg.waitFor({ state: 'detached', timeout: 4000 }).catch(() => problems.push('did not close with Escape'));
    if (problems.length) throw new Error(problems.join('; '));
  });
}
if (run('dialogs')) {
  for (const vp of [{ name: 'desktop', width: 1440, height: 900 }, { name: 'mobile', width: 375, height: 700 }]) {
    for (const [app, cfg] of activeApps()) {
      const page = await newPage({ width: vp.width, height: vp.height });
      await signIn(page, cfg.base, cfg.admin);
      const tag = `${app} ${vp.name}`;
      const listPath = { skeleton: '/r/notes', lab: '/r/labs', pantry: '/r/donors' }[app];
      await checkDialog(page, `${tag}: Change password`, async () => { await page.goto(`${cfg.base}/`); await page.getByRole('button', { name: 'Change password' }).first().click(); });
      await checkDialog(page, `${tag}: Sign out confirm`, async () => { await page.goto(`${cfg.base}/`); await page.getByRole('button', { name: 'Sign out' }).first().click(); });
      await checkDialog(page, `${tag}: Invite user`, async () => { await page.goto(`${cfg.base}/users`); await page.getByRole('button', { name: /invite user/i }).click(); });
      await checkDialog(page, `${tag}: Import CSV`, async () => { await page.goto(`${cfg.base}${listPath}`); await page.getByRole('button', { name: /import csv/i }).click(); });
      const detail = async () => { await page.goto(`${cfg.base}${listPath}`); await page.goto(`${cfg.base}${await firstRecordHref(page)}`); await page.getByRole('button', { name: /^Edit$/ }).waitFor({ timeout: 10000 }); };
      await checkDialog(page, `${tag}: Edit record`, async () => { await detail(); await page.getByRole('button', { name: /^Edit$/ }).click(); });
      await checkDialog(page, `${tag}: Archive or delete confirm`, async () => { await detail(); await page.getByRole('button', { name: /^(Archive|Delete)$/ }).first().click(); });
      await page.context().close();
      if (app === 'lab') {
        const s = await newPage({ width: vp.width, height: vp.height });
        await signIn(s, cfg.base, /^Student/i);
        await checkDialog(s, `${tag}: Request checkout`, async () => { await s.goto(`${cfg.base}/scan/LL-0002`); await s.getByRole('button', { name: /request checkout/i }).click(); });
        await s.context().close();
        const t = await newPage({ width: vp.width, height: vp.height });
        await signIn(t, cfg.base, /^Technician/i);
        const co = async (status) => { await t.goto(`${cfg.base}/r/checkouts?status=${status}`); await t.goto(`${cfg.base}${await firstRecordHref(t, 'checkouts')}`); };
        await checkDialog(t, `${tag}: Reject request`, async () => { await co('Requested'); await t.getByRole('button', { name: /reject/i }).first().click(); });
        await checkDialog(t, `${tag}: Record return`, async () => { await co('Active'); await t.getByRole('button', { name: /(record )?return/i }).first().click(); });
        await t.context().close();
      }
    }
  }
}

// ═════════════ SWEEP: no "[object Object]" / "undefined" / "NaN" on any page ═════════════
if (run('sweep')) {
  const problems = [];
  let checked = 0;
  for (const vp of [{ n: 'desktop', width: 1440, height: 900 }, { n: 'mobile', width: 375, height: 800 }]) {
    for (const [app, cfg] of activeApps()) {
      const page = await newPage({ width: vp.width, height: vp.height });
      await signIn(page, cfg.admin ? cfg.base : cfg.base, cfg.admin);
      const token = await page.evaluate(() => localStorage.getItem('crypt_token'));
      const meta = await (await fetch(`${cfg.base}/api/meta`, { headers: { Authorization: `Bearer ${token}` } })).json();
      const scan = async (where) => {
        await page.waitForLoadState('networkidle').catch(() => {});
        await page.waitForTimeout(400);
        checked += 1;
        if ((await page.content()).includes('[object Object]')) problems.push(`${app} ${vp.n} ${where}: [object Object]`);
        if (/\bundefined\b|\bNaN\b/.test(await page.locator('body').innerText())) problems.push(`${app} ${vp.n} ${where}: "undefined"/"NaN"`);
      };
      for (const r of meta.resources) {
        await page.goto(`${cfg.base}/r/${r.key}`);
        await scan(`/r/${r.key}`);
        const href = await page.evaluate((k) => [...document.querySelectorAll('main a[href]')].map((a) => a.getAttribute('href')).find((h) => new RegExp(`/r/${k}/[0-9a-f]{24}$`).test(h)), r.key);
        if (href) {
          await page.goto(`${cfg.base}${href}`);
          await scan(`${r.key} detail`);
          const edit = page.getByRole('button', { name: /^Edit$/ });
          if (await edit.count()) { await edit.click(); await page.getByRole('dialog').waitFor().catch(() => {}); await scan(`${r.key} edit dialog`); await page.keyboard.press('Escape'); }
        }
      }
      for (const extra of ['/', '/reports', '/voice']) { await page.goto(`${cfg.base}${extra}`); await scan(extra); }
      await page.context().close();
    }
  }
  await step(`[sweep] ${checked} pages: no "[object Object]", "undefined" or "NaN"`, async () => { if (problems.length) throw new Error([...new Set(problems)].slice(0, 6).join(' | ')); });
}

// ═════════════ QR codes, short IDs, scan or find, label sheets (every app) ═════════════
// key = the resource with QR labels (client/src/qrCodes.js), code = its ID pattern.
const QR = {
  skeleton: { key: 'notes', code: /^N-\d{4}$/, viewer: /^Viewer/i },
  lab: { key: 'equipment', code: /^LL-\d{4}$/, viewer: /^Student/i, labScan: true },
  pantry: { key: 'stock-lots', code: /^SL-\d{4}$/, viewer: /^Volunteer/i },
};
// The shared page redirects to the record; Lab Ledger's /scan/<tag> shows the equipment in place.
const SCAN_UI = {
  shared: { field: 'ID or link', button: 'Find', unknown: /has the ID ZZ-9999/, foreign: /is not for .* It links to another website/ },
  lab: { field: 'Asset tag or link', button: 'Look up', unknown: /No equipment haunts this tag/, foreign: /No equipment haunts this tag/ },
};
async function opened(page, q, item, code, timeout = 15000) {
  if (!q.labScan) { await page.waitForURL((u) => u.pathname === `/r/${q.key}/${item._id}`, { timeout }); return; }
  await page.waitForURL((u) => decodeURIComponent(u.pathname) === `/scan/${code}`, { timeout });
  await page.getByText(item.name, { exact: true }).first().waitFor({ timeout });
}
if (run('qr')) {
  for (const [app, cfg] of activeApps()) {
    const q = QR[app];
    const tag = `[qr ${app}]`;
    const page = await newPage();
    await signIn(page, cfg.base, cfg.admin);
    const token = await page.evaluate(() => localStorage.getItem('crypt_token'));
    const api = async (p) => (await fetch(`${cfg.base}/api${p}`, { headers: { Authorization: `Bearer ${token}` } })).json();
    const first = (await api(`/r/${q.key}?limit=1`)).items[0];
    const idField = Object.keys(first).find((k) => typeof first[k] === 'string' && q.code.test(first[k]));
    const code = first[idField];
    let png = null;

    await step(`${tag} Every ${q.key} record has a short ID like ${code}`, async () => {
      const all = await api(`/r/${q.key}?limit=100`);
      const missing = all.items.filter((i) => !q.code.test(i[idField] ?? ''));
      if (missing.length) throw new Error(`${missing.length} of ${all.items.length} have no ID`);
      const ids = new Set(all.items.map((i) => i[idField]));
      if (ids.size !== all.items.length) throw new Error('IDs are not unique');
      return `${all.items.length} records`;
    });
    await step(`${tag} Detail page shows a QR card with the ID and a working PNG download`, async () => {
      await page.goto(`${cfg.base}/r/${q.key}/${first._id}`);
      await page.getByRole('img', { name: /^QR code for / }).waitFor({ timeout: 15000 });
      await page.getByText(code, { exact: true }).first().waitFor({ timeout: 5000 });
      const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.getByRole('button', { name: 'Download' }).click()]);
      png = path.join(tmp, `${app}-qr.png`);
      await dl.saveAs(png);
      const head = fs.readFileSync(png).subarray(1, 4).toString();
      if (head !== 'PNG') throw new Error('download is not a PNG');
      return dl.suggestedFilename();
    });
    await step(`${tag} Print label opens a print page with the QR and ID`, async () => {
      const [pop] = await Promise.all([page.waitForEvent('popup', { timeout: 10000 }), page.getByRole('button', { name: 'Print label' }).click()]);
      await pop.waitForLoadState().catch(() => {});
      const html = await pop.content();
      await pop.close();
      if (!html.includes('<svg') || !html.includes(code)) throw new Error('label has no QR or no ID');
    });
    const ui = q.labScan ? SCAN_UI.lab : SCAN_UI.shared;
    await step(`${tag} Scan page: typing ${code.toLowerCase()} opens the item`, async () => {
      await page.goto(`${cfg.base}/scan`);
      await page.getByLabel(ui.field).fill(code.toLowerCase());
      await page.getByRole('button', { name: ui.button }).click();
      await opened(page, q, first, code);
    });
    await step(`${tag} The link inside the QR (/scan/${code}) opens the item`, async () => {
      await page.goto(`${cfg.base}/scan/${code}`);
      await opened(page, q, first, code);
    });
    await step(`${tag} Scanning a photo of the downloaded QR opens the item`, async () => {
      if (!png) throw new Error('no PNG from the earlier step');
      await page.goto(`${cfg.base}/scan`);
      await page.getByTestId('qr-photo-input').setInputFiles(png);
      await opened(page, q, first, code, 20000);
    });
    await step(`${tag} Unknown ID and a foreign link are reported, not followed`, async () => {
      await page.goto(`${cfg.base}/scan`);
      await page.getByLabel(ui.field).fill('ZZ-9999');
      await page.getByRole('button', { name: ui.button }).click();
      await expectText(page, ui.unknown);
      await page.goto(`${cfg.base}/scan`);
      await page.getByLabel(ui.field).fill('https://evil.example/phish');
      await page.getByRole('button', { name: ui.button }).click();
      await expectText(page, ui.foreign);
      if (!page.url().startsWith(cfg.base)) throw new Error('left the site');
    });
    await step(`${tag} Bulk labels: select 3 rows, get one sheet with each ID`, async () => {
      await page.goto(`${cfg.base}/r/${q.key}`);
      const boxes = page.locator('main tbody input[type="checkbox"], main tbody [role="checkbox"]');
      await boxes.first().waitFor({ timeout: 15000 });
      for (let i = 0; i < 3; i++) await boxes.nth(i).click();
      if (q.labScan) return downloadPdf(page, () => page.getByRole('button', { name: /^print labels$/i }).click());
      const [pop] = await Promise.all([page.waitForEvent('popup', { timeout: 10000 }), page.getByRole('button', { name: /print qr labels/i }).click()]);
      await pop.waitForLoadState().catch(() => {});
      const html = await pop.content();
      await pop.close();
      const svgs = (html.match(/<svg/g) ?? []).length;
      const codes = new Set(html.match(new RegExp(q.code.source.slice(1, -1), 'g')) ?? []);
      if (svgs !== 3 || codes.size !== 3) throw new Error(`sheet has ${svgs} QR codes and ${codes.size} IDs`);
    });
    await page.context().close();

    const guest = await newPage();
    await step(`${tag} Signed out, the QR link asks to sign in, then opens the item`, async () => {
      await guest.goto(`${cfg.base}/scan/${code}`);
      await guest.waitForURL(/\/login/, { timeout: 15000 });
      await guest.getByRole('button', { name: q.viewer }).first().click();
      await opened(guest, q, first, code, 20000);
    });
    await guest.context().close();
  }
}

// ═════════════ summary ═════════════
await browser.close();
const bad = results.filter((r) => !r.ok);
await step('No browser console errors or uncaught exceptions', async () => { if (consoleErrors.length) throw new Error([...new Set(consoleErrors)].slice(0, 3).join(' | ')); });
const failed = results.filter((r) => !r.ok);
console.log(`\nE2E RESULT: ${results.length - failed.length}/${results.length} passed${failed.length ? `; failed: ${failed.map((f) => f.name).join(' ; ')}` : ''}`);
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(failed.length ? 1 : 0);
