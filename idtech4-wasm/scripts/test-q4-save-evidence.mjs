#!/usr/bin/env node
// Audit retained real-Chrome observations; this does not drive a browser or OCR images.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stem = stage => `proofs/quake4-save-${stage}-2026-09-06`;
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const files = {};
function bytes(file) {
  const value = fs.readFileSync(path.join(root, file));
  files[file] = hash(value);
  return value;
}
const stages = ['initial-list', 'initial-world', 'original-position', 'before-entry',
  'written', 'preview', 'reloaded-launcher', 'reloaded-list', 'reloaded-preview',
  'restored-world', 'restored-position', 'moved-position', 'comparison-position', 'second-preview',
  'second-world', 'second-position', 'final-pause', 'final-resume', 'quit'];
const records = {};
let lastTime = -Infinity;
for (const stage of stages) {
  const record = JSON.parse(bytes(stem(stage) + '.json'));
  const observed = Date.parse(record.observedAt);
  assert.ok(Number.isFinite(observed) && observed > lastTime, `${stage}: ordered observations`);
  lastTime = observed;
  const o = record.observation;
  assert.equal(o.url, 'http://127.0.0.1:32961/?game=quake4');
  assert.equal(o.root.wasmGameVariant, 'quake4');
  assert.equal(o.root.wasmGameMode, 'single');
  assert.equal(o.fullscreen, null);
  assert.equal(o.root.shellInputCaptured, 'false', 'capture acceptance is explicitly not claimed');
  assert.doesNotMatch(o.log, /Savegame Version mismatch|aborting loadgame|invalid savegame|Couldn't open savegame|Save\/config persistence warning|RuntimeError|memory access out of bounds|Aborted\(/i);
  const jpeg = bytes(stem(stage) + '.jpg');
  assert.equal(jpeg.readUInt16BE(0), 0xffd8);
  assert.ok(jpeg.length > 10000);
  records[stage] = record;
}
const obs = stage => records[stage].observation;
const position = stage => [...obs(stage).log.matchAll(/^\((-?[\d.]+) (-?[\d.]+) (-?[\d.]+)\) (-?[\d.]+)$/gm)]
  .map(m => m.slice(1).map(Number)).at(-1);
function restore(o, count) {
  assert.equal(o.root.shellEngineState, 'gameplay');
  assert.equal((o.log.match(/Game Map Init SaveGame/g) || []).length, count);
  assert.match(o.log, /msec to load game\/airdefense1/);
  assert.doesNotMatch(o.log.slice(o.log.lastIndexOf('Game Map Init SaveGame')),
    /Game Map Init -|entities spawned|SpawnPlayer: 0/, 'reject new-map fallback');
}
function restoredPosition(original, moved, restored) {
  assert.ok(original?.length === 4 && moved?.length === 4 && restored?.length === 4);
  assert.ok(Math.hypot(moved[0] - original[0], moved[1] - original[1]) > 0.1,
    'require measurable horizontal displacement before comparison load');
  assert.deepEqual(restored, original, 'saved view restored at native printed precision');
}
assert.match(obs('written').log, /Saved 'q4quad906a'/);
assert.equal(obs('written').root.shellEngineState, 'paused');
assert.equal(obs('reloaded-launcher').root.shellEngineState, 'launcher');
assert.equal(obs('reloaded-launcher').log, '');
assert.equal(obs('reloaded-launcher').root.d3wasmAudioStarts, undefined);
assert.match(obs('reloaded-list').log, /Save\/config persistence restored at \/save\/quake4\./);
assert.doesNotMatch(obs('reloaded-list').log, /Saved 'q4quad906a'/, 'fresh worker, not old log');
assert.ok(Number(obs('reloaded-list').root.d3wasmAudioStarts) < Number(obs('written').root.d3wasmAudioStarts));
for (const stage of ['preview', 'reloaded-preview', 'second-preview'])
  assert.match(obs(stage).log, /savegames\/q4quad906a/);
restore(obs('restored-world'), 1);
restore(obs('second-world'), 2);
const original = position('before-entry');
const first = position('restored-position');
assert.deepEqual(position('moved-position'), first, 'eight short W taps did not establish movement');
assert.match(obs('comparison-position').log, /DBG setviewpos raw=/);
const moved = position('comparison-position');
const second = position('second-position');
assert.deepEqual(original, [10325.03, -6962.78, 6.95, -105]);
assert.deepEqual(first, original);
restoredPosition(original, moved, second);
assert.equal(obs('final-pause').root.shellEngineState, 'paused');
assert.equal(obs('final-resume').root.shellEngineState, 'gameplay');
assert.equal(obs('quit').root.shellEngineState, 'menu');
assert.match(obs('quit').log, /Game Map Shutdown/);
// Guard the auditor against treating duplicate observations or fallback spawns as a pass.
assert.throws(() => restoredPosition(original, original, second), /displacement/);
assert.throws(() => restoredPosition(original, moved, moved), /saved view restored/);
const fallback = structuredClone(obs('second-world'));
fallback.log = fallback.log.replaceAll('Game Map Init SaveGame', 'Game Map Init');
assert.throws(() => restore(fallback, 2));
const packageRecord = JSON.parse(bytes('proofs/quake4-quad-package-2026-09-06.json'));
assert.equal(packageRecord.image, 'sha256:fc651e2b5697e8605f53566d1e1d67b600e09d3c7166a51d3292cabc519d932a');
bytes('scripts/test-q4-save-evidence.mjs');
const result = {
  scope: 'Chrome native first-map named save, full-page reload, preview selection, actual SaveGame restores, native-console teleport comparison and normal pause/resume/quit. Eight short W taps did not establish movement. Screenshots were visually inspected, not OCR/pixel-oracle tested. Not full campaign, capture, held input, audible quality or deployment acceptance.',
  pairs: stages.length, packageImage: packageRecord.image,
  savedName: 'q4quad906a', original, first, moved, second, files
};
const index = path.join(root, stem('evidence') + '.json');
if (process.argv.includes('--record')) fs.writeFileSync(index, JSON.stringify(result, null, 2) + '\n', {flag:'wx'});
else assert.deepEqual(result, JSON.parse(fs.readFileSync(index, 'utf8')));
console.log(`${stages.length} Chrome pairs, cross-reload save, changed/restored position and ${Object.keys(files).length} hashes verified.`);
