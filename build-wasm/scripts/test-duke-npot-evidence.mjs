#!/usr/bin/env node
// Audits retained observations; screenshots still require visual review.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = path.join(root, 'proofs');
const name = (stem, ext = 'json') => `${stem}-2026-09-06.${ext}`;
const read = stem => JSON.parse(fs.readFileSync(path.join(directory, name(stem)), 'utf8'));
const stems = ['duke-npot-menu', 'duke-npot-world', 'duke-npot-save-menu',
  'duke-precision-menu', 'duke-precision-world', 'duke-precision-fired',
  'duke-precision-pause', 'duke-precision-save-menu', 'duke-precision-save-preview',
  'duke-precision-save-cancelled', 'duke-precision-resumed'];
const observations = Object.fromEntries(stems.map(stem => [stem, read(stem).observation]));
for (const [stem, o] of Object.entries(observations)) {
  assert.equal(new URL(o.url).port, stem.startsWith('duke-npot') ? '32983' : '32984');
  for (const [key, value] of Object.entries({dukeProfile:'modernized', persistence:'ready',
    buildRenderMode:'3', buildRenderBpp:'32', buildRenderSize:'1280x720', dukeControlsMask:'31'}))
    assert.equal(o.root[key], value, `${stem}: ${key}`);
  assert.match(o.log, /\[Build WASM\] NPOT textures: 1 \(OpenGL ES 3\.0\)/);
  assert.match(o.log, /Using config file 'modernized\.cfg'/);
  assert.doesNotMatch(o.log, /\[GPU (?:driver|draw|pending|world|probe)\]|Invalid WebGL|null function|Compile Status: 0/);
  assert.equal(o.canvas[0].width, 1280); assert.equal(o.canvas[0].height, 720);
  assert(Math.abs(o.canvas[0].cssWidth / o.canvas[0].cssHeight - 16 / 9) < 0.003);
  assert.equal(o.pointerLock, null); assert.equal(o.fullscreen, null);
  if (/(world|fired|resumed)$/.test(stem)) assert.equal(o.root.shellEngineState, 'gameplay');
  else assert.equal(o.root.shellEngineState, 'menu');
  if (/(pause|save-cancelled)$/.test(stem)) assert.equal(o.root.dukeMenuId, '50');
  if (/(save-menu|save-preview)$/.test(stem)) assert.equal(o.root.dukeMenuId, '350');
}
for (const stem of ['duke-precision-fired', 'duke-precision-save-preview', 'duke-precision-resumed'])
  assert.equal(observations[stem].root.dukePlayerView, observations['duke-precision-world'].root.dukePlayerView);
const npot = read('duke-npot-package'), precision = read('duke-precision-package');
for (const p of [npot, precision]) {
  assert.equal(p.classicEngineUnchanged, true); assert.equal(p.bloodUnchanged, true);
  assert.equal(p.unchangedFiles, 19); assert.equal(Object.keys(p.files).length, 23);
  assert.equal(p.ownerDataReadOnly, true); assert.equal(p.drawObserverPresent, false);
}
assert.deepEqual(npot.base, precision.base); assert.deepEqual(npot.rtcw, precision.rtcw);
assert.deepEqual(Object.keys(precision.files).filter(file => precision.files[file] !== npot.files[file]),
  ['/opt/game-site/duke3d-modernized.js'], 'precision repair changes only the JS shader translator');
const amd = read('duke-npot-amd'), software = read('duke-npot-software');
assert.deepEqual(amd.hashes, software.hashes);
for (const gpu of [amd, software]) {
  const fixed = JSON.parse(gpu.records.find(r => r.variant === 'browser').output);
  assert.equal(fixed.capabilityChecks, 9); assert.equal(fixed.renderCases, 18); assert.equal(fixed.pixelChecks, 39960);
  assert.equal(gpu.records.filter(r => r.variant === 'old-detection' && r.expectedFailure).length, 2);
  assert.equal(JSON.parse(gpu.records.find(r => r.variant === 'desktop').output).desktopPreserved, true);
}
assert.equal(amd.records.find(r => r.variant === 'old-sampler-precision').precisionLoss, true);
assert.equal(software.records.find(r => r.variant === 'old-sampler-precision').precisionLoss, false);
assert.equal(read('duke-npot-source').tree, '668c88781e5b6880c778bb1bc0a4e933307bab0f');
const files = stems.flatMap(stem => [name(stem), name(stem, 'jpg')]).concat(
  ['duke-npot-package', 'duke-precision-package', 'duke-npot-amd', 'duke-npot-software', 'duke-npot-source'].map(stem => name(stem)));
const hashes = Object.fromEntries(files.map(file => [file, createHash('sha256').update(fs.readFileSync(path.join(directory, file))).digest('hex')]));
const proof = {observedAt:new Date().toISOString(), audited:true, modernizedAccepted:false,
  scope:'Native NPOT capability, corrected package identity, GLES readback and Chrome menu/gameplay observations; not automatic image acceptance',
  chromePairs:stems.length, hashedFiles:files.length, pixelsPerDriver:39960,
  precisionNegativeReproducesOnAMD:true, precisionNegativeReproducesOnSoftware:false,
  inputCaptureEstablished:false, saveConfirmed:false,
  remaining:['alpha-test and sprite/depth fidelity', 'held movement and normal input capture',
    'audio listening', 'save/full reload/load', 'wider gameplay', 'Blood Modernized', 'deployment'], hashes};
if (process.env.DUKE_NPOT_EVIDENCE_PROOF) fs.writeFileSync(process.env.DUKE_NPOT_EVIDENCE_PROOF,
  JSON.stringify(proof, null, 2) + '\n', {flag:'wx'});
console.log(JSON.stringify(proof, null, 2));
