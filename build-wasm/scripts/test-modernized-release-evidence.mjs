#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../proofs');
const hash = file => createHash('sha256').update(fs.readFileSync(path.join(dir, file))).digest('hex');
const filename = (stem, ext = 'json') => `build-release-${stem}-2026-09-06.${ext}`;
const releaseFile = 'build-modernized-release-package-2026-09-06.json';
const release = JSON.parse(fs.readFileSync(path.join(dir, releaseFile)));
assert.equal(release.deployed, true);
const observations = {}, files = [releaseFile, 'build-modernized-release-before-2026-09-06.json'];
function read(stem, game, profile, state) {
  const record = JSON.parse(fs.readFileSync(path.join(dir, filename(stem)))), o = record.observation;
  const variant = game === 'blood' ? 'blood' : 'duke3d';
  assert(new Date(record.observedAt) > new Date(release.containers[`wasm-${variant}`].startedAt));
  assert.equal(o.url, `http://127.0.0.1:${game === 'blood' ? 8007 : 18007}/`);
  for (const [key, value] of Object.entries({ wasmGameMode: 'single', wasmGameVariant: variant,
    shellDataReady: 'true', shellEngineState: state, [`${game}Profile`]: profile,
    shellInputCaptured: 'false' })) assert.equal(o.root[key], value, `${stem}: ${key}`);
  assert.equal(o.pointerLock, null); assert.equal(o.fullscreen, null);
  if (state !== 'launcher') {
    const modern = profile === 'modernized', width = modern ? 1280 : 800, height = modern ? 720 : 600;
    for (const [key, value] of Object.entries({ persistence: 'ready', audioState: 'running',
      [`${game}ControlsMask`]: '31', [`${game}ControlsValid`]: 'true',
      buildRenderMode: modern ? '3' : '0', buildRenderBpp: modern ? '32' : '8',
      buildRenderSize: `${width}x${height}`, wasmDataSource: 'cache' })) assert.equal(o.root[key], value, `${stem}: ${key}`);
    assert.equal(o.canvas[0].width, width); assert.equal(o.canvas[0].height, height);
    assert(Math.abs(o.canvas[0].cssWidth / o.canvas[0].cssHeight - width / height) < 0.003);
    assert.doesNotMatch(o.log, /\[GPU (?:driver|draw|pending|world|probe)\]|Invalid WebGL|null function|Compile Status: 0|memory access out of bounds/);
  }
  files.push(filename(stem), filename(stem, 'jpg')); observations[stem] = o;
  return o;
}
for (const game of ['blood', 'duke']) for (const profile of ['classic', 'modernized']) {
  const group = `${game}-${profile === 'modernized' ? 'modern' : 'classic'}`;
  for (const stem of ['launcher', 'menu', 'world', 'moved', ...(game === 'duke' ? ['fired'] : [])])
    read(`${group}-${stem}`, game, profile, ['launcher', 'menu'].includes(stem) ? stem : 'gameplay');
  const world = observations[`${group}-world`], moved = observations[`${group}-moved`];
  const field = game === 'blood' ? 'playerPosition' : 'dukePlayerView';
  assert.notDeepEqual(world.root[field].split(',').slice(0, 2), moved.root[field].split(',').slice(0, 2));
  assert.equal(moved.root.buildLastKey, 'KeyW:up');
  if (game === 'blood') {
    assert.equal(moved.root.lastInput, '1024,0,0,0');
    assert.equal(world.root.level, 'e1m1');
    assert.match(world.log, /Playing CD-audio replacement blood03\.ogg/);
  } else {
    assert.match(world.log, /E1L1: HOLLYWOOD HOLOCAUST/);
    assert.equal(moved.root[field], observations[`${group}-fired`].root[field]);
    assert.equal(observations[`${group}-fired`].root.buildNativeClickState, '3');
  }
}
read('blood-return-classic', 'blood', 'classic', 'launcher');
read('blood-return-confirmed', 'blood', 'classic', 'launcher');
read('duke-return-classic', 'duke', 'classic', 'launcher');
const result = { observedAt: new Date().toISOString(), audited: true, deployed: true, fullGameAccepted: false,
  scope: 'Both live locked origins, actual Classic/Modernized selection, native campaign entry, W taps and visually reviewed Duke ammo 48→47 Classic / 48→46 Modernized',
  chromePairs: Object.keys(observations).length, hashedFiles: files.length,
  liveImages: { blood: release.images.blood.id, duke3d: release.images.duke3d.id },
  originalProfileSelectionsRestored: true, savesCreated: 0, savesOverwritten: 0,
  screenshotTimingNote: 'blood-return-classic DOM had updated before its image; the later return-confirmed pair verifies the settled Classic launcher',
  remaining: ['Blood crash reproduction deferred by user', 'broader gameplay/renderer fidelity',
    'held controls/pointer capture/fullscreen', 'audio listening', 'known SDK uniform and texture-cache diagnostics'],
  hashes: Object.fromEntries(files.map(file => [file, hash(file)])) };
if (process.env.BUILD_RELEASE_EVIDENCE_PROOF) fs.writeFileSync(process.env.BUILD_RELEASE_EVIDENCE_PROOF,
  JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(result, null, 2));
