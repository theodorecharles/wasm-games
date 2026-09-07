'use strict';
// Retained, rejected flush experiment only; not a release acceptance gate.
// Its package was sound, but it did not fix the guest's pending header write.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const root = path.resolve(__dirname, '..');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function inspect(name) {
  const [x] = JSON.parse(cp.execFileSync('docker', ['inspect', name], { encoding: 'utf8' }));
  return { id: x.Id, image: x.Image, startedAt: x.State.StartedAt, restarts: x.RestartCount,
    mounts: x.Mounts.map(m => ({ source: m.Source, destination: m.Destination, rw: m.RW })) };
}
function inventory(image) {
  const code = `const fs=require('fs'),p=require('path'),c=require('crypto'),out={};
  function walk(d){for(const n of fs.readdirSync(d).sort()){const f=p.join(d,n),s=fs.lstatSync(f);
  if(s.isDirectory())walk(f);else if(s.isFile())out[f]={bytes:s.size,sha256:c.createHash('sha256').update(fs.readFileSync(f)).digest('hex')};
  else if(s.isSymbolicLink())out[f]={link:fs.readlinkSync(f)};else throw Error(f)}}
  for(const d of ['/opt/game-site','/opt/shared-shell','/opt/wasm-game-framework'])walk(d);console.log(JSON.stringify(out));`;
  return JSON.parse(cp.execFileSync('docker', ['run', '--rm', '--read-only', '--network=none', '--entrypoint=node', image, '-e', code], { encoding: 'utf8' }));
}
async function main() {
  const baseline = inspect('simcity-timing-chrome-proof-20260906');
  const candidate = inspect('simcity-save-chrome-proof-20260906');
  const live = inspect('wasm-simcity2000');
  const original = JSON.parse(fs.readFileSync(path.join(root, 'proofs/simcity-package-2026-09-06.json'), 'utf8')).services.baseline;
  assert.equal(original.id, 'daa4746ab0ebc1ae8038ec3b34befee4c3138e8e0faa6ac24f80d97cb73cf721');
  assert.equal(original.startedAt, '2026-09-04T21:16:07.786148088Z');
  assert.ok([original.image, baseline.image].includes(live.image), 'the rejected experiment must not be installed');
  assert.equal(live.restarts, 0);
  assert.equal(baseline.image, 'sha256:1125605b4db5cd0746ad13dc2f5b108f17ca0f267a7d0baceadb41114590a96c');
  assert.deepEqual(candidate.mounts, [{ source: '/home/ted/wasm-game-data/dosbox', destination: '/data', rw: false }]);
  const before = inventory(baseline.image), after = inventory(candidate.image);
  assert.deepEqual(Object.keys(after), Object.keys(before));
  const changed = Object.keys(after).filter(f => JSON.stringify(before[f]) !== JSON.stringify(after[f]));
  assert.deepEqual(changed, ['/opt/game-site/dosbox.wasm']);
  assert.equal(before[changed[0]].sha256, '968e799bacb2a42c3e5260457e220c9a7421b55d095832db1bfe1b731aaf386f');
  assert.equal(after[changed[0]].sha256, '6aa423331610effe5c748b57e6623ee84ac5f6aa62b6b9ef48a004e9d7bf62c9');
  const http = [];
  for (const f of Object.keys(after).filter(f => f.startsWith('/opt/game-site/'))) {
    const relative = f.slice('/opt/game-site/'.length);
    const response = await fetch('http://127.0.0.1:32945/' + relative);
    if (relative === 'shared-shell/wasm-game-framework.json') { assert.equal(response.status, 404); continue; }
    assert.equal(response.status, 200, relative);
    const sha256 = hash(Buffer.from(await response.arrayBuffer()));
    assert.equal(sha256, after[f].sha256, relative);
    http.push({ relative, sha256 });
  }
  const ready = await (await fetch('http://127.0.0.1:32945/game-data/status')).json();
  assert.equal(ready.variant, 'simcity2000');
  assert.equal(ready.ready, true);
  assert.equal(ready.files.length, 30);
  for (const f of ['/data/', '/local-data/']) assert.equal((await fetch('http://127.0.0.1:32945' + f)).status, 404);
  const report = { observedAt: new Date().toISOString(), disposition: 'rejected experiment; no SimCity save fix', baseline, candidate, live,
    filesCompared: Object.keys(after).length, unchangedFiles: Object.keys(after).length - changed.length,
    changed: changed.map(f => ({ file: f, before: before[f], after: after[f] })), http,
    privateData: { ready: true, files: 30, rawRootsHidden: true } };
  fs.writeFileSync(path.join(root, 'proofs/simcity-save-package-2026-09-06.json'), JSON.stringify(report, null, 2) + '\n');
  console.log({ filesCompared: report.filesCompared, changed, httpChecks: http.length, experimentInstalled: false });
}
main().catch(error => { console.error(error); process.exitCode = 1; });
