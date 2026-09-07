// Read-only package/data/deployment checks; writes diagnostic reports only.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const proofs = path.join(root, 'proofs');
const oldRoot = '/home/ted/wasm-game-data/goldsource';
const stage = '/home/ted/wasm-game-data/goldsource-stored-wad-20260906';
const newRoot = path.join(stage, 'data');
const oldImage = 'sha256:c20b2d218bc26c41b040863616a3d29beb5f2dd72ff53a6154558d9b5530fdcd';
const newImage = 'sha256:967561eca15081284748f7a46178a1f5d8f8024a3aa182e4a95e2a406ca9c2ce';
const target = '/wasm-goldsource-suite';
const oldMenu = 'artifacts/menu-framework-GCBKRHAY.wasm';
const newMenu = 'artifacts/menu-framework-G4W5MLBE.wasm';
const readJson = async file => JSON.parse(await fs.readFile(file));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const mode = process.argv[2];
assert.equal(process.argv.length, 3);
assert(['--record-before', '--installed'].includes(mode));
const installed = mode === '--installed';
const inventoryCode = `
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const result={};
function walk(dir) {
  for (const name of fs.readdirSync(dir).sort()) {
    const file=path.join(dir,name),stat=fs.lstatSync(file);
    if (stat.isDirectory()) walk(file);
    else if (stat.isSymbolicLink()) result[file]={link:fs.readlinkSync(file)};
    else if (stat.isFile()) result[file]={bytes:stat.size,sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')};
    else throw Error('unexpected image file '+file);
  }
}
for (const dir of ['/opt/game-site','/opt/wasm-game-framework','/opt/shared-shell']) walk(dir);
console.log(JSON.stringify(result));`;
function inventory(image) {
  return JSON.parse(execFileSync('docker', ['run', '--rm', '--read-only', '--network=none', '--entrypoint=node', image, '-e', inventoryCode],
    { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }));
}
function containers() {
  const ids = execFileSync('docker', ['ps', '-aq'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
  assert(ids.length > 0);
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
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) result.push(...await files(directory, relative));
    else { assert(entry.isFile(), `non-regular owner/site entry: ${relative}`); result.push(relative); }
  }
  return result.sort();
}
async function payload(directory, relative) {
  assert(!path.isAbsolute(relative) && !relative.split('/').includes('..'));
  const checksum = createHash('sha256'); let bytes = 0;
  for await (const chunk of createReadStream(path.join(directory, relative))) { bytes += chunk.length; checksum.update(chunk); }
  return { file: relative, bytes, sha256: checksum.digest('hex') };
}
async function get(origin, file) {
  const response = await fetch(new URL('/' + file, origin), { signal: AbortSignal.timeout(30000) });
  assert.equal(response.status, 200, `${origin}/${file}`);
  return Buffer.from(await response.arrayBuffer());
}

const current = containers(), live = current.find(c => c.name === target);
assert.equal(live.image, installed ? newImage : oldImage);
assert.equal(live.status, 'running'); assert.equal(live.restarts, 0);
assert.deepEqual(live.mounts, [{ type: 'bind', source: installed ? newRoot : oldRoot, destination: '/data', rw: true }]);
assert.equal(current.find(c => c.name === '/goldsource-save-hints-chrome-proof-20260905').image, newImage);
const before = inventory(oldImage), after = inventory(newImage);
assert.equal(Object.keys(before).length, 38); assert.equal(Object.keys(after).length, 38);
const oldNames = Object.keys(before).filter(f => f !== '/opt/game-site/' + oldMenu);
const newNames = Object.keys(after).filter(f => f !== '/opt/game-site/' + newMenu);
assert.deepEqual(newNames, oldNames);
const changed = newNames.filter(f => JSON.stringify(before[f]) !== JSON.stringify(after[f]));
assert.deepEqual(changed, ['/opt/game-site/game-adapter.js', '/opt/game-site/wasm-game-data.json',
  '/opt/wasm-game-framework/dist/wasm-game-framework.js', '/opt/shared-shell/wasm-game-framework.js']);
