'use strict';
// Optional installed-image proof; does not belong in the source-only suite.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const root = path.resolve(__dirname, '..');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const inventoryCode = `
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const result={};
function walk(dir){for(const name of fs.readdirSync(dir).sort()){
 const file=path.join(dir,name),stat=fs.lstatSync(file);
 if(stat.isDirectory())walk(file);
 else if(stat.isSymbolicLink())result[file]={link:fs.readlinkSync(file)};
 else if(stat.isFile())result[file]={bytes:stat.size,sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')};
 else throw Error('unexpected file type '+file);
}}
for(const dir of ['/opt/game-site','/opt/wasm-game-framework','/opt/shared-shell','/opt/quakejs','/opt/q3-server','/opt/q3-framework'])walk(dir);
console.log(JSON.stringify(result));`;
function inspect(container) {
  const [value] = JSON.parse(cp.execFileSync('docker', ['inspect', container], { encoding: 'utf8' }));
  return { id: value.Id, image: value.Image, startedAt: value.State.StartedAt, restarts: value.RestartCount,
    mounts: value.Mounts.map(x => ({ source: x.Source, destination: x.Destination, rw: x.RW })) };
}
function inventory(image) {
  return JSON.parse(cp.execFileSync('docker', ['run', '--rm', '--read-only', '--network=none', '--entrypoint=node', image, '-e', inventoryCode], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }));
}
async function main() {
  assert(process.argv.length === 2 || (process.argv.length === 3 && process.argv[2] === '--installed'), 'only --installed is supported');
  const installed = process.argv[2] === '--installed';
  const live = inspect('wasm-quake3');
  const services = {
    baseline: installed ? JSON.parse(fs.readFileSync(path.join(root, 'proofs/quake3-status-package-2026-09-06.json'), 'utf8')).services.baseline : live,
    candidate: inspect('quake3-join-status-chrome-proof-20260906'),
    ...(installed ? { installed: live } : {})
  };
  assert.equal(services.baseline.id, '83dea6db176a473bb20ee335e2db0b606ea3024bd97cc16a032e01f06dd7edaf');
  assert.equal(services.baseline.image, 'sha256:ff911b81783f37cee202166deee52e0ec7d6fa40cf0f171dbbb886b8f736b7cd');
  assert.equal(services.baseline.startedAt, '2026-09-04T19:51:57.852773313Z');
  assert.equal(services.baseline.restarts, 0);
  assert.equal(services.candidate.image, 'sha256:ea73d1bb7a5c7fae6e0a96101232f28dd8b56b7f1e19e7faeb1ab210d7c922cc');
  assert.deepEqual(services.candidate.mounts, [{ source: '/home/ted/wasm-game-data/quake3', destination: '/data', rw: false }]);
  if (installed) {
    assert.equal(live.image, services.candidate.image, 'install the exact accepted image');
    assert.deepEqual(live.mounts, services.baseline.mounts, 'preserve the owner-data bind');
    assert.notEqual(live.id, services.baseline.id);
    assert.equal(live.restarts, 0);
  }
  const before = inventory(services.baseline.image), after = inventory(services.candidate.image);
  assert.deepEqual(Object.keys(after), Object.keys(before));
  const changed = Object.keys(before).filter(file => JSON.stringify(before[file]) !== JSON.stringify(after[file]));
  assert.deepEqual(changed, ['/opt/game-site/game-adapter.js']);
  assert.equal(before[changed[0]].sha256, 'b2e7650e85df49b0fbdd7bbf497d19b1c606c0ac7eea379860d6d9060a3b3d41');
  assert.equal(after[changed[0]].sha256, '32af57eb6bb7901552d89340d3edf3fb2251295894dc8319da5b92676f443f82');
  for (const relative of ['games/quake3/site/game-adapter.js', 'dist/quake3/game-adapter.js']) {
    assert.equal(hash(fs.readFileSync(path.join(root, relative))), after[changed[0]].sha256);
  }
  const http = [];
  const files = Object.keys(after).filter(file => file.startsWith('/opt/game-site/'));
  assert.equal(files.length, 11);
  for (const file of files) {
    const relative = file.slice('/opt/game-site/'.length);
    const response = await fetch(`http://127.0.0.1:${installed ? 8083 : 32943}/${relative}`, { signal: AbortSignal.timeout(60000) });
    assert.equal(response.status, 200, relative);
    const sha256 = hash(Buffer.from(await response.arrayBuffer()));
    assert.equal(sha256, after[file].sha256, relative);
    assert.equal(sha256, hash(fs.readFileSync(path.join(root, 'dist/quake3', relative))), relative);
    http.push({ relative, sha256 });
  }
  const report = { observedAt: new Date().toISOString(), services, filesCompared: Object.keys(before).length,
    unchangedFiles: Object.keys(before).length - 1,
    changed: changed.map(file => ({ file, before: before[file], after: after[file] })), http };
  fs.writeFileSync(path.join(root, `proofs/quake3-status-${installed ? 'installed-' : ''}package-2026-09-06.json`), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ filesCompared: report.filesCompared, changed, httpChecks: http.length, liveUnchanged: !installed, installed }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
