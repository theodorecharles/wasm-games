#!/usr/bin/env node
// Validate retained Chrome observations, not a synthetic save implementation.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const proofs = path.join(root, 'proofs');
const files = {};
function read(file) {
  const bytes = fs.readFileSync(path.join(proofs, file));
  files[file] = {bytes:bytes.length, sha256:crypto.createHash('sha256').update(bytes).digest('hex')};
  return JSON.parse(bytes);
}
function observation(variant, stage) {
  const stem = `d3-v7-${variant}-${stage}-2026-09-06`;
  const record = read(stem + '.json');
  assert.ok(Number.isFinite(Date.parse(record.observedAt)), stem);
  const image = fs.readFileSync(path.join(proofs, stem + '.jpg'));
  assert.ok(image.length > 2000, 'retained screenshot exists: ' + stem);
  assert.equal(image.readUInt16BE(0), 0xffd8, 'JPEG: ' + stem);
  files[stem + '.jpg'] = {bytes:image.length, sha256:crypto.createHash('sha256').update(image).digest('hex')};
  assert.equal(record.observed.dataset.wasmGameVariant, variant === 'sp' ? 'doom3' : 'roe');
  assert.equal(record.observed.dataset.wasmGameMode, 'single');
  assert.doesNotMatch(record.observed.log, /Savegame Version mismatch|aborting loadgame|invalid savegame|Couldn't open savegame|Save\/config persistence warning|RuntimeError|memory access out of bounds|Aborted\(/i);
  return record;
}
function positions(record) {
  return [...record.observed.log.matchAll(/^\((-?[\d.]+) (-?[\d.]+) (-?[\d.]+)\) (-?[\d.]+)$/gm)]
    .map(match => match.slice(1).map(Number));
}
function validatePositions(first, moved, second) {
  assert.notDeepEqual(moved, first, 'native position changes before comparison load');
  assert.ok(first[0] - moved[0] > 1, 'measurable normal-key displacement');
  assert.deepEqual(moved.slice(1), first.slice(1));
  assert.deepEqual(second, first, 'original saved coordinate and yaw restored exactly at printed precision');
}
function validateRestore(record, map, count) {
  assert.equal(record.observed.dataset.shellEngineState, 'gameplay');
  const markers = record.observed.log.match(/----- Game Map Init SaveGame -----/g) || [];
  assert.equal(markers.length, count, 'actual native save restore count');
  assert.ok(record.observed.log.includes('Map: ' + map));
  assert.ok(record.observed.log.includes('msec to load ' + map));
  const afterRestore = record.observed.log.slice(record.observed.log.lastIndexOf('----- Game Map Init SaveGame -----'));
  assert.doesNotMatch(afterRestore, /----- Game Map Init -----|entities spawned|SpawnPlayer: 0/,
    'do not accept a fallback new-map spawn as restoration');
}
const stages = ['main-menu', 'intro', 'first-world', 'save-name', 'saved', 'reload-launcher',
  'reload-menu', 'reload-selected', 'restored', 'restored-position', 'moved-position',
  'second-selected', 'second-restored', 'second-position', 'final-pause', 'final-resume', 'quit-menu'];
const results = [];
for (const [variant, nativeVariant, map, expectedPosition] of [
  ['sp', 'doom3', 'game/mars_city1', [1267, -1501, 68.25, 180]],
  ['roe', 'roe', 'game/erebus1', [4456, 6888, 481.16, 180]],
]) {
  const records = Object.fromEntries(stages.map(stage => [stage, observation(variant, stage)]));
  for (let i = 1; i < stages.length; i++) {
    assert.ok(Date.parse(records[stages[i]].observedAt) > Date.parse(records[stages[i - 1]].observedAt), 'ordered observations');
  }
  assert.equal(records['first-world'].observed.dataset.shellEngineState, 'gameplay');
  assert.ok(records['first-world'].observed.log.includes('msec to load ' + map));
  assert.equal(records.saved.observed.dataset.shellEngineState, 'paused');
  assert.equal(records['reload-launcher'].observed.dataset.shellEngineState, 'launcher');
  assert.equal(records['reload-launcher'].observed.log, '', 'fresh page clears native console log');
  assert.equal(records['reload-launcher'].observed.dataset.d3wasmAudioStarts, undefined);
  assert.equal(records['reload-menu'].observed.dataset.shellEngineState, 'menu');
  assert.ok(records['reload-menu'].observed.log.includes('Save/config persistence restored at /save/' + nativeVariant + '.'));
  assert.ok(Number(records['reload-menu'].observed.dataset.d3wasmAudioStarts) < Number(records.saved.observed.dataset.d3wasmAudioStarts));
  validateRestore(records.restored, map, 1);
  validateRestore(records['second-restored'], map, 2);
  const first = positions(records['restored-position']).at(-1);
  const moved = positions(records['moved-position']).at(-1);
  const second = positions(records['second-position']).at(-1);
  assert.deepEqual(first, expectedPosition);
  validatePositions(first, moved, second);
  assert.equal(records['final-pause'].observed.dataset.shellEngineState, 'paused');
  assert.equal(records['final-resume'].observed.dataset.shellEngineState, 'gameplay');
  assert.equal(records['final-resume'].observed.dataset.d3wasmAudioState, 'running');
  assert.ok(Number(records['final-resume'].observed.dataset.d3wasmAudioStarts) > Number(records['second-restored'].observed.dataset.d3wasmAudioStarts));
  assert.equal(records['quit-menu'].observed.dataset.shellEngineState, 'menu');
  assert.ok(records['quit-menu'].observed.log.includes('----- Game Map Shutdown -----'));
  const queue = read(`d3-v7-${variant}-persistence-queue-2026-09-06.json`);
  assert.equal(queue.restores, 1);
  assert.equal(queue.flushes, 12);
  assert.equal(queue.maximumConcurrentSyncs, 1);
  results.push({variant:nativeVariant, map, first, moved, second,
    savedAt:records.saved.observedAt, pageReloadObservedAt:records['reload-launcher'].observedAt,
    restoredAt:records.restored.observedAt, secondRestoredAt:records['second-restored'].observedAt,
    finalResumeAt:records['final-resume'].observedAt, quitMenuAt:records['quit-menu'].observedAt});
  // Guard the validator against a duplicated old screenshot/log or new-map fallback.
  const invalid = structuredClone(records['second-restored']);
  invalid.observed.log = invalid.observed.log.replaceAll('----- Game Map Init SaveGame -----', '----- Game Map Init -----');
  assert.throws(() => validateRestore(invalid, map, 2));
  assert.throws(() => validatePositions(first, first, second), /native position changes/);
  assert.throws(() => validatePositions(first, moved, moved), /original saved coordinate/);
}
const packaged = read('d3-v7-campaign-package-2026-09-06.json');
assert.equal(packaged.passed, true);
assert.equal(packaged.deployed, false);
assert.equal(packaged.results.length, 2);
for (const result of packaged.results) {
  assert.equal(result.image, 'sha256:a7afa362d4012ae13b7bb1b81b99287e8f4d12ae24a4d5b7431ca17f4a260007');
  assert.equal(result.status.state, 'sleeping');
  assert.deepEqual(result.status.relay, {peers:0, clientPackets:0, serverPackets:0});
  assert.deepEqual(result.resources, {sessions:[], nativeProcesses:[]});
}
const finalPackage = read('d3-v7-campaign-final-package-2026-09-06.json');
assert.equal(finalPackage.passed, true);
assert.equal(finalPackage.deployed, false);
assert.equal(finalPackage.results.length, 2);
for (let i = 0; i < 2; i++) {
  const before = packaged.results[i], after = finalPackage.results[i];
  assert.ok(Date.parse(after.observedAt) > Date.parse(results[i].quitMenuAt));
  for (const field of ['variant', 'container', 'port', 'image', 'startedAt', 'restartCount',
    'readOnlyRoot', 'mounts', 'imageFiles', 'httpFiles', 'status', 'resources']) {
    assert.deepEqual(after[field], before[field], 'unchanged package/lifecycle: ' + field);
  }
}
const result = {scope:'Retained real-Chrome first-map campaign/save observations: native named slots, full page reload, actual SaveGame initialization, changed-position comparison load, and pause/resume. Screenshot contents (names, previews, health/ammo and lighting) were visually inspected by the agent; this script does not OCR or render them. Not full campaigns, held-input/capture, audible quality, old-save compatibility or production acceptance.',
  checkedStagesPerVariant:stages.length, results, files, deployed:false, passed:true};
if (process.env.D3_CAMPAIGN_EVIDENCE_PROOF) fs.writeFileSync(process.env.D3_CAMPAIGN_EVIDENCE_PROOF, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({scope:result.scope, results, checkedFiles:Object.keys(files).length, passed:true}, null, 2));
