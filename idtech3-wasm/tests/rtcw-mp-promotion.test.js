'use strict';
// Read-only Docker checks; writes diagnostic records, never changes services.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const proofRoot = path.resolve(__dirname, '../proofs');
const beforeFile = path.join(proofRoot, 'rtcw-mp-pre-promotion-containers-2026-09-06.json');
const target = '/wasm-rtcw-mp';
const oldImage = 'sha256:49c767bb52ad27762d91c500ba1c4cf6f1d294e816964ed3bc28a9d48476ec64';
const newImage = 'sha256:371a3f085e2406580cbabe9d4d11148432004ee2010f66962caee7dd304e2948';
function inventory() {
  const ids = cp.execFileSync('docker', ['ps', '-aq'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
  assert(ids.length > 0, 'no containers found');
  return JSON.parse(cp.execFileSync('docker', ['inspect', ...ids], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }))
    .map(value => ({ name: value.Name, id: value.Id, image: value.Image, startedAt: value.State.StartedAt,
      restarts: value.RestartCount, status: value.State.Status,
      // Docker does not promise mount-array ordering.
      mounts: value.Mounts.map(m => ({ type: m.Type, source: m.Source, destination: m.Destination, rw: m.RW }))
        .sort((a, b) => a.destination.localeCompare(b.destination)) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
const mode = process.argv[2];
assert.equal(process.argv.length, 3, 'use --record-before or --verify');
assert(['--record-before', '--verify'].includes(mode));
const current = inventory();
const live = current.find(value => value.name === target);
assert(live, 'live MP service missing');
assert.equal(live.status, 'running');
assert.equal(live.restarts, 0);
if (mode === '--record-before') {
  assert.equal(live.image, oldImage);
  fs.writeFileSync(beforeFile, JSON.stringify({ observedAt: new Date().toISOString(), containers: current }, null, 2) + '\n', { flag: 'wx' });
  console.log(`Recorded ${current.length} containers; existing records are never overwritten.`);
} else {
  const before = JSON.parse(fs.readFileSync(beforeFile, 'utf8'));
  const old = before.containers.find(value => value.name === target);
  assert.equal(old.image, oldImage);
  assert.equal(live.image, newImage);
  assert.notEqual(live.id, old.id);
  assert.deepEqual(live.mounts, old.mounts);
  const unchanged = before.containers.filter(value => value.name !== target);
  assert.deepEqual(current.filter(value => value.name !== target), unchanged, 'only the MP container may change');
  const sp = current.find(value => value.name === '/wasm-rtcw-sp');
  assert.equal(sp.id, '0cae221aacf7a4e780eb05b7679bf75047c2f9fd40c399d6ad637b6fe846d7f5');
  const report = { observedAt: new Date().toISOString(), before: old, installed: live,
    unchangedContainers: unchanged.length, singlePlayer: sp, dataMountPreserved: true,
    comparison: 'Exact IDs, images, starts, restart counts, status and mounts; mounts sorted by destination.' };
  fs.writeFileSync(path.join(proofRoot, 'rtcw-mp-promotion-2026-09-06.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}
