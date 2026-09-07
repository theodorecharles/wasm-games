#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../proofs');
const name = (stem, ext = 'json') => `build-family-current-${stem}-2026-09-06.${ext}`;
const groups = {
  'blood-modern': ['menu', 'world', 'moved', 'pause', 'resumed', 'reloaded'],
  'blood-classic': ['world', 'moved'],
  'duke-modern': ['menu', 'world', 'moved', 'fired'],
  'duke-classic': ['menu', 'world', 'moved', 'fired']
};
const observations = {};
for (const [group, stems] of Object.entries(groups)) for (const stem of stems) {
  const key = `${group}-${stem}`, o = JSON.parse(fs.readFileSync(path.join(dir, name(key)))).observation;
  observations[key] = o;
  const modern = group.endsWith('modern'), blood = group.startsWith('blood');
  const width = modern ? 1280 : 800, height = modern ? 720 : 600;
  assert.equal(new URL(o.url).port, '32989');
  for (const [key, value] of Object.entries({ persistence: 'ready', audioState: 'running',
    buildRenderBpp: modern ? '32' : '8', buildRenderMode: modern ? '3' : '0',
    buildRenderSize: `${width}x${height}`, shellInputCaptured: 'false', wasmGameMode: 'suite',
    wasmGameVariant: blood ? 'blood' : 'duke3d',
    [`${blood ? 'blood' : 'duke'}Profile`]: modern ? 'modernized' : 'classic',
    [`${blood ? 'blood' : 'duke'}ControlsMask`]: '31' })) assert.equal(o.root[key], value, `${group}-${stem}: ${key}`);
  assert.equal(o.canvas[0].width, width); assert.equal(o.canvas[0].height, height);
  assert(Math.abs(o.canvas[0].cssWidth / o.canvas[0].cssHeight - width / height) < 0.003);
  assert.equal(o.pointerLock, null); assert.equal(o.fullscreen, null);
  assert.equal(o.root.shellEngineState, ['menu', 'reloaded'].includes(stem) ? 'menu' : stem === 'pause' ? 'paused' : 'gameplay');
  assert.doesNotMatch(o.log, /\[GPU (?:driver|draw|pending|world|probe)\]|Invalid WebGL|null function|Compile Status: 0|memory access out of bounds/);
}
const state = stem => observations[stem].root;
const view = (group, stem) => state(`${group}-${stem}`)[group.startsWith('blood') ? 'playerPosition' : 'dukePlayerView'].split(',').map(Number);
for (const group of Object.keys(groups)) {
  assert.notDeepEqual(view(group, 'world').slice(0, 2), view(group, 'moved').slice(0, 2));
  assert.equal(state(`${group}-moved`).buildLastKey, 'KeyW:up');
  if (group.startsWith('blood')) assert.equal(state(`${group}-moved`).lastInput, '1024,0,0,0');
  else {
    assert.match(observations[`${group}-world`].log, /E1L1: HOLLYWOOD HOLOCAUST/);
    assert.deepEqual(view(group, 'moved'), view(group, 'fired'));
  }
}
assert.match(observations['blood-modern-world'].log, /Level loaded and playable: e1m1/);
assert.match(observations['blood-classic-world'].log, /Level loaded and playable: E1M1/);
assert.equal(new URL(observations['blood-classic-world'].url).searchParams.get('autostart'), '1');
assert.deepEqual(view('blood-modern', 'moved'), view('blood-modern', 'resumed'));
assert.match(observations['blood-modern-resumed'].log, /Wrote modernized_cvars\.cfg/);
assert.match(observations['blood-modern-reloaded'].log, /Executing modernized_cvars\.cfg/);
assert.equal(state('blood-modern-reloaded').wasmDataSource, 'cache');
assert.equal(state('blood-modern-reloaded').bloodControlsValid, 'true');
const packageFile = 'build-family-package-2026-09-06.json';
const p = JSON.parse(fs.readFileSync(path.join(dir, packageFile)));
assert.equal(p.candidate.port, 32989); assert.equal(p.nativeModules, 4); assert.equal(p.siteFiles, 26);
assert.equal(p.sourceTree, '4a724072809f49588749b7b51e6d761c551933de');
const files = Object.keys(observations).flatMap(stem => [name(stem), name(stem, 'jpg')]).concat([
  packageFile, 'blood-modernized-slots-source-2026-09-06.json', 'blood-controls-slots-2026-09-06.json'
]);
const hashes = Object.fromEntries(files.map(file => [file, createHash('sha256').update(fs.readFileSync(path.join(dir, file))).digest('hex')]));
const result = { observedAt: new Date().toISOString(), audited: true, deployed: false, fullGameAccepted: false,
  scope: 'Current assembled four-module first-level rendering and real W taps; Blood menu/reload diagnostic fix; Duke firing screenshots visually checked, not automatic ammo OCR',
  chromePairs: Object.keys(observations).length, hashedFiles: files.length, modulesReachedGameplay: Object.keys(groups),
  knownSDKUniformWarnings: true, inputCaptureEstablished: false,
  remaining: ['broader gameplay/combat and renderer fidelity', 'held controls/capture/fullscreen',
    'audio listening', 'live promotion', 'deferred Blood crash reproduction'], hashes };
if (process.env.BUILD_FAMILY_EVIDENCE_PROOF) fs.writeFileSync(process.env.BUILD_FAMILY_EVIDENCE_PROOF,
  JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(result, null, 2));
