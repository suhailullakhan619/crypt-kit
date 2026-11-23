/**
 * Boot smoke test: starts src/server.js in DEMO_MODE as a child process, runs a few
 * HTTP checks, then stops ONLY that child. Usage: node scripts/smoke.js
 */
import { spawn } from 'node:child_process';

const PORT = Number(process.env.SMOKE_PORT ?? 5055);
const base = `http://localhost:${PORT}/api`;
const child = spawn(process.execPath, ['src/server.js'], {
  env: { ...process.env, DEMO_MODE: 'true', PORT: String(PORT), VOICE_PROVIDER: '' },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let log = '';
child.stdout.on('data', (d) => { log += d; });
child.stderr.on('data', (d) => { log += d; });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);

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
    if (/Failed|error/i.test(log) || child.exitCode !== null) throw new Error('server failed to start');
    if (Date.now() - started > 240_000) throw new Error('timed out waiting for server');
    await sleep(500);
  }

  const health = await call('GET', '/health');
  check('GET /health', health.status === 200 && health.json.demo === true, JSON.stringify(health.json));

  const admin = await call('POST', '/auth/login', { body: { email: 'admin@crypt.test', password: 'crypt-admin-demo' } });
  check('admin login', admin.status === 200 && !!admin.json.token);

  const me = await call('GET', '/auth/me', { token: admin.json?.token });
  check('GET /auth/me', me.status === 200 && me.json.user.role === 'Admin' && !('passwordHash' in me.json.user));

  const users = await call('GET', '/users', { token: admin.json?.token });
  // 3 demo users, plus the owner when SEED_ADMIN_EMAIL is set in server/.env.
  check('admin lists users', users.status === 200 && [3, 4].includes(users.json.total), `total=${users.json?.total}`);

  const bad = await call('POST', '/auth/login', { body: { email: 'admin@crypt.test', password: 'wrong' } });
  check('wrong password → 401', bad.status === 401);

  const malformed = await call('POST', '/auth/login', { body: '{bad json' });
  check('malformed JSON → 400', malformed.status === 400, JSON.stringify(malformed.json));

  const viewer = await call('POST', '/auth/login', { body: { email: 'viewer@crypt.test', password: 'crypt-viewer-demo' } });
  const forbidden = await call('GET', '/users', { token: viewer.json?.token });
  check('viewer cannot list users → 403', forbidden.status === 403);

  const dup = await call('POST', '/users', { token: admin.json?.token, body: { name: 'X', email: 'viewer@crypt.test', password: 'longenough', role: 'Viewer' } });
  check('duplicate email → 409', dup.status === 409);

  const badRole = await call('POST', '/users', { token: admin.json?.token, body: { name: 'X', email: 'new@crypt.test', password: 'longenough', role: 'Vampire' } });
  check('unknown role → 400', badRole.status === 400 && !!badRole.json.fields?.role);

  // ── Generic resource API (checkpoint 7) ────────────────────────────────────
  const member = await call('POST', '/auth/demo-login', { body: { email: 'member@crypt.test' } });
  check('demo-login (member)', member.status === 200 && member.json.user.role === 'Member');
  const mt = member.json?.token;
  const vt = viewer.json?.token;

  const meta = await call('GET', '/meta', { token: vt });
  const notesMeta = meta.json?.resources?.find((r) => r.key === 'notes');
  check('viewer meta: notes readable, not creatable', !!notesMeta && notesMeta.permissions.read && !notesMeta.permissions.create);

  const created = await call('POST', '/r/notes', { token: mt, body: { title: 'Brew potion', priority: 'High', tags: ['Potion'], createdBy: 'hax', dueDate: '2020-01-01' } });
  check('member creates note → 201', created.status === 201 && created.json.item.title === 'Brew potion', JSON.stringify(created.json).slice(0, 120));
  const id = created.json?.item?._id;
  check('createdBy is the member, not the body', created.json?.item?.createdBy?.name === 'Igor Member');

  const viewerCreate = await call('POST', '/r/notes', { token: vt, body: { title: 'x' } });
  check('viewer create → 403', viewerCreate.status === 403);

  const invalid = await call('POST', '/r/notes', { token: mt, body: { priority: 'Apocalyptic' } });
  check('invalid body → 400 with fields', invalid.status === 400 && !!invalid.json.fields?.title && !!invalid.json.fields?.priority, JSON.stringify(invalid.json));

  const list = await call('GET', '/r/notes?q=brew&priority=High', { token: vt });
  check('list with search + filter', list.status === 200 && list.json.total === 1, 'total=' + list.json?.total);

  const badFilter = await call('GET', '/r/notes?priority=Apocalyptic', { token: vt });
  check('bad enum filter → 400', badFilter.status === 400);

  const done = await call('PATCH', `/r/notes/${id}`, { token: mt, body: { status: 'Done' } });
  check('Open → Done allowed', done.status === 200 && done.json.item.status === 'Done');

  const illegal = await call('PATCH', `/r/notes/${id}`, { token: mt, body: { status: 'Overdue' } });
  check('Done → Overdue → 409', illegal.status === 409, illegal.json?.error);

  const memberDelete = await call('DELETE', `/r/notes/${id}`, { token: mt });
  check('member delete (not permitted) → 403', memberDelete.status === 403);

  const del = await call('DELETE', `/r/notes/${id}`, { token: admin.json?.token });
  check('admin soft-deletes → Archived', del.status === 200 && del.json.item.status === 'Archived' && !!del.json.item.archivedAt);

  const after = await call('GET', '/r/notes', { token: vt });
  check('archived note hidden from list', after.status === 200 && !after.json.items.some((n) => n._id === id), 'total=' + after.json?.total);

  const act = await call('GET', `/r/notes/${id}/activity`, { token: vt });
  const actions = (act.json?.items ?? []).map((e) => e.action).join(',');
  check('activity timeline newest first', actions === 'delete,status,update,create', actions);

  const unknown = await call('GET', '/r/ghosts', { token: vt });
  check('unknown resource → 404', unknown.status === 404);

  const badId = await call('GET', '/r/notes/not-an-id', { token: vt });
  check('malformed id → 404', badId.status === 404);

  const dash = await call('GET', '/dashboard', { token: vt });
  const nd = dash.json?.resources?.find((r) => r.key === 'notes');
  check('dashboard stats (seeded)', dash.status === 200 && nd && nd.total === 8 && nd.overdue >= 2 && dash.json.recent.length === 10, JSON.stringify({ total: nd?.total, overdue: nd?.overdue, dueSoon: nd?.dueSoon }));

  const voice = await call('POST', '/voice/ask', { token: vt, body: { text: 'Which notes are overdue?' } });
  check('voice: which notes are overdue', voice.status === 200 && voice.json.intent === 'LIST_OVERDUE', voice.json?.answer);

  const ex = await call('GET', '/voice/examples', { token: vt });
  check('voice examples', ex.status === 200 && ex.json.examples.length > 0, ex.json?.examples?.join(' | '));

  const rep = await call('POST', '/reports', { token: vt, body: { resource: 'notes', filters: { priority: 'High' } } });
  check('report generated', rep.status === 201 && rep.json.report.count >= 2, 'count=' + rep.json?.report?.count);
  const dl = await fetch(base + '/reports/' + rep.json?.report?._id + '/download', { headers: { Authorization: 'Bearer ' + vt } });
  const bytes = Buffer.from(await dl.arrayBuffer());
  check('report download is a PDF', dl.status === 200 && bytes.subarray(0, 4).toString() === '%PDF', bytes.length + ' bytes');

  const allAct = await call('GET', '/activity', { token: vt });
  check('viewer /activity → 403', allAct.status === 403);
} catch (err) {
  check('smoke run', false, err.message);
} finally {
  child.kill();
  console.log(results.join('\n'));
  if (results.some((r) => r.startsWith('FAIL'))) {
    console.log('\n--- server log ---\n' + log);
    process.exitCode = 1;
  }
}
