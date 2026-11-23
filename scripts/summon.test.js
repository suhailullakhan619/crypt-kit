// Smoke test for the summon script (task 16.2) — Validates: Requirements 1.3, 1.4
// Run: node --test scripts/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, access } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { summon, excluded, displayName } from './summon.js';

const exists = (p) => access(p).then(() => true, () => false);

async function fakeRepo() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'summon-'));
  const s = (...p) => path.join(root, 'skeleton', ...p);
  for (const d of ['server/src/core', 'server/node_modules/x', 'server/uploads/reports', 'client/src', 'client/dist', 'client/node_modules/y']) {
    await mkdir(s(d), { recursive: true });
  }
  await writeFile(s('server/crypt.config.js'), "const config = {\n  appName: 'Crypt Kit',\n  roles: ['Admin'],\n};\nexport default config;\n");
  await writeFile(s('server/package.json'), '{ "name": "crypt-kit-server" }');
  await writeFile(s('client/package.json'), '{ "name": "crypt-kit-client" }');
  await writeFile(s('client/index.html'), '<title>Crypt Kit</title>');
  await mkdir(s('client/public'), { recursive: true });
  await writeFile(s('client/public/manifest.webmanifest'), JSON.stringify({ name: 'Crypt Kit', short_name: 'Crypt Kit', start_url: '/', icons: [] }));
  await writeFile(s('server/src/core/registry.js'), '// core');
  await writeFile(s('server/.env'), 'SECRET=1');
  await writeFile(s('server/.env.example'), 'SECRET=');
  await writeFile(s('server/uploads/reports/.gitkeep'), '');
  await writeFile(s('server/uploads/reports/abc.pdf'), '%PDF');
  await writeFile(s('server/node_modules/x/index.js'), '');
  await writeFile(s('client/dist/index.js'), '');
  return root;
}

test('copies the skeleton, applies the name, and skips excluded files', async () => {
  const root = await fakeRepo();
  try {
    const target = await summon('lab-ledger', { root, log: () => {} });
    const t = (...p) => path.join(target, ...p);
    assert.match(await readFile(t('server/crypt.config.js'), 'utf8'), /appName: 'Lab Ledger'/);
    assert.match(await readFile(t('server/package.json'), 'utf8'), /"lab-ledger-server"/);
    assert.match(await readFile(t('client/package.json'), 'utf8'), /"lab-ledger-client"/);
    assert.match(await readFile(t('client/index.html'), 'utf8'), /<title>Lab Ledger<\/title>/);
    // the installable-app manifest is renamed too (a long name is shortened for the home screen)
    const manifest = JSON.parse(await readFile(t('client/public/manifest.webmanifest'), 'utf8'));
    assert.equal(manifest.name, 'Lab Ledger');
    assert.equal(manifest.short_name, 'Lab Ledger');
    assert.equal(manifest.start_url, '/');
    assert.equal(await readFile(t('server/src/core/registry.js'), 'utf8'), '// core');
    assert.ok(await exists(t('server/.env.example')));
    assert.ok(await exists(t('server/uploads/reports/.gitkeep')));
    for (const gone of ['server/.env', 'server/uploads/reports/abc.pdf', 'server/node_modules', 'client/dist', 'client/node_modules']) {
      assert.equal(await exists(t(gone)), false, `${gone} should not be copied`);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('custom display name and an empty existing folder are fine', async () => {
  const root = await fakeRepo();
  try {
    await mkdir(path.join(root, 'pantry-ghost'));
    await summon('pantry-ghost', { root, title: "Pantry Ghost's", log: () => {} });
    assert.match(await readFile(path.join(root, 'pantry-ghost/server/crypt.config.js'), 'utf8'), /appName: 'Pantry Ghost\\'s'/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('refuses a non-empty target and leaves it unchanged; rejects bad names', async () => {
  const root = await fakeRepo();
  try {
    await mkdir(path.join(root, 'taken'));
    await writeFile(path.join(root, 'taken/keep.txt'), 'mine');
    await assert.rejects(summon('taken', { root, log: () => {} }), /already exists/);
    assert.deepEqual(await readdir(path.join(root, 'taken')), ['keep.txt']);
    await assert.rejects(summon('Bad Name', { root, log: () => {} }), /kebab-case/);
    await assert.rejects(summon('skeleton', { root, log: () => {} }), /other than/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('CLI exits non-zero for an existing target', () => {
  const script = fileURLToPath(new URL('./summon.js', import.meta.url));
  const r = spawnSync(process.execPath, [script, 'skeleton'], { encoding: 'utf8' });
  assert.notEqual(r.status, 0);
});

test('helpers', () => {
  assert.equal(displayName('lab-ledger'), 'Lab Ledger');
  assert.equal(excluded('server/node_modules/a.js'), true);
  assert.equal(excluded('server/.env.example'), false);
  assert.equal(excluded('server/.env.local'), true);
  assert.equal(excluded('server/src/app.js'), false);
});
