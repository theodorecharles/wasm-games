#!/usr/bin/env node
// Validate retained observations; this does not drive Chrome or inspect pixels.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = path.join(root, 'proofs');
const hashes = {};
function read(file) {
  const bytes = fs.readFileSync(path.join(directory, file));
  hashes[file] = crypto.createHash('sha256').update(bytes).digest('hex');
  return file.endsWith('.json') ? JSON.parse(bytes) : bytes;
}
function observation(stem, state) {
  const result = read(stem + '-2026-09-06.json');
  assert.ok(read(stem + '-2026-09-06.jpg').length > 10000);
  assert.ok(Number.isFinite(Date.parse(result.observedAt)));
  const data = result.observed.dataset;
  assert.equal(data.shellEngineState, state);
  assert.equal(data.wasmGameVariant, 'doom3-mp');
  assert.equal(data.d3wasmAudioState, 'running');
  assert.ok(Number(data.d3wasmAudioBuffers) > 0);
  assert.match(data.d3wasmAudioStarts, /^\d+$/);
  return {...result, starts:Number(data.d3wasmAudioStarts)};
}
const oldWorld = observation('d3-mp-audio-v6-baseline', 'gameplay');
const oldMenu = observation('d3-delta-controlled-fresh-disconnect', 'menu');
assert.equal(oldWorld.starts, 0);
assert.ok(oldMenu.starts > 0 && Date.parse(oldMenu.observedAt) > Date.parse(oldWorld.observedAt));
assert.match(oldMenu.observed.log, /\]disconnect\n----- Game Map Shutdown/);

const stages = ['delta-first', 'tomiko', 'reconnect-first', 'reconnect-running'];
const worlds = stages.map(stage => observation('d3-mp-audio-v7-' + stage, 'gameplay'));
for (let i = 0; i < worlds.length; i++) {
  assert.ok(worlds[i].starts > (i ? worlds[i - 1].starts : 0));
  if (i) assert.ok(Date.parse(worlds[i].observedAt) > Date.parse(worlds[i - 1].observedAt));
  assert.match(worlds[i].observed.log, /AudioRepairMarine joined the game/);
}
assert.match(worlds[0].observed.log, /Map: game\/mp\/d3dm2/);
assert.match(worlds[1].observed.log, /Map: game\/mp\/d3dm1/);
assert.match(worlds[2].observed.log, /\]reconnect/);
assert.ok(Date.parse(worlds[3].observedAt) - Date.parse(worlds[2].observedAt) >= 120000);
const menu = observation('d3-mp-audio-v7-disconnect', 'menu');
assert.match(menu.observed.log, /\]disconnect\n----- Game Map Shutdown/);
assert.ok(Date.parse(menu.observedAt) > Date.parse(worlds.at(-1).observedAt));

const status = ['tomiko', 'reconnect'].map(stage => read('d3-mp-audio-v7-' + stage + '-status-2026-09-06.json'));
for (const {status:value} of status) {
  assert.equal(value.state, 'running');
  assert.equal(value.map, 'game/mp/d3dm1');
  assert.equal(value.humans, 1);
  assert.equal(value.bots, 2);
  assert.equal(value.botStatus, 'ready');
  assert.equal(value.players[0].name, 'AudioRepairMarine');
}
assert.equal(status[0].status.startedAt, status[1].status.startedAt);
for (const file of ['d3-delta-controlled-final-idle-2026-09-06.json', 'd3-mp-audio-v7-final-idle-2026-09-06.json']) {
  const idle = read(file);
  assert.equal(idle.status.state, 'sleeping');
  for (const field of ['humans', 'browserPeers', 'bots']) assert.equal(idle.status[field], 0);
  assert.equal(idle.status.startedAt, null);
  assert.deepEqual(idle.resources, {sessions:[], nativeProcesses:[]});
}
const oldPackage = read('idtech4-modifier-package-2026-09-05.json');
const candidate = read('d3-mp-audio-package-2026-09-06.json');
const changed = Object.keys(candidate.verifiedImageFiles).filter(file => candidate.verifiedImageFiles[file] !== oldPackage.verifiedImageFiles[file]);
assert.deepEqual(changed, ['/opt/game-site/dhewm3-base.js', '/opt/game-site/dhewm3-base.wasm']);
const lifecycle = read('d3-mp-audio-http-2026-09-06.json');
assert.equal(lifecycle.image, candidate.image);
assert.equal(lifecycle.passed, true);
assert.equal(lifecycle.checks.length, 47);
const regression = read('d3-mp-audio-regression-2026-09-06.json');
assert.equal(regression.passed, true);
assert.equal(regression.results.length, 4);
for (const target of ['native', 'wasm']) {
  for (const negative of [false, true]) {
    const result = regression.results.find(row => row.target === target && row.negative === negative);
    assert.ok(result);
    assert.equal(result.cases.length, 20);
    assert.deepEqual(result.cases.filter(row => !row.passed).map(row => [row.mode, row.case]),
      negative ? [[0, 'join'], [0, 'multiplayer'], [0, 'rejoin']] : []);
  }
}
const proof = {scope:'Checks retained Chrome DOM audio counters/logs, chronological native map/reconnect observations, image-file identities and natural-idle records. JPEG hashes preserve manually inspected images; this script is not OCR, a listening test, held-input acceptance or a complete rendering oracle.',
  image:candidate.image, changedImageFiles:changed, gameplayStarts:worlds.map(row => row.starts),
  baselineStarts:oldWorld.starts, baselineAfterDisconnectStarts:oldMenu.starts,
  audibleQualityAccepted:false, fullRenderingAccepted:false, deployed:false, hashes, passed:true};
if (process.env.D3_AUDIO_EVIDENCE_PROOF) fs.writeFileSync(process.env.D3_AUDIO_EVIDENCE_PROOF, JSON.stringify(proof, null, 2) + '\n');
console.log(JSON.stringify(proof, null, 2));
