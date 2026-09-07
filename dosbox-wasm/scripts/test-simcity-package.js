'use strict';
// Optional installed-image proof. No owner data is written or copied.
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
for(const dir of ['/opt/game-site','/opt/wasm-game-framework','/opt/shared-shell'])walk(dir);
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
  const installed = process.argv.includes('--installed');
  const live = inspect('wasm-simcity2000');
  const services = {
    baseline: installed ? JSON.parse(fs.readFileSync(path.join(root, 'proofs/simcity-package-2026-09-06.json'), 'utf8')).services.baseline : live,
    candidate: inspect('simcity-timing-chrome-proof-20260906'),
    ...(installed ? { installed: live } : {})
  };
  assert.equal(services.baseline.id, 'daa4746ab0ebc1ae8038ec3b34befee4c3138e8e0faa6ac24f80d97cb73cf721');
  assert.equal(services.baseline.image, 'sha256:41790b80c75753cbe03ef523cf44490078101e33c8fada0678ea0eac15446a09');
  assert.equal(services.baseline.startedAt, '2026-09-04T21:16:07.786148088Z');
  assert.equal(services.baseline.restarts, 0);
  assert.deepEqual(services.candidate.mounts, [{ source: '/home/ted/wasm-game-data/dosbox', destination: '/data', rw: false }]);
  if (installed) {
    assert.equal(live.image, services.candidate.image, 'installed native package must be the exact accepted candidate');
    assert.deepEqual(live.mounts, services.baseline.mounts, 'promotion must preserve the existing data mount');
    assert.equal(live.restarts, 0);
  }
  const before = inventory(services.baseline.image), after = inventory(services.candidate.image);
  assert.deepEqual(Object.keys(after), Object.keys(before));
  const changed = Object.keys(before).filter(file => JSON.stringify(before[file]) !== JSON.stringify(after[file]));
  assert.deepEqual(changed, ['/opt/game-site/dosbox.js', '/opt/game-site/dosbox.wasm']);
  const expected = {
    'dosbox.js': ['f90ece402ce7e23e323281b55774d10f4dc8d6d2caa9b7fdf7f58935bdb3b104', '16fd8f9724796f15e3eac63a1126b2f4b441f3a059f517235d14698f4f4d25f8'],
    'dosbox.wasm': ['22208790aacc53590d2d1afdf1fb6e6d59e57a1b312e626090f524698e863782', '968e799bacb2a42c3e5260457e220c9a7421b55d095832db1bfe1b731aaf386f']
  };
  for (const [file, hashes] of Object.entries(expected)) {
    assert.equal(before['/opt/game-site/' + file].sha256, hashes[0]);
    assert.equal(after['/opt/game-site/' + file].sha256, hashes[1]);
    assert.equal(hash(fs.readFileSync(path.join(root, 'web/dist', file))), hashes[1]);
  }
  const http = [];
  for (const file of Object.keys(after).filter(file => file.startsWith('/opt/game-site/'))) {
    const relative = file.slice('/opt/game-site/'.length);
    const response = await fetch(`http://127.0.0.1:${installed ? 8025 : 32944}/${relative}`);
    if (relative === 'shared-shell/wasm-game-framework.json') {
      // Package integrity metadata is deliberately outside the shell's HTTP allowlist.
      assert.equal(response.status, 404, relative);
      continue;
    }
    assert.equal(response.status, 200, relative);
    const sha256 = hash(Buffer.from(await response.arrayBuffer()));
    assert.equal(sha256, after[file].sha256, relative);
    http.push({ relative, sha256 });
  }
  const origin = `http://127.0.0.1:${installed ? 8025 : 32944}`;
  const ready = await (await fetch(origin + '/game-data/status')).json();
  assert.equal(ready.variant, 'simcity2000');
  assert.equal(ready.ready, true);
  assert.equal(ready.files.length, 30);
  for (const url of ['/data/', '/local-data/']) assert.equal((await fetch(origin + url)).status, 404, url);
  const report = { observedAt: new Date().toISOString(), services, filesCompared: Object.keys(before).length,
    unchangedFiles: Object.keys(before).length - changed.length,
    changed: changed.map(file => ({ file, before: before[file], after: after[file] })), http,
    privateData: { variant: ready.variant, ready: ready.ready, files: ready.files.length, rawRootsHidden: true } };
  fs.writeFileSync(path.join(root, `proofs/simcity-${installed ? 'installed-' : ''}package-2026-09-06.json`), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ filesCompared: report.filesCompared, changed, httpChecks: http.length, liveUnchanged: !installed, installed }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
