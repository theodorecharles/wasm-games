#!/usr/bin/env node
// Retained DOM/native telemetry and package audit, not automated visual acceptance.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = path.join(root, 'proofs');
const name = (stem, ext = 'json') => `duke-profiles-${stem}-2026-09-06.${ext}`;
const read = stem => JSON.parse(fs.readFileSync(path.join(directory, name(stem)), 'utf8'));
const stems = ['hidden-selector', 'classic-launcher', 'modernized-launcher', 'remembered-launcher',
  'modernized-menu', 'modernized-world', 'modernized-fired', 'modernized-pitch', 'modernized-yaw',
  'modernized-pause', 'modernized-empty-saves', 'modernized-save-preview',
  'classic-menu', 'classic-world', 'classic-fired', 'classic-pause', 'modernized-reload-menu'];
const observations = Object.fromEntries(stems.map(stem => [stem, read(stem).observation]));
for (const [stem, o] of Object.entries(observations)) {
  assert.equal(new URL(o.url).port, stem === 'hidden-selector' ? '32981' : '32982');
  const modernized = stem.startsWith('modernized') || stem === 'remembered-launcher';
  assert.equal(o.root.dukeProfile, modernized ? 'modernized' : 'classic', stem);
  const canvas = o.canvas[0];
  assert.equal(canvas.width, modernized ? 1280 : 800, stem);
  assert.equal(canvas.height, modernized ? 720 : 600, stem);
  if (stem.endsWith('launcher') || stem === 'hidden-selector') {
    assert.equal(o.root.shellEngineState, 'launcher');
    continue;
  }
  assert.equal(o.root.persistence, 'ready');
  assert.equal(o.root.dukeControlsMask, '31');
  assert.equal(o.root.buildRenderMode, modernized ? '3' : '0', stem);
  assert.equal(o.root.buildRenderBpp, modernized ? '32' : '8', stem);
  assert.equal(o.root.buildRenderSize, modernized ? '1280x720' : '800x600', stem);
  assert(Math.abs(canvas.cssWidth / canvas.cssHeight - canvas.width / canvas.height) < 0.003, stem);
  assert.doesNotMatch(o.log, /\[GPU (?:driver|draw|pending|world|probe)\]|Invalid WebGL|null function|Compile Status: 0/);
  if (modernized) assert.match(o.log, /Using config file 'modernized\.cfg'/);
  else assert.doesNotMatch(o.log, /Using config file 'modernized\.cfg'/);
  if (/(world|fired|pitch|yaw)$/.test(stem)) assert.equal(o.root.shellEngineState, 'gameplay', stem);
  if (stem.endsWith('pause')) assert.equal(o.root.dukeMenuId, '50', stem);
}
const view = stem => observations[stem].root.dukePlayerView.split(',').map(Number);
const fired = view('modernized-fired'), pitch = view('modernized-pitch'), yaw = view('modernized-yaw');
assert.deepEqual(pitch.slice(0, 4), fired.slice(0, 4), 'vertical motion must not move/turn the player');
assert(pitch[4] < fired[4], 'downward mouse motion must lower the view');
assert.deepEqual(yaw.slice(0, 3), pitch.slice(0, 3));
assert.equal(yaw[4], pitch[4]);
assert(yaw[3] > pitch[3], 'horizontal motion must turn the player');
assert.equal(observations['modernized-pitch'].root.buildPointerDelta, '0,72');
assert.equal(observations['modernized-yaw'].root.buildPointerDelta, '90,0');
assert.equal(observations['modernized-yaw'].root.buildPointerDeltaEvents, '2');
assert.equal(observations['classic-menu'].root.wasmDataSource, 'cache');
assert.equal(observations['modernized-reload-menu'].root.wasmDataSource, 'cache');
assert.doesNotMatch(observations['modernized-reload-menu'].log, /Import Configuration Settings|Import configuration data/);
const oldPackage = read('package'), current = read('visible-package');
for (const p of [oldPackage, current]) {
  assert.equal(p.classicEngineUnchanged, true);
  assert.equal(p.bloodUnchanged, true);
  assert.equal(p.unchangedFiles, 19);
  assert.equal(p.drawObserverPresent, false);
  assert.equal(p.ownerDataReadOnly, true);
  assert.deepEqual(p.added, ['/opt/game-site/duke3d-modernized.js', '/opt/game-site/duke3d-modernized.wasm']);
  assert.deepEqual(p.changed, ['/opt/game-site/adapters/duke3d.js', '/opt/game-site/wasm-game.json']);
}
assert.deepEqual(Object.keys(current.files).filter(file => current.files[file] !== oldPackage.files[file]), ['/opt/game-site/wasm-game.json']);
assert.equal(read('source').tree, '5b5f5b6ce3ec65602ed6854fa4b2751738e5dd63');
const files = stems.flatMap(stem => [name(stem), name(stem, 'jpg')]).concat(['package', 'visible-package', 'source'].map(stem => name(stem)));
const hashes = Object.fromEntries(files.map(file => [file, createHash('sha256').update(fs.readFileSync(path.join(directory, file))).digest('hex')]));
const proof = { observedAt: new Date().toISOString(), audited: true, modernizedAccepted: false,
  scope: 'Profile selection/reload, actual native renderer dimensions and mouse-look telemetry; screenshots require visual review',
  chromePairs: stems.length, hashedFiles: files.length,
  nativePitch: [fired[4], pitch[4]], nativeYaw: [pitch[3], yaw[3]],
  inputCaptureEstablished: false,
  remaining: ['small save-menu text and stray GPU menu patch', 'sprite/transparency/depth fidelity',
    'held movement and normal pointer capture', 'audio listening', 'save/full reload/load', 'Blood Modernized', 'deployment'], hashes };
if (process.env.DUKE_PROFILES_EVIDENCE_PROOF) fs.writeFileSync(process.env.DUKE_PROFILES_EVIDENCE_PROOF,
  JSON.stringify(proof, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(proof, null, 2));
