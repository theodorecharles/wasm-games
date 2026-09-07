#!/usr/bin/env node
// Verify the actual isolated adapter-only package and exercise its installed bytes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {execFileSync, spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const command = (program, args) => execFileSync(program, args, {encoding:'utf8', maxBuffer:32*1024*1024}).trim();
const inspect = name => JSON.parse(command('docker', ['inspect', name]))[0];
const baseName = 'q4-quad-proof-20260906', name = 'q4-input-proof-20260906';
const installedCode = `const fs=require('fs'),path=require('path'),crypto=require('crypto'),result={};function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())walk(p);else if(e.isFile())result[p]=crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');}}for(const d of ['/opt/game-site','/opt/shared-shell','/opt/wasm-game-framework'])walk(d);process.stdout.write(JSON.stringify(result));`;
const inventory = container => JSON.parse(command('docker', ['exec', container, 'node', '-e', installedCode]));
const base = inspect(baseName), candidate = inspect(name);
const baseFiles = inventory(baseName), files = inventory(name);
assert.equal(base.Image, 'sha256:fc651e2b5697e8605f53566d1e1d67b600e09d3c7166a51d3292cabc519d932a');
assert.equal(candidate.Image, 'sha256:1bfbdfd01881aff9e821d850c912307780c36e3dad4c36c7d73c43b6fee67618');
assert.equal(base.State.Running, true);
assert.equal(candidate.State.Running, true);
assert.equal(candidate.RestartCount, 0);
assert.equal(candidate.HostConfig.ReadonlyRootfs, true);
assert.deepEqual(candidate.HostConfig.PortBindings, {'8088/tcp':[{HostIp:'127.0.0.1', HostPort:'32962'}]});
const owner = candidate.Mounts.find(m => m.Destination === '/data/q4base');
assert.equal(owner.Type, 'bind');
assert.equal(owner.Source, '/home/ted/wasm-game-data/quake4/q4base');
assert.equal(owner.RW, false);
const prior = JSON.parse(fs.readFileSync(path.join(root, 'proofs/quake4-quad-package-2026-09-06.json')));
assert.equal(base.Id, prior.id);
assert.deepEqual(baseFiles, prior.files, 'historical renderer candidate remains untouched');
assert.deepEqual(Object.keys(files).sort(), Object.keys(baseFiles).sort());
const changed = Object.keys(files).filter(file => files[file] !== baseFiles[file]);
assert.deepEqual(changed, ['/opt/game-site/game-adapter.js']);
assert.equal(Object.keys(files).length - changed.length, 46);
assert.equal(files[changed[0]], hash(fs.readFileSync(path.join(root, 'site/game-adapter.js'))));
assert.equal(files[changed[0]], 'ef44838bdad4bc65530ad030942e0f8ad7088f82c1a49b025c6368738a367b8a');
for (const file of ['game-adapter.js', 'openQ4-client_wasm32.js', 'openQ4-client_wasm32.wasm', 'q4-worker.js', 'wasm-game.json', 'wasm-game-data.json']) {
  const response = await fetch('http://127.0.0.1:32962/' + file);
  assert.equal(response.status, 200);
  assert.equal(hash(Buffer.from(await response.arrayBuffer())), files['/opt/game-site/' + file]);
}
const status = await (await fetch('http://127.0.0.1:32962/game-data/status?game=quake4')).json();
assert.equal(status.ready, true);
assert.equal(status.files.length, 32);

// Copy only the actual package's fixture inputs (not retail data or engine binaries).
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'q4-input-package-'));
function copy(file, container = name, target = path.join(temporary, file)) {
  fs.mkdirSync(path.dirname(target), {recursive:true});
  command('docker', ['cp', container + ':/opt/game-site/' + file, target]);
}
for (const file of ['game-adapter.js', 'wasm-game.json', 'wasm-game-data.json']) copy(file);
const config = JSON.parse(fs.readFileSync(path.join(temporary, 'wasm-game.json')));
const assets = new Set(Object.values(config.variants).flatMap(v => [v.icon, ...v.pwa.icons.map(i => i.src)]));
for (const asset of assets) {
  assert.match(asset, /^\/[\w.-]+$/);
  copy(asset.slice(1));
}
const oldAdapter = path.join(temporary, 'legacy-adapter.js');
copy('game-adapter.js', baseName, oldAdapter);
function fixture(adapter) {
  const r = spawnSync(process.execPath, [path.join(root, 'scripts/test-adapter.mjs'), temporary], {
    encoding:'utf8', timeout:60000, env:{...process.env, IDTECH4_ADAPTER_SOURCE:adapter}
  });
  assert.ifError(r.error);
  return {status:r.status, signal:r.signal, stdout:r.stdout, stderr:r.stderr};
}
const positive = fixture(path.join(temporary, 'game-adapter.js'));
const negative = fixture(oldAdapter);
assert.equal(positive.status, 0, positive.stderr);
assert.equal(positive.signal, null);
assert.equal(negative.status, 1);
assert.equal(negative.signal, null);
assert.match(negative.stderr, /doom3: ControlLeft modifier flags 1/);
const result = {
  scope:'Isolated adapter-only Q4 integration. Installed adapter exercised by the complete six-variant fixture; old installed adapter fails the physical-modifier guard. Native binaries and 46 other installed files unchanged. Not Chrome/native held-input or live-deployment acceptance.',
  name, id:candidate.Id, image:candidate.Image, startedAt:candidate.State.StartedAt,
  port:32962, changed, unchanged:46, files, ownerFiles:32,
  oldAdapterSHA256:baseFiles['/opt/game-site/game-adapter.js'], positive,
  negative:{...negative, stderr:negative.stderr.replaceAll(temporary, '<fixture>')},
  testSHA256:hash(fs.readFileSync(path.join(root, 'scripts/test-adapter.mjs')))
};
const proof = path.join(root, 'proofs/quake4-input-package-2026-09-06.json');
if (process.argv.includes('--record')) fs.writeFileSync(proof, JSON.stringify(result, null, 2) + '\n', {flag:'wx'});
else assert.deepEqual(result, JSON.parse(fs.readFileSync(proof, 'utf8')));
console.log('Installed adapter/HTTP bytes, 46 unchanged files, all six variants, failing old-adapter control and 32 owner files verified.');
