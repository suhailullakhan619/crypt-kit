#!/usr/bin/env node
/**
 * Summon a new app from the skeleton (skeleton Req 1.3, 1.4).
 *
 *   npm run summon -- <name> ["Display Name"]
 *
 * Copies /skeleton to /<name> (excluding node_modules, dist, coverage, .env files and generated
 * PDF reports), then sets the app name in crypt.config.js, both package.json files and index.html.
 * Refuses to overwrite a folder that already has files in it (an empty folder is fine).
 */
import { cp, readdir, readFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NAME_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const EXCLUDE_DIRS = new Set(['node_modules', 'dist', 'coverage', '.cache']);

/** Default display name: 'lab-ledger' → 'Lab Ledger'. */
export function displayName(slug) {
  return slug.split('-').map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
}

/** True for paths that must not be copied into a new app. */
export function excluded(relPath) {
  const parts = relPath.split(/[\\/]/);
  if (parts.some((p) => EXCLUDE_DIRS.has(p))) return true;
  const base = parts[parts.length - 1];
  if (base === '.env' || (base.startsWith('.env.') && base !== '.env.example')) return true;
  // generated reports: keep the folder's .gitkeep only
  if (parts.includes('uploads') && parts.includes('reports') && base !== '.gitkeep' && base !== 'reports') return true;
  return false;
}

async function isNonEmptyDir(dir) {
  try {
    const s = await stat(dir);
    if (!s.isDirectory()) return true; // a file with that name: refuse
    return (await readdir(dir)).length > 0;
  } catch (err) {
    if (err.code === 'ENOENT') return false;
    throw err;
  }
}

async function rewrite(file, fn) {
  try {
    const before = await readFile(file, 'utf8');
    const after = fn(before);
    if (after !== before) await writeFile(file, after);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
}

/**
 * @param {string} slug - folder name (lowercase kebab-case)
 * @param {{ root?: string, title?: string, log?: (m: string) => void }} [opts]
 * @returns {Promise<string>} the created folder
 * @throws {Error} invalid name or non-empty target
 */
export async function summon(slug, { root = ROOT, title, log = console.log } = {}) {
  if (!NAME_RE.test(slug ?? '')) throw new Error(`App name must be lowercase kebab-case (got "${slug}")`);
  if (slug === 'skeleton') throw new Error('Choose a name other than "skeleton"');

  const source = path.join(root, 'skeleton');
  const target = path.join(root, slug);
  if (await isNonEmptyDir(target)) throw new Error(`"${slug}" already exists and is not empty — refusing to overwrite it`);

  const appName = title ?? displayName(slug);
  await cp(source, target, {
    recursive: true,
    filter: (src) => !excluded(path.relative(source, src)),
  });

  const q = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  await rewrite(path.join(target, 'server/crypt.config.js'), (s) => s.replace(/appName:\s*'[^']*'/, `appName: '${q(appName)}'`));
  await rewrite(path.join(target, 'server/package.json'), (s) => s.replace(/"name":\s*"[^"]*"/, `"name": "${slug}-server"`));
  await rewrite(path.join(target, 'client/package.json'), (s) => s.replace(/"name":\s*"[^"]*"/, `"name": "${slug}-client"`));
  await rewrite(path.join(target, 'client/index.html'), (s) => s.replace(/<title>[^<]*<\/title>/, `<title>${appName}</title>`));

  log(`🪦 Summoned "${appName}" into ./${slug}`);
  log(`   Next: npm install --prefix ${slug}/server && npm install --prefix ${slug}/client`);
  log(`         add resources in ${slug}/server/src/resources/ and run npm run dev --prefix ${slug}/server`);
  return target;
}

// CLI
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [slug, title] = process.argv.slice(2);
  summon(slug, { title }).catch((err) => {
    console.error(`✖ ${err.message}`);
    process.exit(1);
  });
}
