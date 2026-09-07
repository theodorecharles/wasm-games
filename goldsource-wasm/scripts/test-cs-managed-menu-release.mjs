#!/usr/bin/env node
// Read-only audit of the scoped frontend release. Only proof JSON is written.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const proofs = path.join(root, 'proofs');
const oldImage = 'sha256:3ac53414f7fbfb8ec82ec79ecd9efb8759bae71934bfd21585267dab411821b4';
const newImage = 'sha256:7f11b1237e3b7f18db616fbf757d609dc89877fd2d5ca695f968deb0f65aa142';
const liveName = '/wasm-goldsource-suite';
const candidateName = '/goldsource-cs-managed-menu-final-chrome-proof-20260906';
const dataRoot = '/home/ted/wasm-game-data/goldsource-stored-wad-20260906/data';
const readJSON = async file => JSON.parse(await fs.readFile(file));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const mode = process.argv[2];
assert.equal(process.argv.length, 3); assert(['--record-before', '--installed'].includes(mode));
const installed = mode === '--installed';
const inventoryCode = `const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const result={};function walk(dir){for(const name of fs.readdirSync(dir).sort()){
const file=path.join(dir,name),stat=fs.lstatSync(file);
if(stat.isDirectory())walk(file);else if(stat.isSymbolicLink())result[file]={link:fs.readlinkSync(file)};
else if(stat.isFile())result[file]={bytes:stat.size,sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')};
else throw Error(file);}}
for(const dir of ['/opt/game-site','/opt/wasm-game-framework','/opt/shared-shell'])walk(dir);
console.log(JSON.stringify(result));`;
function inventory(image) {
  return JSON.parse(execFileSync('docker', ['run', '--rm', '--read-only', '--network=none', '--entrypoint=node', image, '-e', inventoryCode],
    { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }));
}
function containers() {
  const ids = execFileSync('docker', ['ps', '-aq'], { encoding: 'utf8' }).trim().split('\n');
  return JSON.parse(execFileSync('docker', ['inspect', ...ids], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }))
    .map(c => ({ name: c.Name, id: c.Id, image: c.Image, startedAt: c.State.StartedAt,
      status: c.State.Status, restarts: c.RestartCount,
      mounts: c.Mounts.map(m => ({ type: m.Type, source: m.Source, destination: m.Destination, rw: m.RW }))
        .sort((a, b) => a.destination.localeCompare(b.destination)) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
async function files(directory, prefix = '') {
  const result = [];
  for (const entry of await fs.readdir(path.join(directory, prefix), { withFileTypes: true })) {
    const file = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) result.push(...await files(directory, file));
    else { assert(entry.isFile()); result.push(file); }
  }
  return result.sort();
}
async function payload(directory, file) {
  assert(!path.isAbsolute(file) && !file.split('/').includes('..'));
  const digest = createHash('sha256'); let bytes = 0;
  for await (const chunk of createReadStream(path.join(directory, file))) { digest.update(chunk); bytes += chunk.length; }
  return { file, bytes, sha256: digest.digest('hex') };
}
const current = containers(), live = current.find(c => c.name === liveName);
assert.equal(live.image, installed ? newImage : oldImage); assert.equal(live.status, 'running'); assert.equal(live.restarts, 0);
assert.deepEqual(live.mounts, [{ type: 'bind', source: dataRoot, destination: '/data', rw: true }]);
const candidate = current.find(c => c.name === candidateName);
assert.equal(candidate.image, newImage); assert.equal(candidate.status, 'running'); assert.equal(candidate.restarts, 0);
assert.deepEqual(candidate.mounts, [{ type: 'bind', source: dataRoot, destination: '/data', rw: false }]);
const earlier = await readJSON(path.join(proofs, 'cs-menu-globals-installed-2026-09-06.json'));
const baseline = await readJSON(path.join(proofs, installed
  ? 'cs-managed-menu-final-before-2026-09-06.json' : 'cs-managed-menu-before-2026-09-06.json'));
assert.deepEqual(current.filter(c => c.name !== liveName && (installed || c.name !== candidateName)),
  baseline.containers.filter(c => c.name !== liveName), 'no unrelated service changed');
const before = inventory(oldImage), after = inventory(newImage);
assert.deepEqual(before, earlier.imageInventory.after, 'exact accepted previous image');
const oldMenu = '/opt/game-site/artifacts/cs-menu-framework-YQVL64O7.wasm';
const newMenu = '/opt/game-site/artifacts/cs-menu-framework-KSOVNLXO.wasm';
assert.equal(Object.keys(before).length, 38); assert.equal(Object.keys(after).length, 38);
assert.deepEqual(Object.keys(after).filter(f => f !== newMenu), Object.keys(before).filter(f => f !== oldMenu));
const changed = Object.keys(after).filter(f => f !== newMenu && JSON.stringify(after[f]) !== JSON.stringify(before[f]));
assert.deepEqual(changed, ['/opt/game-site/game-adapter.js']);
assert.equal(after[newMenu].sha256, 'bf04a2ca7c26a0a0b092067459d030348a59c14acef54f727535f9c660aa9881');
const originals = [], replacements = [];
for (const [directory, expected, output] of [
  ['/home/ted/wasm-game-data/goldsource', earlier.originals, originals], [dataRoot, earlier.replacements, replacements]]) {
  assert.deepEqual(await files(directory), expected.map(item => item.file));
  for (const item of expected) { const actual = await payload(directory, item.file); assert.deepEqual(actual, item); output.push(actual); }
}
const accepted = await readJSON(path.join(proofs, 'cs-managed-menu-final-package-2026-09-06.json'));
const origin = installed ? 'http://127.0.0.1:8017' : 'http://127.0.0.1:32948';
const http = [];
for (const item of [...accepted.unchanged, ...accepted.changed]) {
  const response = await fetch(new URL('/' + item.file, origin), { signal: AbortSignal.timeout(30000) });
  assert.equal(response.status, 200); const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(hash(bytes), item.sha256, item.file);
  const imageFile = item.file.startsWith('shared-shell/') ? '/opt/' + item.file : '/opt/game-site/' + item.file;
  assert.equal(after[imageFile].sha256, item.sha256);
  if (!item.file.startsWith('shared-shell/')) assert.equal(hash(await fs.readFile(path.join(root, 'web', item.file))), item.sha256);
  http.push({ file: item.file, sha256: item.sha256 });
}
const readiness = [];
for (const variant of ['half-life', 'blue-shift', 'opposing-force', 'counter-strike']) {
  const response = await fetch(new URL('/game-data/status?variant=' + variant, origin)); assert.equal(response.status, 200);
  const status = await response.json(); assert(status.ready && status.files.every(file => file.valid)); readiness.push({ variant, ready: true });
}
for (const file of ['/data', '/data/goldsource/valve-owner.pk3', '/owner-report.json', oldMenu.replace('/opt/game-site', '')])
  assert.equal((await fetch(new URL(file, origin))).status, 404);
const report = { observedAt: new Date().toISOString(), installed, oldImage, newImage, containers: current,
  imageInventory: { before, after, changed, oldMenu, newMenu }, originals, replacements, http, readiness,
  unchangedContainers: installed ? current.length - 1 : baseline.containers.length - 1, passed: true };
await fs.writeFile(path.join(proofs, `cs-managed-menu-final-${installed ? 'installed' : 'before'}-2026-09-06.json`),
  JSON.stringify(report, null, 2) + '\n', { flag: installed ? 'w' : 'wx' });
console.log(JSON.stringify({ observedAt: report.observedAt, installed, newImage, http: http.length,
  unchangedImageFiles: 36, unchangedContainers: report.unchangedContainers, originalFiles: originals.length,
  activeDataFiles: replacements.length, passed: true }));
