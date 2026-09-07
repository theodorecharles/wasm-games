// Read-only runtime/data checks; only diagnostic reports are written.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const proofs = path.join(root, 'proofs');
const oldRoot = '/home/ted/wasm-game-data/openrct2/volumes/combined-rct1-rct2';
const newRoot = oldRoot + '-20260906';
const candidateRoot = '/home/ted/wasm-game-data/openrct2-objects-proof-20260905-v2';
const oldId = '34678fb4219829599e425f5bc183b3a6';
const newId = 'c198ff7ec1c45e01be311b1906e75c66';
const oldImage = 'sha256:e00af4e3735efae516493824168208c57f1c41b47d43a679beb777957d942493';
const newImage = 'sha256:308d433f0442e11a04298b9b4101acbb755a4196918bff9000c7b209ed0b2378';
const target = '/wasm-openrct2';
const beforeFile = path.join(proofs, 'rct2-release-before-2026-09-06.json');
const mode = process.argv[2];
assert.equal(process.argv.length, 3);
assert(['--record-before', '--installed'].includes(mode), 'use --record-before or --installed');
const installed = mode === '--installed';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const readJson = async file => JSON.parse(await fs.readFile(file));
const entryPath = (directory, id) => path.join(directory, 'media/openrct2-installation/entries', id);
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
async function payload(directory, item) {
  assert(!path.isAbsolute(item.name) && !item.name.split('/').includes('..') && !item.name.includes('\\'));
  const file = path.join(directory, 'files', item.name);
  assert((await fs.lstat(file)).isFile(), item.name);
  assert((await fs.realpath(file)).startsWith(directory + path.sep), item.name);
  const bytes = await fs.readFile(file);
  assert.equal(bytes.length, item.size, item.name);
  return { name: item.name, bytes: bytes.length, sha256: hash(bytes) };
}
async function get(origin, name) {
  const response = await fetch(new URL(name, origin), { signal: AbortSignal.timeout(60000) });
  assert.equal(response.status, 200, `${origin}/${name}`);
  return Buffer.from(await response.arrayBuffer());
}
const current = containers();
const live = current.find(c => c.name === target);
assert.equal(live.image, installed ? newImage : oldImage);
assert.equal(live.status, 'running'); assert.equal(live.restarts, 0);
assert.deepEqual(live.mounts, [{ type: 'bind', source: installed ? newRoot : oldRoot, destination: '/data', rw: true }]);
assert.equal(current.find(c => c.name === '/openrct2-index-cache-chrome-proof-20260906').image, newImage);

const oldDirectory = entryPath(oldRoot, oldId), newDirectory = entryPath(newRoot, newId);
assert.deepEqual(await fs.readdir(path.dirname(oldDirectory)), [oldId], 'no additional original installations may be lost');
assert.deepEqual(await fs.readdir(path.join(oldRoot, 'media/openrct2-installation/.incoming')), [], 'do not migrate an active import');
assert.deepEqual(await fs.readdir(path.dirname(newDirectory)), [newId]);
const originalBytes = await fs.readFile(path.join(oldDirectory, '.media-entry.json'));
const original = JSON.parse(originalBytes), replacement = await readJson(path.join(newDirectory, '.media-entry.json'));
assert.equal(original.files.length, 2953); assert.equal(replacement.files.length, 2975);
assert.deepEqual(replacement, await readJson(path.join(entryPath(candidateRoot, newId), '.media-entry.json')),
  'new canonical installation metadata must match the Chrome-tested private candidate');
assert.deepEqual(replacement.files.slice(0, original.files.length), original.files);
assert.equal(replacement.totalSize, 1228645759);
const report = await readJson(path.join(newRoot, 'installation-objects-report.json'));
assert.equal(report.entryId, newId); assert.equal(report.added.length, 22);
assert.deepEqual(report.missingAfter, []);
const originals = [];
for (const item of original.files) {
  const before = await payload(oldDirectory, item), after = await payload(newDirectory, item);
  assert.deepEqual(after, before, `original data changed: ${item.name}`);
  originals.push(before);
}
for (const addition of report.added) {
  assert.equal((await payload(newDirectory, addition)).sha256, addition.sha256);
}
const privateData = { originalManifestSha256: hash(originalBytes), originals,
  originalRoot: oldRoot, installedRoot: newRoot, originalId: oldId, entryId: newId,
  files: replacement.files.length, totalSize: replacement.totalSize, added: report.added };

const baseline = await readJson(path.join(proofs, 'rct2-framework-package-2026-09-05.json'));
const accepted = await readJson(path.join(proofs, 'rct2-index-cache-package-2026-09-06.json'));
const origin = installed ? 'http://127.0.0.1:8026' : 'http://127.0.0.1:32940';
const files = [];
for (const file of accepted.files) {
  const bytes = await get(origin, file.name);
  assert.equal(hash(bytes), file.sha256, `accepted HTTP bytes: ${file.name}`);
  assert.equal(hash(await fs.readFile(path.join(root, '.work/site', file.name))), file.sha256);
  const oldHash = baseline.files.find(old => old.name === file.name).beforeSha256;
  if (!installed) assert.equal(hash(await get('http://127.0.0.1:8026', file.name)), oldHash);
  files.push({ name: file.name, beforeSha256: oldHash, sha256: file.sha256, changed: oldHash !== file.sha256 });
}
assert.equal(files.length, 19);
assert.deepEqual(files.filter(f => f.changed).map(f => f.name).sort(), [
  'openrct2-worker.js', 'runtime/openrct2.js', 'runtime/openrct2.wasm', 'wasm-game-bootstrap.js',
  'wasm-game-framework.js', 'wasm-game-framework.json', 'wasm-game.json'
].sort());
const data = JSON.parse(await get(origin, '/game-data/status'));
assert.equal(data.ready, true); assert.equal(data.mediaLibrary.entries.length, 1);
assert.equal(data.mediaLibrary.entries[0].id, newId);
assert.equal(data.mediaLibrary.entries[0].fileCount, 2975);
for (const name of ['/data/', '/local-data/', ...report.added.map(a => '/' + a.name),
  ...report.added.map(a => '/OpenRCT2/object/installed/' + path.basename(a.name))]) {
  assert.equal((await fetch(new URL(name, origin))).status, 404, name);
}
for (const name of ['/ObjData/', '/OpenRCT2/object/installed/']) {
  assert.deepEqual(await get(origin, name), await get(origin, '/index.html'));
}
const result = { observedAt: new Date().toISOString(), containers: current, privateData, files, data };
if (!installed) {
  await fs.writeFile(beforeFile, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
} else {
  const before = await readJson(beforeFile);
  assert.deepEqual(privateData, before.privateData, 'original and replacement data must not drift across deployment');
  assert.deepEqual(current.filter(c => c.name !== target), before.containers.filter(c => c.name !== target),
    'only OpenRCT2 may be recreated; all other containers must remain unchanged');
  assert.notEqual(live.id, before.containers.find(c => c.name === target).id);
  result.unchangedContainers = current.length - 1;
  await fs.writeFile(path.join(proofs, 'rct2-release-installed-2026-09-06.json'), JSON.stringify(result, null, 2) + '\n');
}
console.log(JSON.stringify({ installed, publicFiles: files.length, changed: files.filter(f => f.changed).map(f => f.name),
  originalFilesPreserved: originals.length, privateAdditions: report.added.length, unchangedContainers: result.unchangedContainers }, null, 2));
