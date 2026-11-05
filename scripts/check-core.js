#!/usr/bin/env node
/**
 * Verifies Core files are byte-identical between /skeleton and every app (skeleton Req 1.1,
 * lab-ledger Req 1.1, pantry-ghost Req 1.1). Exit code 1 lists every drifted or missing file.
 *
 *   node scripts/check-core.js
 */
import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APPS = ['lab-ledger', 'pantry-ghost'];
const CORE_DIRS = ['server/src/core', 'server/src/middleware', 'client/src/components/resource'];
const CORE_FILES = ['client/src/lib/can.js'];

async function walk(dir) {
  const out = [];
  let entries = [];
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}

const hash = async (f) => createHash('sha256').update(await readFile(f)).digest('hex');

const skeleton = path.join(ROOT, 'skeleton');
const files = [...CORE_FILES];
for (const d of CORE_DIRS) for (const f of await walk(path.join(skeleton, d))) files.push(path.relative(skeleton, f));

const problems = [];
for (const app of APPS) {
  for (const rel of files) {
    const a = path.join(skeleton, rel);
    const b = path.join(ROOT, app, rel);
    try {
      if ((await hash(a)) !== (await hash(b))) problems.push(`${app}/${rel.replace(/\\/g, '/')}: differs from skeleton`);
    } catch {
      problems.push(`${app}/${rel.replace(/\\/g, '/')}: missing`);
    }
  }
}

if (problems.length) {
  console.error(`✖ Core drift (${problems.length}):\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log(`✔ Core identical across skeleton, ${APPS.join(', ')} (${files.length} files each)`);
