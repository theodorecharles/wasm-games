#!/usr/bin/env node
// Validate retained native telemetry and DOM evidence, not screenshot pixels.
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
function observation(name, state = 'gameplay') {
  const stem = 'd3-light-clock-' + name + '-2026-09-06';
  const record = read(stem + '.json');
  const screenshot = read(stem + '.jpg');
  assert.ok(screenshot.length > 10000);
  const data = record.observed.dataset;
  assert.equal(data.shellEngineState, state);
  assert.equal(data.wasmGameVariant, 'doom3-mp');
  assert.equal(data.d3wasmAudioState, 'running');
  assert.ok(Number(data.d3wasmAudioBuffers) > 0);
  const rows = [...record.observed.log.matchAll(/D3LIGHT (\{[^\n]+\})/g)].map(match => JSON.parse(match[1]));
  assert.ok(rows.length >= 8);
  return {...record, rows, view:rows.at(-1), starts:Number(data.d3wasmAudioStarts)};
}
function cameraPair(left, right, tolerance = 0) {
  assert.ok(left.health > 0 && right.health > 0, 'living views only');
  assert.equal(left.health, right.health, 'same health');
  assert.equal(left.spectating, 0);
  assert.equal(right.spectating, 0);
  for (const field of ['origin', 'axis', 'fov']) {
    assert.equal(left[field].length, right[field].length);
    left[field].forEach((value, index) => assert.ok(Math.abs(value - right[field][index]) <= tolerance, field));
  }
}
function clockTail(record, advancing) {
  const rows = record.rows.slice(-8);
  assert.ok(rows.at(-1).at - rows[0].at >= 3000);
  for (let index = 1; index < rows.length; index++) {
    assert.ok(rows[index].at > rows[index - 1].at);
    if (advancing) assert.ok(rows[index].clock > rows[index - 1].clock);
    else assert.equal(rows[index].clock, rows[index - 1].clock);
  }
  return rows.map(row => row.clock);
}
const pair = ['normal', 'zero', 'restored'].map(name => observation('pair-' + name));
assert.deepEqual(pair.map(row => row.view.mode), [-1, 0, -1]);
for (const record of pair) {
  cameraPair(pair[0].view, record.view);
  assert.equal(record.view.health, 33);
  assert.equal(record.view.samples, 192);
  assert.equal(record.view.nonzero, 192); // Original amplitudes, BEFORE override.
  assert.ok(record.view.maxAmplitude > 0);
}
for (let index = 1; index < pair.length; index++) {
  assert.ok(Date.parse(pair[index].observedAt) > Date.parse(pair[index - 1].observedAt));
  assert.ok(pair[index].view.clock > pair[index - 1].view.clock);
  assert.ok(pair[index].starts > pair[index - 1].starts);
}
assert.match(pair[1].observed.log, /\]lightzero\n/);
assert.match(pair[2].observed.log, /\]lightnormal\n/);
assert.ok(Date.parse(pair[2].observedAt) - Date.parse(pair[0].observedAt) < 1000);
const dead = structuredClone(pair[0].view); dead.health = 0;
assert.throws(() => cameraPair(pair[0].view, dead));
const moved = structuredClone(pair[0].view); moved.origin[0] += 1;
assert.throws(() => cameraPair(pair[0].view, moved));

const legacy = ['first', 'return'].map(name => observation('legacy-' + name));
cameraPair(legacy[0].view, legacy[1].view);
const legacyClocks = legacy.map(record => clockTail(record, false));
for (const record of legacy) {
  assert.equal(record.starts, 0);
  assert.equal(record.view.mode, -1);
  assert.equal(record.view.health, 100);
  assert.equal(record.view.samples, 90);
  assert.doesNotMatch(record.observed.log, /\]light(?:zero|normal)\n/);
}
assert.equal(legacy[0].view.nonzero, 90);
assert.ok(legacy[0].view.maxAmplitude > 0);
for (const row of legacy[1].rows.slice(-8)) {
  cameraPair(legacy[0].view, row);
  assert.equal(row.samples, 90);
  assert.equal(row.nonzero, 0);
  assert.equal(row.maxAmplitude, 0);
}
assert.match(legacy[1].observed.log, /Map: game\/mp\/d3dm1[\s\S]*Map: game\/mp\/d3dm2/);
assert.equal((legacy[1].observed.log.match(/Vote passed/g) || []).length, 2);

