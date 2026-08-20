import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  HL2_STEAM_ROOT,
  HL2_COMBINED_ROOT,
  HL2_OWNER_ROOT,
  PORTAL_STEAM_ROOT,
  walkOwnerFiles
} from '../scripts/source-data-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const policy = JSON.parse(readFileSync(path.join(root, 'web', 'wasm-game-data.json'), 'utf8'));
const browserBytes = statSync(path.join(root, 'web', 'wasm-game-data.json')).size;

const allowedVersions = new Set(['steam-legacy-hl2-v1', 'goty-2014-plus-legacy-shaders-v1', 'steam-portal-v1']);
assert.ok(allowedVersions.has(policy.version), `unexpected policy version ${policy.version}`);
assert.ok(policy.variants.hl2 || policy.variants.portal);
for (const pack of Object.values(policy.variants)) {
  assert.ok(pack.files.length >= 1);
  assert.ok(pack.files.length < 32, 'browser policy listed the owner catalog');
}
assert.ok(browserBytes < 16 * 1024, `browser policy is ${browserBytes} bytes`);

const ownerRoot = policy.version === 'steam-portal-v1'
  ? PORTAL_STEAM_ROOT
  : policy.version === 'goty-2014-plus-legacy-shaders-v1'
    ? (existsSync(path.join(HL2_COMBINED_ROOT, 'hl2', 'gameinfo.txt')) ? HL2_COMBINED_ROOT : HL2_OWNER_ROOT)
    : HL2_STEAM_ROOT;

for (const [variant, pack] of Object.entries(policy.variants)) {
  for (const file of pack.files) {
    assert.doesNotMatch(file.path, /glshaders\.cfg/i, `${variant} mounts glshaders.cfg`);
    assert.doesNotMatch(file.path, /\.(dll|exe|so|dylib|asi)(?:$|[_-]\d+$)/i, `${variant} mounts native owner data`);
    assert.doesNotMatch(file.name, /\.(dll|exe|so|dylib|asi)(?:$|[_-]\d+$)/i);
    const abs = path.join(ownerRoot, file.path);
    assert.ok(existsSync(abs), `missing owner file ${file.path}`);
  }
}

const probeVariant = policy.variants.hl2 ? 'hl2' : 'portal';
const probe = policy.variants[probeVariant].files.find((file) => file.path === `${probeVariant}/gameinfo.txt`);
assert.ok(probe);
const bytes = readFileSync(path.join(ownerRoot, probe.path));
assert.match(bytes.toString('utf8'), /GameInfo/);

const ownerFiles = walkOwnerFiles(ownerRoot);
assert.ok(ownerFiles.length > 20, `owner tree too small: ${ownerFiles.length}`);
for (const rel of ownerFiles) {
  assert.doesNotMatch(rel, /glshaders\.cfg/i, `owner tree contains ${rel}`);
  assert.doesNotMatch(rel, /\.(dll|exe|so|dylib|asi)(?:$|[_-]\d+$)/i, `owner tree contains ${rel}`);
  assert.ok(existsSync(path.join(ownerRoot, rel)), `missing owner file ${rel}`);
}

assert.equal(existsSync(path.join(root, 'web', 'wasm-game-files.json')), false);
assert.match(readFileSync(path.join(root, 'web', 'game-adapter.js'), 'utf8'), /\/owner\//);

assert.equal(existsSync(path.join(root, 'vendor', 'source-engine', 'wscript')), false);
assert.ok(existsSync(path.join(root, 'patches', 'series')));

const linkFlags = readFileSync(path.join(root, 'patches', 'files', 'source_wasm.py'), 'utf8');
assert.match(linkFlags, /INITIAL_MEMORY=2147483648/);
assert.match(linkFlags, /MAXIMUM_MEMORY=4294901760/);

console.log(`steam-data-audit: browser stub ${JSON.stringify(Object.fromEntries(Object.entries(policy.variants).map(([key, pack]) => [key, pack.files.length])))} files (${browserBytes} bytes); owner tree ${ownerFiles.length} files at ${ownerRoot} (${policy.version})`);
