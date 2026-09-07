import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const game = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const proofs = path.resolve(game, '../../proofs');
const originalOrigin = process.env.OPENRCT2_ORIGINAL_ORIGIN || 'http://127.0.0.1:32934';
const controlOrigin = process.env.OPENRCT2_CONTROL_ORIGIN || 'http://127.0.0.1:32936';
const candidateOrigin = process.env.OPENRCT2_CANDIDATE_ORIGIN || 'http://127.0.0.1:32935';
const ownerReport = process.env.OPENRCT2_OBJECT_REPORT || '/home/ted/wasm-game-data/openrct2-objects-proof-20260905-v2/installation-objects-report.json';
const owner = JSON.parse(await fs.readFile(ownerReport));
const baseline = JSON.parse(await fs.readFile(path.join(proofs, 'rct2-framework-package-2026-09-05.json')));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function get(origin, name) {
  const response = await fetch(new URL(name, origin), { signal: AbortSignal.timeout(60000) });
  assert.equal(response.status, 200, origin + '/' + name);
  return Buffer.from(await response.arrayBuffer());
}
const files = [];
for (const file of baseline.files) {
  const before = await get(originalOrigin, file.name);
  const control = await get(controlOrigin, file.name);
  const after = await get(candidateOrigin, file.name);
  assert.equal(hash(before), file.sha256, `baseline drift: ${file.name}`);
  assert.deepEqual(control, before, `negative-control drift: ${file.name}`);
  if (file.name === 'openrct2-worker.js') {
    assert.deepEqual(after, await fs.readFile(path.join(game, 'web', file.name)));
    assert.notDeepEqual(after, before);
  } else assert.deepEqual(after, before, `unrelated change: ${file.name}`);
  files.push({ name: file.name, sha256: hash(after), changed: !after.equals(before) });
}
assert.equal(files.filter(file => file.changed).length, 1);
const data = JSON.parse(await get(candidateOrigin, '/game-data/status'));
assert.deepEqual(data, JSON.parse(await get(controlOrigin, '/game-data/status')));
assert.equal(data.ready, true);
assert.equal(data.mediaLibrary.entries[0].fileCount, owner.fileCount);
assert.equal(data.mediaLibrary.entries[0].totalSize, owner.totalSize);
assert.equal(data.mediaLibrary.entries[0].id, owner.entryId);
assert.equal(owner.originalFilesPreserved, 2953);
assert.equal(owner.requiredSceneryObjects, 474);
assert.equal(owner.packagedObjects, 2484);
assert.equal(owner.added.length, 22);
assert.equal(owner.fileCount, 2975);
assert.deepEqual(owner.missingAfter, []);
for (const origin of [originalOrigin, controlOrigin, candidateOrigin]) {
  for (const name of ['/data/', '/local-data/', ...owner.added.map(item => '/' + item.name),
    ...owner.added.map(item => '/OpenRCT2/object/installed/' + path.basename(item.name))]) {
    assert.equal((await fetch(new URL(name, origin))).status, 404, `private payload exposed: ${origin}${name}`);
  }
  // Unknown extensionless routes intentionally return the canonical launcher,
  // not a filesystem directory listing. Require its exact bytes, not just 200.
  for (const name of ['/ObjData/', '/OpenRCT2/object/installed/']) {
    assert.deepEqual(await get(origin, name), await get(origin, '/index.html'));
  }
}
const report = { observedAt: new Date().toISOString(), originalOrigin, controlOrigin, candidateOrigin, files, data, owner };
if (process.argv[2]) await fs.writeFile(process.argv[2], JSON.stringify(report, null, 2) + '\n');
console.log('OpenRCT2 private objects: 18 public files unchanged, exact repaired worker, identical control/candidate media, 22 private additions and direct-path privacy checks pass.');
