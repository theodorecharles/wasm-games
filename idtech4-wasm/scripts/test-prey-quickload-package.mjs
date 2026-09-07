#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {execFileSync, spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const command = (program, args) => execFileSync(program, args, {encoding:'utf8', maxBuffer:32*1024*1024}).trim();
const inspect = name => JSON.parse(command('docker', ['inspect', name]))[0];
const name = 'prey-quickload-proof-20260906';
const candidate = inspect(name), old = inspect('prey-trace-cache-proof-20260906');
const prior = JSON.parse(fs.readFileSync(path.join(root, 'proofs/prey-trace-cache-package-2026-09-06.json')));
assert.equal(old.Id, prior.id);
assert.equal(old.Image, prior.image);
assert.equal(old.State.Running, false, 'old candidate retained stopped on the same save origin');
assert.equal(candidate.State.Running, true);
assert.equal(candidate.RestartCount, 0);
assert.equal(candidate.HostConfig.ReadonlyRootfs, true);
assert.deepEqual(candidate.HostConfig.PortBindings, {'8088/tcp':[{HostIp:'127.0.0.1', HostPort:'32877'}]});
assert.equal(inspect('local/idtech4-wasm:prey-quickload-candidate').Id, candidate.Image);
const baseLayers = inspect(prior.image).RootFS.Layers;
const newLayers = inspect(candidate.Image).RootFS.Layers;
assert.deepEqual(newLayers.slice(0, baseLayers.length), baseLayers);
assert.equal(newLayers.length, baseLayers.length + 1);
const owner = candidate.Mounts.find(m => m.Destination === '/data/prey/base');
assert.equal(owner.Type, 'bind');
assert.equal(owner.Source, '/home/ted/wasm-game-data/prey/base');
assert.equal(owner.RW, false);
const inventoryCode = `const fs=require('fs'),path=require('path'),crypto=require('crypto'),result={};function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())walk(p);else if(e.isFile())result[p]=crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');}}for(const d of ['/opt/game-site','/opt/shared-shell','/opt/wasm-game-framework'])walk(d);process.stdout.write(JSON.stringify(result));`;
const files = JSON.parse(command('docker', ['exec', name, 'node', '-e', inventoryCode]));
assert.deepEqual(Object.keys(files).sort(), Object.keys(prior.files).sort());
const changed = Object.keys(files).filter(file => files[file] !== prior.files[file]).sort();
assert.deepEqual(changed, ['/opt/game-site/prey06.js', '/opt/game-site/prey06.wasm'], 'only the rebuilt native pair is packaged');
for (const [source, installed] of [
  ['.work/prey-d3wasm/output/emscripten/prey06.js', 'prey06.js'],
  ['.work/prey-d3wasm/output/emscripten/prey06.wasm', 'prey06.wasm'],
  ['site/game-adapter.js', 'game-adapter.js'], ['site/prey-worker.js', 'prey-worker.js']
]) assert.equal(hash(fs.readFileSync(path.join(root, source))), files['/opt/game-site/' + installed]);
for (const file of ['prey06.js', 'prey06.wasm', 'prey-worker.js', 'game-adapter.js', 'wasm-game.json', 'wasm-game-data.json']) {
  const response = await fetch('http://127.0.0.1:32877/' + file);
  assert.equal(response.status, 200);
  assert.equal(hash(Buffer.from(await response.arrayBuffer())), files['/opt/game-site/' + file]);
}
const status = await (await fetch('http://127.0.0.1:32877/game-data/status?game=prey')).json();
assert.equal(status.ready, true);
assert.equal(status.files.length, 13);
const source = JSON.parse(command(process.execPath, [path.join(root, 'scripts/test-prey-trace-source.mjs')]));
const sourceProof = JSON.parse(fs.readFileSync(path.join(root, 'proofs/prey-quickload-source-2026-09-06.json')));
assert.deepEqual(source, sourceProof);
const sourceDelta = command('git', ['-C', path.join(root, '.work/prey-d3wasm'),
  'diff', '--name-only', prior.source.tree, source.tree]).split('\n');
assert.deepEqual(sourceDelta, ['neo/framework/Session.cpp']);
const regression = JSON.parse(fs.readFileSync(path.join(root, 'proofs/prey-quickload-prompt-native-2026-09-06.json')));
assert.equal(regression.legacy, false);
for (const [field, file] of [['sessionSHA256', 'Session.cpp'], ['commonSHA256', 'Common.cpp'], ['inputSHA256', 'KeyInput.cpp']]) {
  assert.equal(regression[field], hash(fs.readFileSync(path.join(root, '.work/prey-d3wasm/neo/framework', file))));
}
assert.deepEqual(source.files, prior.source.files, 'trace-cache production files unchanged');
assert.equal(regression.fixtureSHA256, hash(fs.readFileSync(path.join(root, 'tests/prey-quickload-prompt.cpp'))));
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'prey-quickload-package-'));
function copy(file) {
  const target = path.join(temporary, file);
  fs.mkdirSync(path.dirname(target), {recursive:true});
  command('docker', ['cp', name + ':/opt/game-site/' + file, target]);
}
for (const file of ['game-adapter.js', 'wasm-game.json', 'wasm-game-data.json']) copy(file);
const config = JSON.parse(fs.readFileSync(path.join(temporary, 'wasm-game.json')));
for (const asset of new Set(Object.values(config.variants).flatMap(v => [v.icon, ...v.pwa.icons.map(i => i.src)]))) {
  assert.match(asset, /^\/[\w.-]+$/);
  copy(asset.slice(1));
}
const fixture = spawnSync(process.execPath, [path.join(root, 'scripts/test-adapter.mjs'), temporary], {
  encoding:'utf8', timeout:60000, env:{...process.env, IDTECH4_ADAPTER_SOURCE:path.join(temporary, 'game-adapter.js')}
});
assert.equal(fixture.status, 0, fixture.stdout + fixture.stderr);
assert.equal(fixture.signal, null);
const result = {
  scope:'Isolated Prey quickload prompt lookup repair. Exact canonical source/regression/native/HTTP identity; only native JS/Wasm change, trace-cache source and 45 other package files unchanged. Complete installed six-variant adapter suite. Actual Chrome proof is separate; no live promotion.',
  name, id:candidate.Id, image:candidate.Image, startedAt:candidate.State.StartedAt,
  port:32877, oldId:old.Id, oldImage:old.Image, changed,
  unchanged:Object.keys(files).length - changed.length, files, source, sourceDelta, ownerFiles:13,
  adapterFixture:{status:fixture.status, stdout:fixture.stdout, stderr:fixture.stderr}
};
const proof = path.join(root, 'proofs/prey-quickload-package-2026-09-06.json');
if (process.argv.includes('--record')) fs.writeFileSync(proof, JSON.stringify(result, null, 2) + '\n', {flag:'wx'});
else assert.deepEqual(result, JSON.parse(fs.readFileSync(proof, 'utf8')));
console.log(`Prey quickload source/native/HTTP identity, ${result.unchanged} unchanged files, six installed variants and 13 read-only owner files verified.`);
