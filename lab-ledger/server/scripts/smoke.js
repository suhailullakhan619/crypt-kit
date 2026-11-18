/**
 * Lab Ledger boot smoke test: starts src/server.js in DEMO_MODE as a child process, runs HTTP checks
 * over the seeded demo data, then stops ONLY that child.
 *
 *   SMOKE_PORT=5061 npm run smoke
 */
import { spawn } from 'node:child_process';
import http from 'node:http';

const PORT = Number(process.env.SMOKE_PORT ?? 5061);
const base = `http://127.0.0.1:${PORT}/api`;
const DAY = 86400000;
const child = spawn(process.execPath, ['src/server.js'], {
  env: { ...process.env, DEMO_MODE: 'true', PORT: String(PORT), OPENAI_API_KEY: '', VOICE_PROVIDER: '', CLIENT_URL: 'http://localhost:5173' },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let log = '';
child.stdout.on('data', (d) => { log += d; });
child.stderr.on('data', (d) => { log += d; });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);

/**
 * node:http rather than fetch: fetch (undici) refuses "bad ports" from the Fetch spec, and 5061
 * (SIP over TLS) is one of them.
 */
function send(method, path, { body, token } = {}) {
  const payload = typeof body === 'string' ? body : body ? JSON.stringify(body) : undefined;
  return new Promise((resolve, reject) => {
    const req = http.request(base + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, type: res.headers['content-type'] ?? '', bytes: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function call(method, path, opts) {
  const res = await send(method, path, opts);
  let json = null;
  try { json = JSON.parse(res.bytes.toString('utf8')); } catch { /* not json */ }
  return { status: res.status, json };
}

async function pdf(method, path, opts) {
  const res = await send(method, path, opts);
  return { ...res, type: res.type.split(';')[0], isPdf: res.bytes.subarray(0, 4).toString() === '%PDF' };
}

const inDays = (n) => new Date(Date.now() + n * DAY).toISOString();

try {
  const started = Date.now();
  while (!/listening/.test(log)) {
    if (/Failed|error/i.test(log) || child.exitCode !== null) throw new Error('server failed to start');
    if (Date.now() - started > 240_000) throw new Error('timed out waiting for server');
    await sleep(500);
  }

  // ── Boot + auth ─────────────────────────────────────────────────────────────
  const health = await call('GET', '/health');
  check('GET /health', health.status === 200 && health.json.demo === true && health.json.app === 'Lab Ledger', JSON.stringify(health.json));

  const tok = {};
  for (const [who, email, password, role] of [
    ['manager', 'manager@lab.test', 'lab-manager-demo', 'LabManager'],
    ['tech', 'tech@lab.test', 'lab-tech-demo', 'Technician'],
    ['student', 'student@lab.test', 'lab-student-demo', 'Student'],
  ]) {
    const res = await call('POST', '/auth/login', { body: { email, password } });
    tok[who] = res.json?.token;
    check(`login ${role}`, res.status === 200 && res.json.user?.role === role);
  }
  const bad = await call('POST', '/auth/login', { body: { email: 'student@lab.test', password: 'wrong-password' } });
  check('wrong password → 401', bad.status === 401);

  const meta = await call('GET', '/meta', { token: tok.student });
  const keys = (meta.json?.resources ?? []).map((r) => r.key).sort().join(',');
  check('meta: lab resources (no notes)', keys === 'calibrations,checkouts,equipment,labs,reservations', keys);

  // ── Equipment CRUD permissions ──────────────────────────────────────────────
  check('student creates equipment → 403', (await call('POST', '/r/equipment', { token: tok.student, body: { name: 'X', assetTag: 'SMK-1' } })).status === 403);
  check('technician creates equipment → 403', (await call('POST', '/r/equipment', { token: tok.tech, body: { name: 'X', assetTag: 'SMK-1' } })).status === 403);
  const made = await call('POST', '/r/equipment', { token: tok.manager, body: { name: 'Smoke Detector Tester', assetTag: 'smk-0001', category: 'Safety' } });
  check('manager creates equipment → 201 (tag upper-cased)', made.status === 201 && made.json.item.assetTag === 'SMK-0001');
  const smkId = made.json?.item?._id;
  check('technician updates equipment → 200', (await call('PATCH', `/r/equipment/${smkId}`, { token: tok.tech, body: { notes: 'Battery swapped' } })).status === 200);
  check('technician deletes equipment → 403', (await call('DELETE', `/r/equipment/${smkId}`, { token: tok.tech })).status === 403);
  const retired = await call('DELETE', `/r/equipment/${smkId}`, { token: tok.manager });
  check('manager deletes → Retired (soft delete)', retired.status === 200 && retired.json.item.status === 'Retired');
  check('student generic POST /r/checkouts → 403', (await call('POST', '/r/checkouts', { token: tok.student, body: {} })).status === 403);

  // ── Checkout workflow ───────────────────────────────────────────────────────
  const hm = await call('GET', '/equipment/by-tag/LL-0005', { token: tok.student });
  const hmId = hm.json?.item?._id;
  check('by-tag LL-0005 (Handheld Multimeter)', hm.status === 200 && hm.json.item.name === 'Handheld Multimeter' && hm.json.item.status === 'Available');

  check('dueBack > 30 days → 400', (await call('POST', '/checkouts', { token: tok.student, body: { equipmentId: hmId, dueBack: inDays(40) } })).status === 400);
  const req = await call('POST', '/checkouts', { token: tok.student, body: { equipmentId: hmId, dueBack: inDays(5), purpose: 'Smoke test' } });
  check('student requests → 201 Requested', req.status === 201 && req.json.checkout.status === 'Requested');
  const coId = req.json?.checkout?._id;
  check('student cannot approve → 403', (await call('POST', `/checkouts/${coId}/approve`, { token: tok.student })).status === 403);
  const ap = await call('POST', `/checkouts/${coId}/approve`, { token: tok.tech });
  check('technician approves → Active', ap.status === 200 && ap.json.checkout.status === 'Active');
  const ap2 = await call('POST', `/checkouts/${coId}/approve`, { token: tok.manager });
  check('double approval → 409', ap2.status === 409, ap2.json?.error);
  const forged = await call('PATCH', `/r/equipment/${hmId}`, { token: tok.manager, body: { status: 'Available' } });
  check('workflowOnly: PATCH out of CheckedOut → 409', forged.status === 409, forged.json?.error);
  const out = await call('GET', '/equipment/by-tag/ll-0005', { token: tok.student });
  check('by-tag shows borrower while out', out.json?.item?.status === 'CheckedOut' && out.json?.activeCheckout?.borrower?.name === 'Priya Student');
  const ret = await call('POST', `/checkouts/${coId}/return`, { token: tok.tech, body: { condition: 'Good' } });
  const back = await call('GET', '/equipment/by-tag/LL-0005', { token: tok.student });
  check('return → Returned, equipment Available', ret.status === 200 && ret.json.checkout.status === 'Returned' && back.json?.item?.status === 'Available');

  // Two different requests for the same item, approved concurrently: exactly one wins.
  const r1 = await call('POST', '/checkouts', { token: tok.student, body: { equipmentId: hmId, dueBack: inDays(3) } });
  const r2 = await call('POST', '/checkouts', { token: tok.tech, body: { equipmentId: hmId, dueBack: inDays(4) } });
  const race = await Promise.all([r1, r2].map((r) => call('POST', `/checkouts/${r.json?.checkout?._id}/approve`, { token: tok.manager })));
  check('concurrent approvals → one 200, one 409', race.map((r) => r.status).sort().join(',') === '200,409', race.map((r) => r.status).join(','));
  const loser = race[0].status === 409 ? r1 : r2;
  const strangerCancel = await call('POST', `/checkouts/${r2.json?.checkout?._id}/cancel`, { token: tok.student });
  check('student cannot cancel another user’s request → 403', strangerCancel.status === 403, strangerCancel.json?.error);
  const rej = await call('POST', `/checkouts/${loser.json?.checkout?._id}/reject`, { token: tok.tech, body: { reason: 'Already out' } });
  check('reject with reason → Rejected', rej.status === 200 && rej.json.checkout.status === 'Rejected');

  const mine = await call('GET', '/checkouts/mine', { token: tok.student });
  check('GET /checkouts/mine', mine.status === 200 && mine.json.total >= 1, `total=${mine.json?.total}`);

  // ── Calibration scheduling ──────────────────────────────────────────────────
  const bal = await call('GET', '/equipment/by-tag/LL-0028', { token: tok.tech });
  check('LL-0028 Analytical Balance is CalibrationDue', bal.json?.item?.status === 'CalibrationDue', bal.json?.item?.status);
  const performedAt = new Date(Date.now() - DAY).toISOString();
  const cal = await call('POST', '/r/calibrations', { token: tok.tech, body: { equipment: bal.json?.item?._id, performedAt, result: 'Pass', certificateNo: 'CAL-SMOKE' } });
  const bal2 = await call('GET', '/equipment/by-tag/LL-0028', { token: tok.tech });
  const expectedNext = new Date(new Date(performedAt).getTime() + 180 * DAY).toISOString();
  check('calibration → Available + nextCalibration scheduled', cal.status === 201 && bal2.json?.item?.status === 'Available' && bal2.json?.item?.nextCalibration === expectedNext, bal2.json?.item?.nextCalibration);
  check('future calibration → 400', (await call('POST', '/r/calibrations', { token: tok.tech, body: { equipment: bal.json?.item?._id, performedAt: inDays(2) } })).status === 400);
  check('student logs calibration → 403', (await call('POST', '/r/calibrations', { token: tok.student, body: { equipment: bal.json?.item?._id, performedAt } })).status === 403);

  // ── Labels + scan ───────────────────────────────────────────────────────────
  const eqList = await call('GET', '/r/equipment?limit=30', { token: tok.tech });
  const labels = await pdf('POST', '/equipment/labels', { token: tok.tech, body: { ids: eqList.json.items.map((e) => e._id) } });
  check('labels PDF (30 items)', labels.status === 200 && labels.type === 'application/pdf' && labels.isPdf, `${labels.bytes.length} bytes`);
  check('student labels → 403', (await call('POST', '/equipment/labels', { token: tok.student, body: { ids: [hmId] } })).status === 403);
  const ghost = await call('GET', '/equipment/by-tag/NOPE-404', { token: tok.student });
  check('unknown tag → 404 "No equipment haunts this tag"', ghost.status === 404 && ghost.json.error === 'No equipment haunts this tag');

  // ── Voice ───────────────────────────────────────────────────────────────────
  const who = await call('POST', '/voice/ask', { token: tok.tech, body: { text: 'Who has the oscilloscope?' } });
  check('voice WHO_HAS', who.json?.intent === 'WHO_HAS' && /Priya Student has the Digital Oscilloscope/.test(who.json.answer), who.json?.answer);
  const calDue = await call('POST', '/voice/ask', { token: tok.tech, body: { text: 'What needs calibration this month?' } });
  check('voice CALIBRATION_DUE', calDue.json?.intent === 'CALIBRATION_DUE' && calDue.json.data.count >= 1, calDue.json?.answer);
  const late = await call('POST', '/voice/ask', { token: tok.student, body: { text: 'Which items are overdue?' } });
  check('voice OVERDUE_RETURNS (student: count only)', late.json?.intent === 'OVERDUE_RETURNS' && /^2 items are overdue\.$/.test(late.json.answer), late.json?.answer);

  // ── Reports ─────────────────────────────────────────────────────────────────
  const audit = await call('POST', '/reports', { token: tok.manager, body: { resource: 'equipment', filters: { requiresCalibration: 'true' }, title: 'Calibration Audit' } });
  check('calibration audit report generated', audit.status === 201 && audit.json.report.count >= 10, `count=${audit.json?.report?.count}`);
  const dl = await pdf('GET', `/reports/${audit.json?.report?._id}/download`, { token: tok.manager });
  check('calibration audit PDF downloads', dl.status === 200 && dl.isPdf, `${dl.bytes.length} bytes`);

  // ── Dashboard ───────────────────────────────────────────────────────────────
  const dash = await call('GET', '/dashboard', { token: tok.student });
  const panel = dash.json?.panels?.find((p) => p.key === 'outNow');
  check('dashboard outNow panel', dash.status === 200 && panel?.title === 'Out right now' && panel.data.total >= 5 && panel.data.overdue === 2 && panel.data.rows[0].overdue === true,
    JSON.stringify({ total: panel?.data?.total, overdue: panel?.data?.overdue }));
  const eqStats = dash.json?.resources?.find((r) => r.key === 'equipment');
  check('dashboard equipment stats', eqStats?.total === 39 && eqStats.hasDue, `total=${eqStats?.total}`);
} catch (err) {
  check('smoke run', false, `${err.message}${err.cause ? ` (${err.cause.code ?? err.cause.message})` : ''}`);
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
