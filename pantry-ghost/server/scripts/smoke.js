/**
 * Boot smoke test: starts src/server.js in DEMO_MODE as a child process, runs the Pantry Ghost
 * demo path over HTTP, then stops ONLY that child. Usage: SMOKE_PORT=5062 node scripts/smoke.js
 */
import { spawn } from 'node:child_process';

const PORT = Number(process.env.SMOKE_PORT ?? 5062);
const base = `http://localhost:${PORT}/api`;
const child = spawn(process.execPath, ['src/server.js'], {
  env: { ...process.env, DEMO_MODE: 'true', PORT: String(PORT), OPENAI_API_KEY: '', VOICE_PROVIDER: '' },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let log = '';
child.stdout.on('data', (d) => { log += d; });
child.stderr.on('data', (d) => { log += d; });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
const CODE = /H-\d{4}/;

async function call(method, path, { body, token } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: typeof body === 'string' ? body : body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* not json */ }
  return { status: res.status, json };
}

try {
  const started = Date.now();
  while (!/listening/.test(log)) {
    if (/Failed to start|✖/.test(log) || child.exitCode !== null) throw new Error('server failed to start');
    if (Date.now() - started > 240_000) throw new Error('timed out waiting for server');
    await sleep(500);
  }

  const health = await call('GET', '/health');
  check('GET /health', health.status === 200 && health.json.demo === true);
  const seeded = Object.fromEntries([...((log.match(/Seeded: (.*)/) ?? [])[1] ?? '').matchAll(/([\w-]+)=(\d+)/g)].map(([, k, n]) => [k, Number(n)]));
  check('seeded 12 donors, 120 lots, 45 households, 150 distributions',
    seeded.donors === 12 && seeded['stock-lots'] === 120 && seeded.households === 45 && seeded.distributions === 150, JSON.stringify(seeded));
  check('expiry job ran at boot', /classify-expiry: \{"checked":\d+,"changed":0/.test(log), (log.match(/classify-expiry: .*/) ?? [''])[0]);

  // ── login per role ─────────────────────────────────────────────────────────
  const t = {};
  for (const [role, email, password] of [
    ['Coordinator', 'coordinator@pantry.test', 'pantry-coordinator-demo'],
    ['Volunteer', 'volunteer@pantry.test', 'pantry-volunteer-demo'],
    ['Board', 'board@pantry.test', 'pantry-board-demo'],
  ]) {
    const r = await call('POST', '/auth/login', { body: { email, password } });
    check(`${role} login`, r.status === 200 && r.json.user.role === role);
    t[role] = r.json?.token;
  }
  const bad = await call('POST', '/auth/login', { body: { email: 'board@pantry.test', password: 'wrong' } });
  check('wrong password → 401', bad.status === 401);

  // ── privacy ────────────────────────────────────────────────────────────────
  const boardMeta = await call('GET', '/meta', { token: t.Board });
  check('Board meta: stock only, no households', boardMeta.status === 200 && boardMeta.json.resources.map((r) => r.key).join() === 'stock-lots' && !CODE.test(JSON.stringify(boardMeta.json)));
  check('Board GET /r/households → 403', (await call('GET', '/r/households', { token: t.Board })).status === 403);
  check('Board GET /r/distributions → 403', (await call('GET', '/r/distributions', { token: t.Board })).status === 403);
  const hhList = await call('GET', '/r/households?limit=5', { token: t.Volunteer });
  check('Volunteer lists households (codes only)', hhList.status === 200 && hhList.json.total === 45 && Object.keys(hhList.json.items[0]).every((k) => ['_id', '__v', 'code', 'size', 'dietary', 'createdBy', 'createdAt', 'updatedAt'].includes(k)));

  // ── intake: parse → save ───────────────────────────────────────────────────
  const parsed = await call('POST', '/intake/parse', { token: t.Volunteer, body: { text: 'add twelve cans of black beans expiring March 3rd from Fresh Mart' } });
  const draft = parsed.json?.draft;
  check('intake parse → draft', parsed.status === 200 && draft.quantity === 12 && draft.unit === 'can' && draft.category === 'Canned' && draft.donorName === 'Fresh Mart' && draft.missing.length === 0, JSON.stringify(draft)?.slice(0, 160));
  const saved = await call('POST', '/intake', { token: t.Volunteer, body: { lots: [draft] } });
  check('intake save → 201', saved.status === 201 && saved.json.items[0].status === 'Fresh' && saved.json.items[0].donor?.name === 'Fresh Mart');
  check('Board cannot intake → 403', (await call('POST', '/intake', { token: t.Board, body: { lots: [draft] } })).status === 403);

  // ── FEFO: household → plan → commit, 409 shortfall ─────────────────────────
  const hh = await call('POST', '/r/households', { token: t.Volunteer, body: { size: 3, dietary: ['Halal'], name: 'not stored', phone: '555' } });
  check('new household gets a code and no PII', hh.status === 201 && /^H-\d{4}$/.test(hh.json.item.code) && hh.json.item.name === undefined && hh.json.item.phone === undefined, hh.json?.item?.code);
  const householdId = hh.json?.item?._id;
  const plan = await call('POST', '/distributions/plan', { token: t.Volunteer, body: { householdId, items: [{ category: 'Canned', quantity: 6 }, { category: 'Dry', quantity: 2 }] } });
  const lines = (plan.json?.lines ?? []).map(({ lotId, quantity }) => ({ lotId, quantity }));
  check('FEFO plan', plan.status === 200 && lines.reduce((s, l) => s + l.quantity, 0) === 8 && plan.json.shortfalls.length === 0, plan.json?.lines?.map((l) => `${l.quantity} ${l.itemName} @${l.location}`).join(', '));

  const firstLot = await call('GET', `/r/stock-lots/${lines[0]?.lotId}`, { token: t.Volunteer });
  const commit = await call('POST', '/distributions', { token: t.Volunteer, body: { householdId, lines } });
  check('commit → 201', commit.status === 201 && commit.json.distribution.totalUnits === 8, commit.json?.distribution?.summary);
  const firstAfter = await call('GET', `/r/stock-lots/${lines[0]?.lotId}`, { token: t.Volunteer });
  const taken0 = lines.filter((l) => l.lotId === lines[0]?.lotId).reduce((s, l) => s + l.quantity, 0);
  check('stock decremented', firstAfter.json?.item?.quantity === firstLot.json?.item?.quantity - taken0, `${firstLot.json?.item?.quantity} → ${firstAfter.json?.item?.quantity}`);

  const greedy = await call('POST', '/distributions', { token: t.Volunteer, body: { householdId, lines: [{ lotId: lines[0]?.lotId, quantity: 999 }] } });
  const unchanged = await call('GET', `/r/stock-lots/${lines[0]?.lotId}`, { token: t.Volunteer });
  check('shortfall → 409 with short lines, no stock change', greedy.status === 409 && greedy.json.short?.length === 1 && unchanged.json.item.quantity === firstAfter.json.item.quantity, greedy.json?.error);
  check('generic distribution create disabled (even Coordinator) → 405', (await call('POST', '/r/distributions', { token: t.Coordinator, body: { household: householdId } })).status === 405);

  // ── expiry effect on seeded data ───────────────────────────────────────────
  const expired = await call('GET', '/r/stock-lots?status=Expired&limit=1', { token: t.Board });
  const soon = await call('GET', '/r/stock-lots?status=ExpiringSoon&limit=1', { token: t.Board });
  check('seeded lots classified (Expired + ExpiringSoon present)', expired.json?.total > 0 && soon.json?.total > 0, `expired=${expired.json?.total} soon=${soon.json?.total}`);

  // ── voice ──────────────────────────────────────────────────────────────────
  const before = (await call('GET', '/r/stock-lots?limit=1', { token: t.Volunteer })).json?.total;
  const vi = await call('POST', '/voice/ask', { token: t.Volunteer, body: { text: 'log 3 kilos of apples expiring tomorrow from green valley farm' } });
  const after = (await call('GET', '/r/stock-lots?limit=1', { token: t.Volunteer })).json?.total;
  check('voice INTAKE → draft only, nothing saved', vi.json?.intent === 'INTAKE' && vi.json.data.draft.quantity === 3 && before === after, vi.json?.answer);
  const ve = await call('POST', '/voice/ask', { token: t.Board, body: { text: 'What expires this week?' } });
  check('voice EXPIRING_THIS_WEEK (Board)', ve.json?.intent === 'EXPIRING_THIS_WEEK' && ve.json.data.count > 0, ve.json?.answer);
  const vh = await call('POST', '/voice/ask', { token: t.Board, body: { text: 'How many households did we serve this month?' } });
  check('voice HOUSEHOLDS_SERVED as Board (aggregate only)', vh.json?.intent === 'HOUSEHOLDS_SERVED' && vh.json.data.households > 0 && !CODE.test(JSON.stringify(vh.json)), vh.json?.answer);
  const vs = await call('POST', '/voice/ask', { token: t.Board, body: { text: 'How much canned food do we have?' } });
  check('voice STOCK_OF', vs.json?.intent === 'STOCK_OF' && vs.json.data.lots > 0, vs.json?.answer);

  // ── dashboard ──────────────────────────────────────────────────────────────
  const dash = await call('GET', '/dashboard', { token: t.Board });
  const keys = (dash.json?.panels ?? []).map((p) => p.key);
  check('dashboard panels useFirst + thisMonth', dash.status === 200 && keys.includes('useFirst') && keys.includes('thisMonth') && !CODE.test(JSON.stringify(dash.json)), keys.join(','));

  // ── impact report ──────────────────────────────────────────────────────────
  const month = new Date().toISOString().slice(0, 7);
  const prev = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
  check('Volunteer cannot generate impact → 403', (await call('POST', '/reports/impact', { token: t.Volunteer, body: { month } })).status === 403);
  const rep = await call('POST', '/reports/impact', { token: t.Board, body: { month: prev } });
  check('impact report generated (Board, last month)', rep.status === 201 && /^Impact — /.test(rep.json.report.title), `${rep.json?.report?.title} · ${rep.json?.report?.count} distributions`);
  const listed = await call('GET', '/reports', { token: t.Coordinator });
  check('impact report listed with the other reports', listed.json?.items?.some((r) => r._id === rep.json?.report?._id));
  const dl = await fetch(`${base}/reports/${rep.json?.report?._id}/download`, { headers: { Authorization: `Bearer ${t.Coordinator}` } });
  const bytes = Buffer.from(await dl.arrayBuffer());
  check('impact PDF downloadable', dl.status === 200 && bytes.subarray(0, 4).toString() === '%PDF', `${bytes.length} bytes`);
} catch (err) {
  check('smoke run', false, err.message);
} finally {
  child.kill();
  console.log(results.join('\n'));
  const failed = results.filter((r) => r.startsWith('FAIL')).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  if (failed) {
    console.log('\n--- server log ---\n' + log);
    process.exitCode = 1;
  }
}
