import { createHash } from 'node:crypto';
import { createReadStream, existsSync, lstatSync, openSync, readSync, closeSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

export const HL2_STEAM_ROOT = process.env.HL2_STEAM_ROOT
  || '/home/ted/.steam/debian-installation/steamapps/common/Half-Life 2';
export const HL2_GOTY_ROOT = process.env.HL2_GOTY_ROOT
  || '/home/ted/.local/share/source-wasm/hl2-dvd';
export const HL2_COMBINED_ROOT = process.env.HL2_COMBINED_ROOT
  || '/home/ted/.local/share/source-wasm/hl2-combined';
export const PORTAL_STEAM_ROOT = process.env.PORTAL_STEAM_ROOT
  || '/home/ted/.steam/debian-installation/steamapps/common/Portal';

function pickOwnerRoot() {
  if (process.env.HL2_OWNER_ROOT) return process.env.HL2_OWNER_ROOT;
  if (process.env.WASM_GAME_DATA_ROOT) return process.env.WASM_GAME_DATA_ROOT;
  if (existsSync(path.join(HL2_COMBINED_ROOT, 'hl2', 'gameinfo.txt'))) return HL2_COMBINED_ROOT;
  return HL2_STEAM_ROOT;
}

export const HL2_OWNER_ROOT = pickOwnerRoot();

const VPK_MAGIC = [52, 18, 170, 85];
const BLOCKED_NAMES = new Set(['glshaders.cfg']);

function existingNumbered(root, prefix) {
  const dirRel = path.posix.dirname(prefix);
  const base = path.posix.basename(prefix);
  const absDir = path.join(root, dirRel);
  if (!existsSync(absDir)) return [];
  const names = readdirSync(absDir).filter((name) => (
    name === `${base}_dir.vpk` || new RegExp(`^${base}_\\d{3}\\.vpk$`).test(name)
  )).sort();
  return names.map((name) => path.posix.join(dirRel, name));
}

export function variantFileRels(ownerRoot) {
  const shared = [
    'hl2/gameinfo.txt',
    'hl2/steam.inf',
    ...existingNumbered(ownerRoot, 'hl2/hl2_pak'),
    ...existingNumbered(ownerRoot, 'hl2/hl2_misc'),
    ...existingNumbered(ownerRoot, 'hl2/hl2_textures'),
    ...existingNumbered(ownerRoot, 'hl2/hl2_sound_misc'),
    ...existingNumbered(ownerRoot, 'hl2/hl2_sound_vo_english'),
    ...existingNumbered(ownerRoot, 'platform/platform_misc')
  ].filter((rel) => existsSync(path.join(ownerRoot, rel)));

  const variants = { hl2: shared };

  // Portal mounts its own portal/ tree on top of the shared hl2/ base content;
  // a single Steam Portal install carries both, so one owner root serves both
  // variants.
  if (existsSync(path.join(ownerRoot, 'portal', 'gameinfo.txt'))) {
    variants.portal = [
      'portal/gameinfo.txt',
      'portal/steam.inf',
      ...existingNumbered(ownerRoot, 'portal/portal_pak'),
      ...shared
    ].filter((rel) => existsSync(path.join(ownerRoot, rel)));
  }

  return variants;
}

export function isLooseOwnerRoot(ownerRoot) {
  return existsSync(path.join(ownerRoot, 'hl2', 'gameinfo.txt'))
    && !existsSync(path.join(ownerRoot, 'hl2', 'hl2_textures_dir.vpk'));
}

export function walkOwnerFiles(ownerRoot) {
  const files = [];
  function walk(rel) {
    const abs = path.join(ownerRoot, rel);
    const st = lstatSync(abs);
    if (st.isSymbolicLink()) throw new Error(`owner tree contains a symlink: ${abs}`);
    if (st.isDirectory()) {
      for (const name of readdirSync(abs).sort()) {
        if (name === '.' || name === '..') continue;
        walk(rel ? `${rel}/${name}` : name);
      }
      return;
    }
    if (st.isFile()) {
      const relPath = rel.replace(/\\/g, '/');
      if (!BLOCKED_NAMES.has(path.posix.basename(relPath).toLowerCase())
        && !/\.(dll|exe|so|dylib|asi)(?:$|[_-]\d+$)/i.test(path.posix.basename(relPath))) {
        files.push(relPath);
      }
    }
  }
  walk('');
  return files;
}

export function assertAllowedRel(relPath) {
  const name = path.posix.basename(relPath).toLowerCase();
  if (BLOCKED_NAMES.has(name)) {
    throw new Error(`${relPath} is blocked (Steam leftover, crashes the loader)`);
  }
  if (/\.(dll|exe|so|dylib|asi)(?:$|[_-]\d+$)/i.test(name)) {
    throw new Error(`${relPath} is a native binary and must not be mounted`);
  }
}

export function fileKind(relPath) {
  if (relPath.endsWith('_dir.vpk')) return 'vpk-dir';
  if (relPath.endsWith('.vpk')) return 'vpk-data';
  if (relPath.endsWith('gameinfo.txt')) return 'gameinfo';
  if (relPath.endsWith('steam.inf')) return 'steam-inf';
  return 'file';
}

export function fileKey(relPath) {
  let key = relPath.replace(/[\\/]+/g, '-').replace(/[^a-zA-Z0-9._-]+/g, '-').toLowerCase();
  key = key.replace(/^-+/, '');
  if (!/^[a-z0-9]/.test(key)) key = `f-${key}`;
  return key || 'file';
}

export function hashFile(absPath) {
  const hash = createHash('sha256');
  const fd = createReadStream(absPath);
  return new Promise((resolve, reject) => {
    fd.on('data', (chunk) => hash.update(chunk));
    fd.on('error', reject);
    fd.on('end', () => {
      const st = statSync(absPath);
      const header = Buffer.alloc(8);
      const raw = openSync(absPath, 'r');
      const n = readSync(raw, header, 0, 8, 0);
      closeSync(raw);
      resolve({
        size: st.size,
        sha256: hash.digest('hex'),
        magic: header.subarray(0, n).toString('latin1')
      });
    });
  });
}

export const BROWSER_POLICY_RELS = Object.freeze([
  'hl2/gameinfo.txt',
  'hl2/steam.inf',
  'portal/gameinfo.txt',
  'portal/steam.inf'
]);

export function describeFileSlim(ownerRoot, relPath) {
  assertAllowedRel(relPath);
  const abs = path.join(ownerRoot, relPath);
  const st = lstatSync(abs);
  if (st.isSymbolicLink()) throw new Error(`${relPath} is a symlink and must not be mounted`);
  if (!st.isFile()) throw new Error(`${relPath} is not a file`);
  return {
    key: fileKey(relPath),
    name: path.posix.basename(relPath),
    path: relPath,
    size: st.size,
    required: true
  };
}

export async function describeFile(steamRoot, relPath) {
  const slim = describeFileSlim(steamRoot, relPath);
  const hashed = await hashFile(path.join(steamRoot, relPath));
  const kind = fileKind(relPath);
  return {
    ...slim,
    sha256: hashed.sha256,
    validator: {
      module: '/data-validator.mjs',
      export: 'validateSourceOwnerFile',
      version: 'source-owner-v1',
      policy: { kind }
    },
    magic: kind === 'vpk-dir' || kind === 'vpk-data' ? VPK_MAGIC.slice() : hashed.magic
  };
}

function uniquifyKeys(files) {
  const seen = new Map();
  for (const entry of files) {
    const prior = seen.get(entry.key) || 0;
    seen.set(entry.key, prior + 1);
    if (prior) entry.key = `${entry.key}-${prior}`;
  }
  return files;
}

export async function buildVariantPolicy(variant, ownerRoot, rels, options = {}) {
  const hash = options.hash === true;
  const files = uniquifyKeys(await Promise.all(rels.map((rel) => (
    hash ? describeFile(ownerRoot, rel) : describeFileSlim(ownerRoot, rel)
  ))));
  return {
    namespace: `source-${variant}`,
    version: 'steam-legacy-hl2-v1',
    files
  };
}

export function ownerRootRecipe(ownerRoot) {
  if (existsSync(path.join(ownerRoot, 'portal', 'gameinfo.txt'))) {
    return 'steam-portal-v1';
  }
  if (isLooseOwnerRoot(ownerRoot)) return 'goty-2014-plus-legacy-shaders-v1';
  return 'steam-legacy-hl2-v1';
}

export async function buildRootPolicy(ownerRoot = HL2_OWNER_ROOT, options = {}) {
  if (!existsSync(path.join(ownerRoot, 'hl2', 'gameinfo.txt'))
    && !existsSync(path.join(ownerRoot, 'portal', 'gameinfo.txt'))) {
    throw new Error(`owner root missing gameinfo: ${ownerRoot}`);
  }
  const loose = isLooseOwnerRoot(ownerRoot);
  const byVariant = loose
    ? { hl2: walkOwnerFiles(ownerRoot) }
    : variantFileRels(ownerRoot);
  const version = ownerRootRecipe(ownerRoot);
  const variants = {};
  for (const [key, rels] of Object.entries(byVariant)) {
    const pack = await buildVariantPolicy(key, ownerRoot, rels, options);
    pack.version = version;
    variants[key] = pack;
  }
  return {
    namespace: 'source-wasm',
    version,
    variants
  };
}

export function toBrowserPolicy(policy) {
  const variants = {};
  for (const [key, pack] of Object.entries(policy.variants || {})) {
    const files = (pack.files || []).filter((file) => BROWSER_POLICY_RELS.includes(file.path));
    variants[key] = {
      namespace: pack.namespace,
      version: pack.version,
      files: files.map((file) => ({
        key: file.key,
        name: file.name,
        path: file.path,
        size: file.size,
        required: true
      }))
    };
  }
  return {
    namespace: policy.namespace,
    version: policy.version,
    variants
  };
}

export function toMountIndex(policy) {
  const index = { version: policy.version };
  for (const [key, pack] of Object.entries(policy.variants || {})) {
    index[key] = (pack.files || []).map((file) => [file.key, file.path, file.size]);
  }
  return index;
}

export function toServerManifest(policy) {
  const variants = {};
  for (const [key, pack] of Object.entries(policy.variants || {})) {
    variants[key] = {
      namespace: pack.namespace,
      version: pack.version,
      files: (pack.files || []).map((file) => ({
        key: file.key,
        name: file.name,
        path: file.path,
        size: file.size,
        required: true
      }))
    };
  }
  return {
    namespace: policy.namespace,
    version: policy.version,
    variants
  };
}

export { VPK_MAGIC, BLOCKED_NAMES };
