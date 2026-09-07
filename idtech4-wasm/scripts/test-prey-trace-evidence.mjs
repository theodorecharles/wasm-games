#!/usr/bin/env node
// Audit retained Chrome evidence; does not replay Chrome or OCR native menus.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stem = stage => `proofs/prey-trace-${stage}-2026-09-06`;
const files = {};
function bytes(file) {
  const value = fs.readFileSync(path.join(root, file));
  files[file] = crypto.createHash('sha256').update(value).digest('hex');
  return value;
}
const stages = ['launch', 'menu-before', 'menu-after', 'old-preview', 'old-world',
  'old-loaded', 'old-position', 'old-scene', 'autosave-preview', 'autosave-scene',
  'repeat-preview', 'repeat-world', 'repeat-position', 'new-position', 'name-entry',
  'written', 'new-preview', 'first-quit', 'reloaded-launcher', 'reloaded-preview',
  'reloaded-world', 'restored-position', 'final-old-preview', 'final-old-world',
  'final-old-position', 'final-pause', 'final-resume', 'final-quit'];
const observations = {};
let lastTime = -Infinity;
function clean(o) {
  assert.deepEqual(o.proof.errors, []);
  assert.doesNotMatch(o.log, /uncached trace model|Savegame Version mismatch|aborting loadgame|invalid savegame|Couldn't open savegame|Save\/config persistence warning|RuntimeError|memory access out of bounds|Aborted\(/i);
}
for (const stage of stages) {
  const record = JSON.parse(bytes(stem(stage) + '.json'));
  const time = Date.parse(record.observedAt);
  assert.ok(Number.isFinite(time) && time > lastTime, `${stage}: ordered observations`);
  lastTime = time;
  const o = record.observation;
  assert.equal(o.url, 'http://127.0.0.1:32877/?game=prey&proof=prey-trace-current');
  assert.equal(o.root.wasmGameVariant, 'prey');
  assert.equal(o.root.wasmGameMode, 'single');
  assert.equal(o.proof.proofId, 'prey-trace-current');
  assert.equal(o.fullscreen, null);
  assert.equal(o.pointerLock, null);
  assert.equal(o.root.shellInputCaptured, 'false');
  clean(o);
  const jpeg = bytes(stem(stage) + '.jpg');
  assert.equal(jpeg.readUInt16BE(0), 0xffd8);
  assert.ok(jpeg.length > 10000);
  observations[stage] = o;
}
const obs = stage => observations[stage];
const position = stage => [...obs(stage).log.matchAll(/^\((-?[\d.]+) (-?[\d.]+) (-?[\d.]+)\) (-?[\d.]+)$/gm)]
  .map(m => m.slice(1).map(Number)).at(-1);
const loadTimes = o => [...o.log.matchAll(/(\d+) msec to load game\/roadhouse/g)].map(m => Number(m[1]));
function restore(o, count) {
  assert.equal(o.root.shellEngineState, 'gameplay');
  assert.equal((o.log.match(/Game Map Init SaveGame/g) || []).length, count);
  assert.equal(loadTimes(o).length, count, 'completed native loads');
  assert.doesNotMatch(o.log.slice(o.log.lastIndexOf('Game Map Init SaveGame')),
    /Game Map Init -|entities spawned|SpawnPlayer: 0/, 'no new-map fallback');
}
for (const stage of ['launch', 'reloaded-launcher']) {
  const o = obs(stage);
  assert.equal(o.root.shellEngineState, 'launcher');
  assert.equal(o.log, '');
  assert.equal(o.root.d3wasmAudioStarts, undefined);
  assert.deepEqual(o.proof.input.events, []);
}
for (const stage of ['menu-before', 'menu-after', 'old-preview', 'reloaded-preview']) {
  const o = obs(stage);
  assert.equal(o.root.shellEngineState, 'menu');
  assert.equal(o.proof.persistence.ready, true);
  assert.equal(o.proof.persistence.root, '/save/prey');
  assert.match(o.log, /Save\/config persistence restored at \/save\/prey\./);
  assert.doesNotMatch(o.log, /Game Map Init SaveGame|setviewpos|getviewpos/i);
}
assert.deepEqual(obs('menu-before').proof.input.events, []);
const modifiers = obs('menu-after').proof.input.events.filter(e => e.type === 'key');
function paired(events) {
  assert.deepEqual(events.map(e => [e.scan, e.down]), [[224, true], [224, false], [226, true], [226, false]]);
  for (let i = 0; i < events.length; i += 2) assert.ok(events[i + 1].at > events[i].at);
}
paired(modifiers);
assert.throws(() => paired(modifiers.filter(e => !e.down)), /deep-equal/);
// The early record is an in-flight load, not an accepted world screenshot.
assert.equal(obs('old-world').root.shellEngineState, 'menu');
assert.equal(loadTimes(obs('old-world')).length, 0);
assert.throws(() => restore(obs('old-world'), 1));
for (const stage of ['old-loaded', 'old-position', 'old-scene']) restore(obs(stage), 1);
restore(obs('autosave-scene'), 2);
restore(obs('repeat-world'), 3);
restore(obs('reloaded-world'), 1);
restore(obs('final-old-world'), 2);
const original = position('old-position'), newPosition = position('new-position');
assert.deepEqual(original, [-282, -340, 68.25, 180]);
assert.deepEqual(position('repeat-position'), original);
assert.match(obs('new-position').log, /\]setviewpos -282 -356 68\.25 180/);
assert.deepEqual(newPosition, [-282, -356, 68.5, 180]);
assert.ok(Math.hypot(newPosition[0] - original[0], newPosition[1] - original[1]) > 0.1);
assert.deepEqual(position('restored-position'), newPosition);
assert.deepEqual(position('final-old-position'), original);
assert.doesNotMatch(obs('final-old-position').log, /setviewpos/i, 'fresh worker restores both positions without another teleport');
const text = obs('written').proof.input.events.filter(e => e.type === 'text').map(e => String.fromCodePoint(e.codepoint)).join('');
assert.ok(text.endsWith('prey906b'));
assert.equal(obs('written').root.shellEngineState, 'paused');
assert.ok(Number(obs('reloaded-preview').root.d3wasmAudioStarts) < Number(obs('written').root.d3wasmAudioStarts));
assert.equal(obs('final-pause').root.shellEngineState, 'paused');
assert.equal(obs('final-resume').root.shellEngineState, 'gameplay');
for (const [stage, count] of [['first-quit', 3], ['final-quit', 2]]) {
  assert.equal(obs(stage).root.shellEngineState, 'menu');
  assert.equal(loadTimes(obs(stage)).length, count);
  assert.equal((obs(stage).log.match(/Game Map Shutdown/g) || []).length, count + 1);
  assert.match(obs(stage).log.slice(obs(stage).log.lastIndexOf('msec to load game/roadhouse')), /Game Map Shutdown/);
}
const fallback = structuredClone(obs('final-old-world'));
fallback.log = fallback.log.replaceAll('Game Map Init SaveGame', 'Game Map Init');
assert.throws(() => restore(fallback, 2));
const legacy = JSON.parse(bytes('proofs/prey-save-quit-2026-09-06.json')).observation;
assert.equal((legacy.log.match(/uncached trace model/g) || []).length, 2);
assert.throws(() => clean(legacy), /uncached trace model/);
const packageProof = JSON.parse(bytes('proofs/prey-trace-cache-package-2026-09-06.json'));
assert.equal(packageProof.image, 'sha256:73534e2ca76cd98ea89ab904fe13aeeb65139fdb0ac8b49cb05a53f6202d1ffd');
for (const file of ['proofs/prey-trace-cache-source-2026-09-06.json',
  'proofs/prey-trace-cache-native-2026-09-06.json', 'proofs/prey-trace-cache-legacy-2026-09-06.json',
  'scripts/test-prey-trace-cache.mjs', 'scripts/test-prey-trace-source.mjs',
  'scripts/test-prey-trace-package.mjs', 'scripts/test-prey-trace-evidence.mjs']) bytes(file);
