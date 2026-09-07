'use strict';
// Optional installed candidate audit. Reads owner files and service metadata;
// never promotes an image, mutates a browser, or writes installed game data.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const root = path.resolve(__dirname, '..');
const proof = path.join(root, 'proofs');
const candidateName = 'dosbox-wasd-v3-chrome-proof-20260906';
const origin = 'http://127.0.0.1:32956';
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const docker = args => cp.execFileSync('docker', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
function services() {
  const ids = docker(['ps', '-aq']).trim().split(/\s+/).filter(Boolean);
  return Object.fromEntries(JSON.parse(docker(['inspect', ...ids]))
    .filter(x => !x.Name.startsWith('/dosbox-wasd-'))
    .map(x => [x.Name.slice(1), { id: x.Id, image: x.Image, startedAt: x.State.StartedAt, restarts: x.RestartCount,
      mounts: x.Mounts.map(m => ({ source: m.Source, destination: m.Destination, rw: m.RW })) }]));
}
function ownerFiles() {
  const policy = JSON.parse(fs.readFileSync(path.join(root, 'web/wasm-game-data.json'), 'utf8'));
  const files = {};
  for (const variant of Object.values(policy.variants)) for (const spec of variant.files) {
    const bytes = fs.readFileSync(path.join('/home/ted/wasm-game-data/dosbox', spec.path));
    const sha256 = hash(bytes);
    assert.equal(sha256, spec.sha256, spec.path);
    assert.equal(bytes.length, spec.size, spec.path);
    files[spec.path] = { bytes: bytes.length, sha256 };
  }
  return files;
}
function inventory(container) {
  const code = `const fs=require('fs'),p=require('path'),c=require('crypto'),out={};
  function walk(d){for(const n of fs.readdirSync(d).sort()){const f=p.join(d,n),s=fs.lstatSync(f);
  if(s.isDirectory())walk(f);else if(s.isFile())out[f]={bytes:s.size,sha256:c.createHash('sha256').update(fs.readFileSync(f)).digest('hex')};
  else if(s.isSymbolicLink())out[f]={link:fs.readlinkSync(f)};else throw Error(f)}}
  for(const d of ['/opt/game-site','/opt/shared-shell','/opt/wasm-game-framework'])walk(d);console.log(JSON.stringify(out));`;
  return JSON.parse(docker(['exec', container, 'node', '-e', code]));
}
async function main() {
  const snapshotPath = path.join(proof, 'wasd-before-2026-09-06.json');
  if (process.argv.includes('--snapshot')) {
    assert.ok(!fs.existsSync(snapshotPath), 'preserve the original snapshot');
    const before = { observedAt: new Date().toISOString(), services: services(), ownerFiles: ownerFiles() };
    fs.writeFileSync(snapshotPath, JSON.stringify(before, null, 2) + '\n');
    console.log({ services: Object.keys(before.services).length, ownerFiles: Object.keys(before.ownerFiles).length });
    return;
  }
  const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
  const currentServices = services();
  // Docker does not promise an order for the mount array.
  const ordered = value => value && { ...value, mounts: value.mounts.slice().sort((a, b) => a.destination.localeCompare(b.destination)) };
  for (const [name, value] of Object.entries(snapshot.services)) assert.deepEqual(ordered(currentServices[name]), ordered(value), name);
  const currentOwners = ownerFiles();
  assert.deepEqual(currentOwners, snapshot.ownerFiles, 'all installed owner files remain unchanged');
  const [candidate] = JSON.parse(docker(['inspect', candidateName]));
  assert.equal(candidate.Image, 'sha256:f27cffdaa831c1e8d2d45cf3a3cfe0d417f56dc4fa031170d17129c010c658c0');
  assert.equal(candidate.HostConfig.ReadonlyRootfs, true);
  assert.deepEqual(candidate.Mounts.map(m => ({ source: m.Source, destination: m.Destination, rw: m.RW })),
    [{ source: '/home/ted/wasm-game-data/dosbox', destination: '/data', rw: false }]);
  const before = inventory('wasm-dosbox-suite'), after = inventory(candidateName);
  for (const file of Object.keys(before)) assert.ok(after[file], `missing ${file}`);
  const changed = Object.keys(before).filter(file => JSON.stringify(before[file]) !== JSON.stringify(after[file]));
  const added = Object.keys(after).filter(file => !before[file]);
  assert.deepEqual(changed, ['/opt/game-site/game-adapter.js', '/opt/game-site/wasm-game.json']);
  assert.deepEqual(added, ['/opt/game-site/browser-pointer.conf', '/opt/game-site/gta-sound.ini']);
  for (const file of [...changed, ...added]) assert.equal(after[file].sha256,
    hash(fs.readFileSync(path.join(root, 'web', path.basename(file)))), file);
  for (const [file, sha256] of Object.entries({
    'dosbox.js': 'f90ece402ce7e23e323281b55774d10f4dc8d6d2caa9b7fdf7f58935bdb3b104',
    'dosbox.wasm': '70486266d6a794767154f2175f64f58b1f4dc8065d5f3a1fc21f269f38650dd3'
  })) assert.equal(after['/opt/game-site/' + file].sha256, sha256, 'keep the live platformer engine unchanged');
  const http = [];
  for (const file of Object.keys(after).filter(file => file.startsWith('/opt/game-site/'))) {
    const relative = file.slice('/opt/game-site/'.length);
    const response = await fetch(origin + '/' + relative);
    if (relative === 'shared-shell/wasm-game-framework.json') { assert.equal(response.status, 404); continue; }
    assert.equal(response.status, 200, relative);
    const sha256 = hash(Buffer.from(await response.arrayBuffer()));
    assert.equal(sha256, after[file].sha256, relative);
    http.push({ relative, sha256 });
  }
  const ready = [];
  for (const [variant, files] of Object.entries({ jill1: 28, jill2: 27, jill3: 34, jazz: 66,
    duke1: 55, duke2: 7, gta: 89, nfs: 360, simcity2000: 30 })) {
    const response = await fetch(origin + '/game-data/status?variant=' + variant);
    assert.equal(response.status, 200);
    const status = await response.json();
    assert.equal(status.variant, variant);
    assert.equal(status.ready, true, variant);
    assert.equal(status.files.length, files, variant);
    ready.push({ variant, files, ready: true });
  }
  for (const route of ['/data/', '/local-data/']) assert.equal((await fetch(origin + route)).status, 404);
  const report = { observedAt: new Date().toISOString(), disposition: 'isolated controls candidate; not installed',
    candidate: { name: candidateName, image: candidate.Image, origin, readOnlyRoot: true, readOnlyData: true },
    filesCompared: Object.keys(before).length, unchangedFiles: Object.keys(before).length - changed.length,
    changed: changed.map(file => ({ file, before: before[file], after: after[file] })),
    added: added.map(file => ({ file, ...after[file] })), http, ready, rawDataRootsHidden: true,
    unchangedServices: Object.keys(snapshot.services).length, unchangedOwnerFiles: Object.keys(currentOwners).length };
  const reportPath = path.join(proof, 'wasd-package-2026-09-06.json');
  if (fs.existsSync(reportPath)) {
    const retained = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    assert.deepEqual({ ...report, observedAt: retained.observedAt }, retained,
      'a rerun must match the original package observation');
  } else fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log({ filesCompared: report.filesCompared, changed, added, httpChecks: http.length,
    unchangedServices: report.unchangedServices, unchangedOwnerFiles: report.unchangedOwnerFiles });
}
main().catch(error => { console.error(error); process.exitCode = 1; });
