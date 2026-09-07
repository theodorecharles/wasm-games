import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const game = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const engine = path.resolve(game, '../..');
const proofs = path.join(engine, 'proofs');
const oldOrigin = process.env.OPENRCT2_OLD_ORIGIN || 'http://127.0.0.1:32935';
const candidateOrigin = process.env.OPENRCT2_CANDIDATE_ORIGIN || 'http://127.0.0.1:32937';
const baseline = JSON.parse(await fs.readFile(path.join(proofs, 'rct2-private-objects-package-2026-09-05.json')));
const expectedChanges = ['runtime/openrct2.js', 'runtime/openrct2.wasm'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function get(origin, name) {
  const response = await fetch(new URL(name, origin), { signal: AbortSignal.timeout(60000) });
  assert.equal(response.status, 200, `${origin}/${name}`);
  return Buffer.from(await response.arrayBuffer());
}
const files = [];
for (const file of baseline.files) {
  const before = await get(oldOrigin, file.name);
  const after = await get(candidateOrigin, file.name);
  assert.equal(hash(before), file.sha256, `old candidate drift: ${file.name}`);
  assert.deepEqual(after, await fs.readFile(path.join(engine, '.work/site', file.name)), `staged bytes: ${file.name}`);
  assert.equal(!after.equals(before), expectedChanges.includes(file.name), `unexpected change: ${file.name}`);
  files.push({ name: file.name, bytes: after.length, sha256: hash(after), changed: !after.equals(before) });
}
assert.equal(files.length, 19);
assert.deepEqual(files.filter(file => file.changed).map(file => file.name).sort(), expectedChanges);
const data = JSON.parse(await get(candidateOrigin, '/game-data/status'));
assert.deepEqual(data, JSON.parse(await get(oldOrigin, '/game-data/status')));
assert.equal(data.ready, true);
assert.equal(data.mediaLibrary.entries[0].id, baseline.owner.entryId);
assert.equal(data.mediaLibrary.entries[0].fileCount, 2975);
assert.equal(data.mediaLibrary.entries[0].totalSize, 1228645759);
for (const name of ['/data/', '/local-data/', ...baseline.owner.added.map(item => '/' + item.name),
  ...baseline.owner.added.map(item => '/OpenRCT2/object/installed/' + path.basename(item.name))]) {
  assert.equal((await fetch(new URL(name, candidateOrigin))).status, 404, `private file exposed: ${name}`);
}
for (const name of ['/ObjData/', '/OpenRCT2/object/installed/']) {
  assert.deepEqual(await get(candidateOrigin, name), await get(candidateOrigin, '/index.html'));
}
const report = {
  observedAt: new Date().toISOString(), oldOrigin, candidateOrigin,
  sourceCommit: '4a7ee146caab8888eb31e56a33c0559db89b17bd',
  patchSha256: hash(await fs.readFile(path.join(game, 'patches/rct1-sprite-path.patch'))),
  files, data,
  acceptance: 'Exact served/staged bytes and private boundaries only; native source tests and Chrome scenario/save checks are separate.'
};
if (process.argv[2]) await fs.writeFile(process.argv[2], JSON.stringify(report, null, 2) + '\n');
console.log('OpenRCT2 sprite-path package: 19 exact staged/served files; only native JS/Wasm changed; identical asset pack, framework, worker and private installation; direct-path privacy checks pass.');