const result = {
  scope:'Retained actual Chrome: old named save and older autosave compatibility, three first-session loads, new distinct native save/preview, full-page reset, two fresh-session loads restoring distinct new/old positions, pause/resume and two native quits. Zero trace-cache warnings; historical warning observation fails this audit. Ctrl/Alt matched tap edges. Screenshots manually inspected, not OCR/pixel-tested. Native-console diagnostic displacement is not held movement. No capture, listening, campaign or deployment acceptance.',
  pairs:stages.length, image:packageProof.image, savedName:'prey906b',
  original, newPosition, oldLoads:loadTimes(obs('first-quit')),
  freshLoads:loadTimes(obs('final-quit')), cleanupWarnings:0,
  modifierTapMilliseconds:[modifiers[1].at - modifiers[0].at, modifiers[3].at - modifiers[2].at], files
};
const proof = path.join(root, 'proofs/prey-trace-cache-evidence-2026-09-06.json');
if (process.argv.includes('--record')) fs.writeFileSync(proof, JSON.stringify(result, null, 2) + '\n', {flag:'wx'});
else assert.deepEqual(result, JSON.parse(fs.readFileSync(proof, 'utf8')));
console.log(`${stages.length} Chrome pairs, five native loads, two clean quits, Ctrl/Alt edges and ${Object.keys(files).length} hashes verified.`);
