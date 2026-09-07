'use strict';
// Optional installed-image proof, separate from the source-only unit suite.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const root = path.resolve(__dirname, '..');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const baseline = 'wasm-rtcw-mp';
const candidate = 'rtcw-mp-array-final-proof-20260906';
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
for(const dir of ['/opt/game-site','/opt/wasm-game-framework','/opt/shared-shell','/opt/rtcw-server','/opt/rtcw-native','/opt/omni-bot'])walk(dir);
console.log(JSON.stringify(result));`;
function inventory(image) {
  // Running Omni-bot updates its own user/omni-bot.cfg. Compare immutable
  // packages, not that expected writable-layer match configuration.
  return JSON.parse(cp.execFileSync('docker', ['run', '--rm', '--read-only', '--network=none', '--entrypoint=node', image, '-e', inventoryCode], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }));
}
function inspect(container) {
  const [value] = JSON.parse(cp.execFileSync('docker', ['inspect', container], { encoding: 'utf8' }));
  return { id: value.Id, image: value.Image, startedAt: value.State.StartedAt, restarts: value.RestartCount,
    mounts: value.Mounts.map(x => ({ source: x.Source, destination: x.Destination, rw: x.RW })) };
}
async function main() {
  assert(process.argv.slice(2).every(value => value === '--installed'), 'only --installed is supported');
  const installed = process.argv.includes('--installed');
  const live = inspect(baseline);
  const services = {
    baseline: installed ? JSON.parse(fs.readFileSync(path.join(root, 'proofs/rtcw-mp-array-package-2026-09-06.json'), 'utf8')).services.baseline : live,
    candidate: inspect(candidate), singlePlayer: inspect('wasm-rtcw-sp'),
    ...(installed ? { installed: live } : {})
  };
  assert.equal(services.candidate.image, 'sha256:371a3f085e2406580cbabe9d4d11148432004ee2010f66962caee7dd304e2948');
  const before = inventory(services.baseline.image), after = inventory(services.candidate.image);
  assert.deepEqual(Object.keys(after), Object.keys(before));
  const changed = Object.keys(before).filter(file => JSON.stringify(before[file]) !== JSON.stringify(after[file]));
  assert.deepEqual(changed, ['/opt/game-site/iowolfmp.wasm']);
  assert.equal(before[changed[0]].sha256, 'bca4c562fa9aead46e9c2837e692ce26282bc8d5daa234ff7d58fc1d5ba1b12f');
  assert.equal(after[changed[0]].sha256, '78b669d405f4c79332ed13a0cc11fe85789a15ff6cb14e3784e0908faef247d0');
  assert.equal(hash(fs.readFileSync(path.join(root, 'dist/rtcw/iowolfmp.wasm'))), after[changed[0]].sha256);
  assert.equal(services.baseline.id, '799e603ab67b24b6163969e9bd67e0e0ad8da9a44f84fb3de999e95c410d19d2');
  assert.equal(services.singlePlayer.id, '0cae221aacf7a4e780eb05b7679bf75047c2f9fd40c399d6ad637b6fe846d7f5');
  assert.equal(services.singlePlayer.image, 'sha256:e6cc9c2be15c9009450dd341e7c25fefc04e868a6ed60be195e5ac6479a6c759');
  assert.equal(services.baseline.image, 'sha256:49c767bb52ad27762d91c500ba1c4cf6f1d294e816964ed3bc28a9d48476ec64');
  assert.equal(services.baseline.restarts, 0); assert.equal(services.singlePlayer.restarts, 0);
  assert.deepEqual(services.candidate.mounts, [{ source: '/home/ted/wasm-game-data/rtcw', destination: '/data', rw: false }]);
  if (installed) {
    assert.equal(live.image, services.candidate.image, 'installed MP must be the exact Chrome-accepted image');
    assert.deepEqual(live.mounts, services.baseline.mounts, 'the existing owner-data mount must be preserved');
    assert.equal(live.restarts, 0);
  }
  const http = [];
  for (const relative of ['game-adapter.js', 'wasm-game.json', 'framework-install.json', 'menus/mp_wasm.pk3', 'menus/sp_wasm.pk3',
    'iowolfmp.js', 'iowolfmp.wasm', 'iowolfsp.js', 'iowolfsp.wasm', 'qvm/mp/cgame.mp.qvm', 'qvm/mp/qagame.mp.qvm', 'qvm/mp/ui.mp.qvm']) {
    const response = await fetch(`http://127.0.0.1:${installed ? 18085 : 32942}/${relative}`);
    assert.equal(response.status, 200, relative);
    const sha256 = hash(Buffer.from(await response.arrayBuffer()));
    assert.equal(sha256, after['/opt/game-site/' + relative].sha256, relative);
    http.push({ relative, sha256 });
  }
  const source = path.join(root, '.sources/iortcw');
  const changedSource = cp.execFileSync('git', ['-C', source, 'diff', '--name-only', 'a22b0594044f76e9748083bf60afe075763e9ce1', 'HEAD'], { encoding: 'utf8' }).trim().split('\n');
  assert.deepEqual(changedSource, ['MP/code/renderer/tr_es2.c']);
  const commit = cp.execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  assert.equal(commit, JSON.parse(fs.readFileSync(path.join(root, 'sources.lock.json'), 'utf8')).rtcw.downstreamCommit);
  const report = { observedAt: new Date().toISOString(), commit, changedSource, filesCompared: Object.keys(before).length,
    unchangedFiles: Object.keys(before).length - 1, changed: changed.map(file => ({ file, before: before[file], after: after[file] })), services, http };
  fs.writeFileSync(path.join(root, `proofs/rtcw-mp-array-${installed ? 'installed-' : ''}package-2026-09-06.json`), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ filesCompared: report.filesCompared, changed, httpChecks: http.length, singlePlayerUnchanged: true, installed }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
