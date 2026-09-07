#!/usr/bin/env node
// Frozen Chrome observations from the initial 32987 profile package.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const directory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../proofs');
const name = (stem, ext = 'json') => `blood-modernized-${stem}-2026-09-06.${ext}`;
const read = stem => JSON.parse(fs.readFileSync(path.join(directory, name(stem)), 'utf8'));
const stems = ['launcher', 'startup', 'episode', 'episode-key', 'skill', 'world', 'attack', 'look-down',
  'look-right', 'forward', 'look-up', 'pause', 'resumed', 'save-menu', 'save-edit', 'save-letter', 'save-name',
  'saved', 'reload-launcher', 'reload-menu', 'reload-list', 'restored', 'reload-forward',
  'classic-launcher', 'classic-menu', 'classic-list', 'classic-restored', 'classic-forward',
  'return-launcher', 'return-menu'];
const observations = Object.fromEntries(stems.map(stem => [stem, read(stem).observation]));
const root = stem => observations[stem].root;
const position = stem => root(stem).playerPosition.split(',').map(Number);
const look = stem => root(stem).bloodPlayerLook.split(',').map(Number);
for (const [stem, o] of Object.entries(observations)) {
  const classic = stem.startsWith('classic-'), launcher = stem.endsWith('launcher');
  assert.equal(new URL(o.url).port, '32987');
  assert.equal(o.root.bloodProfile, classic ? 'classic' : 'modernized');
  assert.equal(o.pointerLock, null); assert.equal(o.fullscreen, null);
  assert.equal(o.root.shellInputCaptured, 'false');
  const width = classic ? 800 : 1280, height = classic ? 600 : 720;
  assert.equal(o.canvas[0].width, width); assert.equal(o.canvas[0].height, height);
  if (launcher) { assert.equal(o.root.shellEngineState, 'launcher'); continue; }
  for (const [key, value] of Object.entries({ persistence: 'ready', audioState: 'running',
    buildRenderMode: classic ? '0' : '3', buildRenderBpp: classic ? '8' : '32',
    buildRenderSize: `${width}x${height}` })) assert.equal(o.root[key], value, `${stem}: ${key}`);
  assert(Math.abs(o.canvas[0].cssWidth / o.canvas[0].cssHeight - width / height) < 0.003);
  assert.doesNotMatch(o.log, /\[GPU (?:driver|draw|pending|world|probe)\]|Invalid WebGL|null function|Compile Status: 0|memory access out of bounds/);
  // Preserve the actual initial-package false warning; do not silently change
  // it into a pass. The newer binding-slot fix has separate native evidence.
  const oldReorderedBindings = ['reload-menu', 'reload-list', 'restored', 'reload-forward', 'return-menu'].includes(stem);
  assert.equal(o.root.bloodControlsMask, oldReorderedBindings ? '28' : '31');
  assert.equal(o.root.bloodControlsValid, oldReorderedBindings ? 'false' : 'true');
}
assert.equal(root('episode').shellEngineState, 'menu'); // Ineffective mouse click, not an episode transition.
for (const stem of ['world', 'attack', 'look-down', 'look-right', 'forward', 'look-up', 'resumed',
  'saved', 'restored', 'reload-forward', 'classic-restored', 'classic-forward'])
  assert.equal(root(stem).shellEngineState, 'gameplay');
for (const stem of ['pause', 'save-menu', 'save-edit', 'save-letter', 'save-name'])
  assert.equal(root(stem).shellEngineState, 'paused');
assert.equal(root('world').level, 'e1m1');
assert(look('look-down')[0] < look('world')[0]);
assert(look('look-up')[0] > look('look-down')[0]);
assert.notEqual(look('look-right')[3], look('look-down')[3]);
assert.equal(root('look-down').buildPointerDelta, '0,288');
assert.equal(root('look-up').buildPointerDelta, '0,-288');
assert.equal(root('look-right').buildPointerDelta, '351,0');
for (const [before, after] of [['look-right', 'forward'], ['restored', 'reload-forward'], ['classic-restored', 'classic-forward']]) {
  assert.notDeepEqual(position(before).slice(0, 2), position(after).slice(0, 2));
  assert.equal(root(after).buildLastKey, 'KeyW:up');
  assert.equal(root(after).lastInput, '1024,0,0,0');
}
assert.deepEqual(position('saved'), position('restored'));
assert.deepEqual(look('saved'), look('restored'));
assert.deepEqual(position('classic-restored'), position('saved'));
assert.deepEqual(position('classic-forward'), position('reload-forward'));
assert.match(observations.saved.log, /Game saved/);
assert.match(observations.saved.log, /Wrote modernized\.cfg/);
assert.match(observations['classic-restored'].log, /Wrote nblood\.cfg/);
assert.equal(root('save-letter').buildLastKey, 'KeyB:up');
assert.equal(root('save-name').buildLastKey, 'Digit7:up');
assert.equal(root('saved').buildLastKey, 'Enter:up');
for (const stem of ['reload-menu', 'restored', 'classic-menu', 'classic-restored', 'return-menu'])
  assert.equal(root(stem).wasmDataSource, 'cache');
const packageProof = read('package');
assert.equal(packageProof.classicBloodUnchanged, true);
assert.equal(packageProof.dukeEnginesAndAdapterUnchanged, true);
assert.equal(packageProof.unchangedFiles, 21);
assert.equal(packageProof.ownerDataReadOnly, true);
assert.equal(packageProof.drawObserverPresent, false);
assert.equal(read('source').tree, '98041d1a6e9bbfccc7f85000fdb1ba8edd20c1fe');
const alpha = read('alpha-amd');
assert.equal(alpha.records.length, 6);
for (const r of alpha.records) {
  if (r.negative) assert.match(r.log, /alpha (color|depth) mismatch/);
  else { const p = JSON.parse(r.output); assert.equal(p.colorChecks, 3840); assert.equal(p.depthChecks, 3840); }
}
const files = stems.flatMap(stem => [name(stem), name(stem, 'jpg')]).concat(['source', 'package', 'alpha-amd'].map(stem => name(stem)));
const hashes = Object.fromEntries(files.map(file => [file, createHash('sha256').update(fs.readFileSync(path.join(directory, file))).digest('hex')]));
const result = { observedAt: new Date().toISOString(), audited: true, deployed: false, fullGameAccepted: false,
  scope: 'Chrome profile selection, widescreen GPU first room, pitch/yaw, W taps, pause/resume, named save/full reload/native load and cross-profile load; not automatic screenshot OCR',
  chromePairs: stems.length, hashedFiles: files.length, createdSaves: ['B7 / game0000.sav'], savesOverwritten: 0,
  restoredPosition: position('restored'), restoredLook: look('restored'),
  screenshotByteIdentity: fs.readFileSync(path.join(directory, name('saved', 'jpg'))).equals(fs.readFileSync(path.join(directory, name('restored', 'jpg')))),
  knownBaselineBindingDiagnosticFalseNegative: true, knownSDKUniformWarnings: true,
  remaining: ['integrated build Chrome checks', 'broader gameplay/combat and renderer fidelity',
    'held controls/capture/fullscreen', 'audio listening', 'deferred user Blood crash reproduction', 'deployment'], hashes };
if (process.env.BLOOD_MODERNIZED_EVIDENCE_PROOF) fs.writeFileSync(process.env.BLOOD_MODERNIZED_EVIDENCE_PROOF,
  JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(result, null, 2));
