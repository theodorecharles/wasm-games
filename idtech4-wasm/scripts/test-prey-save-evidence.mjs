#!/usr/bin/env node
// Verify retained Chrome observations, including the still-unfixed cleanup warning.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stem = stage => `proofs/prey-save-${stage}-2026-09-06`;
const files = {};
function bytes(file) {
  const value = fs.readFileSync(path.join(root, file));
  files[file] = crypto.createHash('sha256').update(value).digest('hex');
  return value;
}
const stages = ['launch', 'initial-list', 'autosave-loaded', 'original-position',
  'before-entry', 'name-entry', 'written', 'preview', 'reloaded-launcher',
  'reloaded-list', 'reloaded-preview', 'restored-world', 'restored-position',
  'comparison-position', 'second-preview', 'second-world', 'second-position',
  'final-pause', 'final-resume', 'quit'];
const observations = {};
let lastTime = -Infinity;
for (const stage of stages) {
  const record = JSON.parse(bytes(stem(stage) + '.json'));
  const time = Date.parse(record.observedAt);
  assert.ok(Number.isFinite(time) && time > lastTime, `${stage}: ordered observations`);
  lastTime = time;
  const o = record.observation;
  assert.equal(o.url, 'http://127.0.0.1:32877/?game=prey&proof=prey-save-current');
  assert.equal(o.root.wasmGameVariant, 'prey');
  assert.equal(o.root.wasmGameMode, 'single');
  assert.equal(o.proof.proofId, 'prey-save-current');
  assert.deepEqual(o.proof.errors, []);
  assert.equal(o.fullscreen, null);
  assert.equal(o.pointerLock, null);
  assert.equal(o.root.shellInputCaptured, 'false');
  assert.doesNotMatch(o.log, /Savegame Version mismatch|aborting loadgame|invalid savegame|Couldn't open savegame|Save\/config persistence warning|RuntimeError|memory access out of bounds|Aborted\(/i);
  const jpeg = bytes(stem(stage) + '.jpg');
  assert.equal(jpeg.readUInt16BE(0), 0xffd8);
  assert.ok(jpeg.length > 10000);
  observations[stage] = o;
}
const obs = stage => observations[stage];
const position = stage => [...obs(stage).log.matchAll(/^\((-?[\d.]+) (-?[\d.]+) (-?[\d.]+)\) (-?[\d.]+)$/gm)]
  .map(m => m.slice(1).map(Number)).at(-1);
const warning = 'WARNING: idClipModel::FreeTraceModel: tried to free uncached trace model';
const warningCount = o => o.log.split(warning).length - 1;
function restore(o, count) {
  assert.equal(o.root.shellEngineState, 'gameplay');
  assert.equal((o.log.match(/Game Map Init SaveGame/g) || []).length, count);
  assert.match(o.log, /msec to load game\/roadhouse/);
  assert.doesNotMatch(o.log.slice(o.log.lastIndexOf('Game Map Init SaveGame')),
    /Game Map Init -|entities spawned|SpawnPlayer: 0/, 'no new-map fallback');
}
function restored(original, moved, final) {
  assert.ok(original?.length === 4 && moved?.length === 4 && final?.length === 4);
  assert.ok(Math.hypot(moved[0] - original[0], moved[1] - original[1]) > 0.1, 'measurable displacement');
  assert.deepEqual(final, original, 'restore at native printed precision');
}
for (const stage of ['launch', 'reloaded-launcher']) {
  const o = obs(stage);
  assert.equal(o.root.shellEngineState, 'launcher');
  assert.equal(o.log, '');
  assert.equal(o.root.d3wasmAudioStarts, undefined);
  assert.deepEqual(o.proof.input.events, []);
}
for (const stage of ['initial-list', 'reloaded-list']) {
  const o = obs(stage);
  assert.equal(o.root.shellEngineState, 'menu');
  assert.equal(o.proof.persistence.ready, true);
  assert.equal(o.proof.persistence.root, '/save/prey');
  assert.match(o.log, /Save\/config persistence restored at \/save\/prey\./);
  assert.doesNotMatch(o.log, /Game Map Init SaveGame|setviewpos|getviewpos/i);
}
assert.ok(Number(obs('reloaded-list').root.d3wasmAudioStarts) < Number(obs('written').root.d3wasmAudioStarts));
assert.equal(position('original-position'), undefined, 'initial paste attempt did not reach native console');
const entered = obs('name-entry').proof.input.events.filter(e => e.type === 'text').map(e => String.fromCodePoint(e.codepoint)).join('');
assert.ok(entered.endsWith('prey906a'));
assert.equal(obs('written').root.shellEngineState, 'paused');
restore(obs('autosave-loaded'), 1);
restore(obs('restored-world'), 1);
restore(obs('second-world'), 2);
const original = position('before-entry'), first = position('restored-position');
const moved = position('comparison-position'), second = position('second-position');
assert.deepEqual(original, [-282, -340, 68.25, 180]);
assert.deepEqual(first, original);
assert.match(obs('comparison-position').log, /\]setviewpos -282 -356 68\.25 180/);
assert.deepEqual(moved, [-282, -356, 68.5, 180]);
restored(original, moved, second);
assert.throws(() => restored(original, original, second), /displacement/);
assert.throws(() => restored(original, moved, moved), /restore/);
const fallback = structuredClone(obs('second-world'));
fallback.log = fallback.log.replaceAll('Game Map Init SaveGame', 'Game Map Init');
assert.throws(() => restore(fallback, 2));
assert.equal(obs('final-pause').root.shellEngineState, 'paused');
assert.equal(obs('final-resume').root.shellEngineState, 'gameplay');
assert.equal(obs('quit').root.shellEngineState, 'menu');
assert.match(obs('quit').log, /Game Map Shutdown/);
// These are retained bug observations, not an accepted warning suppression.
assert.equal(warningCount(obs('restored-world')), 0);
assert.equal(warningCount(obs('second-world')), 1);
assert.equal(warningCount(obs('quit')), 2);
const packageProof = JSON.parse(bytes(stem('package') + '.json'));
assert.equal(packageProof.image, 'sha256:8571367ae10dae7267c67a28dfdf4031eaf588ee622e1171c9286be2ff5e1e6d');
bytes('scripts/test-prey-save-package.mjs');
bytes('scripts/test-prey-save-evidence.mjs');
const result = {
  scope:'Native Prey named save, full-page reload, persisted preview, actual SaveGame loads, printed-position restore after console displacement, pause/resume/quit. Two uncached-trace warnings remain a reproduced bug. Visual names/previews were manually inspected, not OCR tested. Not held controls, listening, full campaign or deployment acceptance.',
  pairs:stages.length, image:packageProof.image, savedName:'prey906a',
  original, first, moved, second, cleanupWarnings:2, files
};
const proof = path.join(root, stem('evidence') + '.json');
if (process.argv.includes('--record')) fs.writeFileSync(proof, JSON.stringify(result, null, 2) + '\n', {flag:'wx'});
else assert.deepEqual(result, JSON.parse(fs.readFileSync(proof, 'utf8')));
console.log(`${stages.length} Chrome pairs, native save/reload/restore, two reproduced cleanup warnings and ${Object.keys(files).length} hashes verified.`);
