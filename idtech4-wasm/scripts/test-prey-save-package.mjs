#!/usr/bin/env node
// Identity audit for the existing Prey menu/cache candidate used by save tests.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const command = (program, args) => execFileSync(program, args, {encoding:'utf8', maxBuffer:32*1024*1024}).trim();
const priorPath = 'proofs/prey-menu-cache-build-2026-09-05.json';
const prior = JSON.parse(fs.readFileSync(path.join(root, priorPath)));
const name = 'prey-menu-cache-proof-20260905';
const candidate = JSON.parse(command('docker', ['inspect', name]))[0];
assert.equal(candidate.Id, prior.container);
assert.equal(candidate.Image, prior.image);
assert.equal(candidate.State.Running, true);
assert.equal(candidate.RestartCount, 0);
assert.equal(candidate.State.StartedAt, '2026-09-05T18:21:51.711095249Z');
assert.deepEqual(candidate.HostConfig.PortBindings, {'8088/tcp':[{HostIp:'127.0.0.1', HostPort:'32877'}]});
const owner = candidate.Mounts.find(m => m.Destination === '/data/prey/base');
assert.equal(owner.Type, 'bind');
assert.equal(owner.Source, '/home/ted/wasm-game-data/prey/base');
assert.equal(owner.RW, false);
const inventoryCode = `const fs=require('fs'),path=require('path'),crypto=require('crypto'),result={};function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())walk(p);else if(e.isFile())result[p]=crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');}}for(const d of ['/opt/game-site','/opt/shared-shell','/opt/wasm-game-framework'])walk(d);process.stdout.write(JSON.stringify(result));`;
const files = JSON.parse(command('docker', ['exec', name, 'node', '-e', inventoryCode]));
for (const artifact of prior.artifacts) assert.equal(files['/opt/game-site/' + artifact.file], artifact.imageSHA256);
const sources = {};
for (const [source, installed] of [
  ['.work/prey-d3wasm/output/emscripten/prey06.js', 'prey06.js'],
  ['.work/prey-d3wasm/output/emscripten/prey06.wasm', 'prey06.wasm'],
  ['site/prey-worker.js', 'prey-worker.js']
]) {
  sources[source] = hash(fs.readFileSync(path.join(root, source)));
  assert.equal(sources[source], files['/opt/game-site/' + installed]);
}
sources['patches/prey2006-browser.patch'] = hash(fs.readFileSync(path.join(root, 'patches/prey2006-browser.patch')));
assert.equal(sources['patches/prey2006-browser.patch'], prior.preyPatchSHA256);
for (const file of ['prey06.js', 'prey06.wasm', 'prey-worker.js', 'game-adapter.js', 'wasm-game.json', 'wasm-game-data.json']) {
  const response = await fetch('http://127.0.0.1:32877/' + file);
  assert.equal(response.status, 200);
  assert.equal(hash(Buffer.from(await response.arrayBuffer())), files['/opt/game-site/' + file]);
}
const status = await (await fetch('http://127.0.0.1:32877/game-data/status?game=prey')).json();
assert.equal(status.ready, true);
assert.ok(status.files.length > 0);
const result = {
  scope:'Unchanged isolated Prey menu/cache candidate used for Chrome save testing. Current Prey native artifacts/worker/patch and historical installed artifact identity verified; not current shared-adapter integration or gameplay acceptance.',
  name, id:candidate.Id, image:candidate.Image, startedAt:candidate.State.StartedAt,
  port:32877, ownerFiles:status.files.length, files, sources,
  historicalProofSHA256:hash(fs.readFileSync(path.join(root, priorPath)))
};
const proof = path.join(root, 'proofs/prey-save-package-2026-09-06.json');
if (process.argv.includes('--record')) fs.writeFileSync(proof, JSON.stringify(result, null, 2) + '\n', {flag:'wx'});
else assert.deepEqual(result, JSON.parse(fs.readFileSync(proof, 'utf8')));
console.log(`Prey identity, ${Object.keys(files).length} installed files, source/HTTP artifacts and ${status.files.length} read-only owner files verified.`);
