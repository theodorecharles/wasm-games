'use strict';
// Read-only deployment/data audit. Only diagnostic reports are written.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const proofRoot = path.resolve(__dirname, '../proofs');
const beforeFile = path.join(proofRoot, 'quake3-release-before-2026-09-06.json');
const dataRoot = '/home/ted/wasm-game-data/quake3';
const target = '/wasm-quake3';
const oldImage = 'sha256:ff911b81783f37cee202166deee52e0ec7d6fa40cf0f171dbbb886b8f736b7cd';
const newImage = 'sha256:ea73d1bb7a5c7fae6e0a96101232f28dd8b56b7f1e19e7faeb1ab210d7c922cc';
function containers() {
  const ids = cp.execFileSync('docker', ['ps', '-aq'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
  assert(ids.length > 0);
  return JSON.parse(cp.execFileSync('docker', ['inspect', ...ids], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }))
    .map(c => ({ name: c.Name, id: c.Id, image: c.Image, startedAt: c.State.StartedAt,
      status: c.State.Status, restarts: c.RestartCount,
      mounts: c.Mounts.map(m => ({ type: m.Type, source: m.Source, destination: m.Destination, rw: m.RW }))
        .sort((a, b) => a.destination.localeCompare(b.destination)) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
async function ownerFiles(directory = dataRoot) {
  const result = [];
  for (const name of fs.readdirSync(directory).sort()) {
    const file = path.join(directory, name), stat = fs.lstatSync(file);
    if (stat.isDirectory()) result.push(...await ownerFiles(file));
    else {
      assert(stat.isFile() || stat.isSymbolicLink(), file);
      const hash = crypto.createHash('sha256');
      let bytes = 0;
      for await (const chunk of fs.createReadStream(file)) { bytes += chunk.length; hash.update(chunk); }
      result.push({ file: path.relative(dataRoot, file), bytes, sha256: hash.digest('hex'),
        ...(stat.isSymbolicLink() ? { link: fs.readlinkSync(file) } : {}) });
    }
  }
  return result;
}
async function main() {
  const mode = process.argv[2];
  assert.equal(process.argv.length, 3);
  assert(['--record-before', '--verify'].includes(mode));
  const current = containers(), live = current.find(c => c.name === target);
  assert.equal(live.status, 'running'); assert.equal(live.restarts, 0);
  assert.equal(live.image, mode === '--record-before' ? oldImage : newImage);
  assert.deepEqual(live.mounts, [{ type: 'bind', source: dataRoot, destination: '/data', rw: true }]);
  const files = await ownerFiles();
  assert.equal(files.filter(f => /^pak[0-8]\.pk3$/.test(f.file)).length, 9);
  const response = await fetch('http://127.0.0.1:8083/status', { signal: AbortSignal.timeout(10000) });
  assert.equal(response.status, 200);
  const status = await response.json();
  assert.equal(status.error, null);
  const report = { observedAt: new Date().toISOString(), containers: current, ownerFiles: files, status };
  if (mode === '--record-before') {
    assert.equal(status.state, 'sleeping'); assert.equal(status.humans, 0);
    fs.writeFileSync(beforeFile, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  } else {
    const before = JSON.parse(fs.readFileSync(beforeFile, 'utf8'));
    assert.equal(before.containers.find(c => c.name === target).image, oldImage);
    assert.notEqual(live.id, before.containers.find(c => c.name === target).id);
    assert.deepEqual(current.filter(c => c.name !== target), before.containers.filter(c => c.name !== target),
      'only Quake III may be recreated');
    assert.deepEqual(files, before.ownerFiles, 'preserve every owner file and symlink');
    report.unchangedContainers = current.length - 1;
    fs.writeFileSync(path.join(proofRoot, 'quake3-release-installed-2026-09-06.json'), JSON.stringify(report, null, 2) + '\n');
  }
  console.log(JSON.stringify({ mode, ownerFiles: files.length, unchangedContainers: report.unchangedContainers, live }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