const fixed = ['delta', 'tomiko', 'return'].map(name => observation('fixed-' + name));
const fixedClocks = fixed.map(record => clockTail(record, true));
cameraPair(fixed[0].view, fixed[2].view, 0.0001);
for (const record of fixed) {
  assert.equal(record.view.health, 100);
  assert.equal(record.view.spectating, 0);
  assert.equal(record.view.mode, -1);
  assert.ok(record.view.nonzero > 0 && record.view.maxAmplitude > 0);
  assert.ok(record.starts > 0);
  assert.doesNotMatch(record.observed.log, /\]light(?:zero|normal)\n/);
}
assert.ok(fixed[0].starts < fixed[1].starts && fixed[1].starts < fixed[2].starts);
assert.match(fixed[2].observed.log, /Map: game\/mp\/d3dm2[\s\S]*Map: game\/mp\/d3dm1[\s\S]*Map: game\/mp\/d3dm2/);
assert.equal((fixed[2].observed.log.match(/Vote passed/g) || []).length, 2);
const packageProof = read('d3-light-clock-package-2026-09-06.json');
assert.equal(packageProof.passed, true);
assert.deepEqual(packageProof.changedBetweenDiagnostics, ['/opt/game-site/dhewm3-base.wasm']);
for (const [mode, stages, maps, player] of [
  ['legacy', ['vote', 'return'], ['d3dm1', 'd3dm2'], 'LegacyClockMarine'],
  ['fixed', ['start', 'tomiko', 'return'], ['d3dm2', 'd3dm1', 'd3dm2'], 'FixedRoundtripMarine'],
]) {
  let serverStart;
  for (let index = 0; index < stages.length; index++) {
    const result = read(`d3-light-clock-${mode}-${stages[index]}-status-2026-09-06.json`);
    assert.equal(result.image, packageProof.results[mode].image);
    const status = result.status;
    assert.equal(status.state, 'running');
    assert.equal(status.map, 'game/mp/' + maps[index]);
    assert.equal(status.humans, 1);
    assert.equal(status.browserPeers, 1);
    assert.equal(status.bots, 2);
    assert.equal(status.players[0].name, player);
    if (index) assert.equal(status.startedAt, serverStart);
    serverStart = status.startedAt;
  }
  const menu = observation(mode + '-disconnect', 'menu');
  assert.match(menu.observed.log, /\]disconnect\n----- Game Map Shutdown/);
  const idle = read(`d3-light-clock-${mode}-final-idle-2026-09-06.json`);
  assert.equal(idle.image, packageProof.results[mode].image);
  assert.equal(idle.status.state, 'sleeping');
  assert.equal(idle.status.startedAt, null);
  for (const field of ['humans', 'browserPeers', 'bots']) assert.equal(idle.status[field], 0);
  assert.deepEqual(idle.resources, {sessions:[], nativeProcesses:[]});
  assert.ok(Date.parse(idle.observedAt) > Date.parse(menu.observedAt));
}
const proof = {
  scope:'Retained actual Chrome DOM/native telemetry, matched camera/health guards, both native map roundtrips and natural-idle cleanup. Screenshots are manually inspected and hashed, not an automated pixel oracle. Test-only amplitude zero is distinct from the unmodified-amplitude legacy mixer negative control.',
  pair:pair.map(record => ({observedAt:record.observedAt, view:record.view, starts:record.starts})),
  legacy:legacy.map((record, index) => ({observedAt:record.observedAt, view:record.view, clockTail:legacyClocks[index]})),
  fixed:fixed.map((record, index) => ({observedAt:record.observedAt, view:record.view, clockTail:fixedClocks[index], starts:record.starts})),
  cameraGuardNegativeControls:['dead player rejected', 'moved camera rejected'],
  limitations:['legacy return screenshot coincides with beginning of native match-start restart', 'roundtrips use different cameras between legacy and repaired clients', 'no full-map, held-input, listening or production acceptance'],
  deployed:false, fullRenderingAccepted:false, hashes, passed:true,
};
if (process.env.D3_LIGHT_EVIDENCE_PROOF) fs.writeFileSync(process.env.D3_LIGHT_EVIDENCE_PROOF, JSON.stringify(proof, null, 2) + '\n');
console.log(JSON.stringify(proof, null, 2));