const accepted = await readJson(path.join(proofs, 'goldsource-save-hints-package-2026-09-05.json'));
const origin = installed ? 'http://127.0.0.1:8017' : 'http://127.0.0.1:32932';
const http = [];
for (const item of [...accepted.unchanged, ...accepted.changed]) {
  const bytes = await get(origin, item.file);
  assert.equal(hash(bytes), item.sha256, item.file);
  const imageFile = item.file.startsWith('shared-shell/') ? '/opt/' + item.file : '/opt/game-site/' + item.file;
  assert.equal(after[imageFile].sha256, item.sha256, item.file);
  if (!item.file.startsWith('shared-shell/')) {
    assert.equal(hash(await fs.readFile(path.join(root, 'web', item.file))), item.sha256, 'source site: ' + item.file);
    assert.equal(hash(await fs.readFile(path.join(stage, 'site', item.file))), item.sha256, 'staged site: ' + item.file);
  }
  if (!installed) {
    const previousFile = item.file === newMenu ? oldMenu : item.file;
    const oldImageFile = previousFile.startsWith('shared-shell/') ? '/opt/' + previousFile : '/opt/game-site/' + previousFile;
    assert.equal(hash(await get('http://127.0.0.1:8017', previousFile)), before[oldImageFile].sha256, previousFile);
  }
  http.push({ file: item.file, sha256: item.sha256 });
}
assert.equal(http.length, 27);
const originalManifest = await readJson(path.join(proofs, 'goldsource-release-original-data-manifest-2026-09-06.json'));
const replacementManifest = await readJson(path.join(root, 'web/wasm-game-data.json'));
const owner = await readJson(path.join(stage, 'owner-report.json'));
assert.deepEqual(owner.archives, (await readJson(path.join(proofs, 'goldsource-stored-wad-owner-2026-09-05.json'))).archives);
const declarations = new Map(Object.values(originalManifest.variants).flatMap(v => v.files).map(f => [f.path, f]));
assert.equal(declarations.size, 16);
const names = [...declarations.keys()].sort();
assert.deepEqual(await files(oldRoot), names, 'preserve every original owner file, including extras');
assert.deepEqual(await files(newRoot), names);
const originals = [], replacements = [];
for (const name of names) {
  const old = await payload(oldRoot, name), replacement = await payload(newRoot, name);
  const declared = declarations.get(name), archive = owner.archives[name];
  assert.equal(old.bytes, declared.size); assert.equal(old.sha256, declared.sha256);
  if (archive) {
    assert.equal(old.sha256, archive.previousSHA256); assert.equal(replacement.sha256, archive.sha256);
    assert.equal(replacement.bytes, archive.size); assert.equal(archive.payloadsIdentical, true);
    assert.equal(archive.nonWadCompressedBytesIdentical, true);
  } else assert.deepEqual(replacement, old);
  originals.push(old); replacements.push(replacement);
}
const expectedManifest = structuredClone(originalManifest);
expectedManifest.version += '-stored-wad-v1';
for (const variant of Object.values(expectedManifest.variants)) {
  for (const file of variant.files) {
    const archive = owner.archives[file.path];
    if (archive) Object.assign(file, { size: archive.size, sha256: archive.sha256 });
  }
}
assert.deepEqual(replacementManifest, expectedManifest);
const readiness = [];
for (const variant of Object.keys(replacementManifest.variants)) {
  const status = JSON.parse(await get(origin, `game-data/status?variant=${variant}`));
  assert.equal(status.ready, true); assert.ok(status.files.every(f => f.valid));
  readiness.push({ variant, ready: true });
}
for (const route of ['/data', '/data/goldsource/valve-owner.pk3', '/owner-report.json']) {
  assert.equal((await fetch(new URL(route, origin))).status, 404, route);
}
const report = { observedAt: new Date().toISOString(), installed, containers: current,
  imageInventory: { before, after, changed, oldMenu, newMenu }, http,
  originals, replacements, originalManifest, replacementManifest, archives: owner.archives, readiness };
const beforeFile = path.join(proofs, 'goldsource-release-before-2026-09-06.json');
if (!installed) await fs.writeFile(beforeFile, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
else {
  const baseline = await readJson(beforeFile);
  assert.notEqual(live.id, baseline.containers.find(c => c.name === target).id);
  assert.deepEqual(current.filter(c => c.name !== target), baseline.containers.filter(c => c.name !== target), 'only the GoldSource frontend may change');
  for (const key of ['originals', 'replacements', 'originalManifest', 'replacementManifest', 'archives', 'imageInventory']) {
    assert.deepEqual(report[key], baseline[key], key);
  }
  report.unchangedContainers = current.length - 1;
  await fs.writeFile(path.join(proofs, 'goldsource-release-installed-2026-09-06.json'), JSON.stringify(report, null, 2) + '\n');
}
console.log(JSON.stringify({ installed, packageFiles: 38, httpFiles: http.length, nativeMenuReplaced: true,
  changed, originalFilesPreserved: originals.length, unchangedContainers: report.unchangedContainers }, null, 2));
