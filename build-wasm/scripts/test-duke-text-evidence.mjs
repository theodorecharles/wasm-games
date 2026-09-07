#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const directory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../proofs');
const name = (stem, ext = 'json') => `duke-text-${stem}-2026-09-06.${ext}`;
const read = stem => JSON.parse(fs.readFileSync(path.join(directory, name(stem)), 'utf8'));
const groups = {
  modern: ['menu', 'world', 'moved', 'fired', 'save-menu', 'edit-empty', 'letter', 'tex', 'backspace',
    'name', 'saved', 'reload-menu', 'load-list', 'loaded', 'restored'],
  classic: ['menu', 'load-list', 'shared-restored', 'moved', 'save-list', 'name', 'saved',
    'reload-menu', 'reload-list', 'load-prompt', 'restored']
};
const observations = {};
for (const [profile, stems] of Object.entries(groups)) for (const stem of stems) {
  const id = `${profile}-${stem}`, o = read(id).observation;
  observations[id] = o;
  const modern = profile === 'modern', width = modern ? 1280 : 800, height = modern ? 720 : 600;
  assert.equal(new URL(o.url).port, '32986');
  for (const [key, value] of Object.entries({ dukeProfile: modern ? 'modernized' : 'classic',
    persistence: 'ready', audioState: 'running', buildRenderMode: modern ? '3' : '0',
    buildRenderBpp: modern ? '32' : '8', buildRenderSize: `${width}x${height}`, dukeControlsMask: '31' }))
    assert.equal(o.root[key], value, `${id}: ${key}`);
  assert.equal(o.canvas[0].width, width); assert.equal(o.canvas[0].height, height);
  assert(Math.abs(o.canvas[0].cssWidth / o.canvas[0].cssHeight - width / height) < 0.003);
  assert.equal(o.pointerLock, null); assert.equal(o.fullscreen, null);
  const gameplay = ['world', 'moved', 'fired', 'saved', 'restored', 'shared-restored'].includes(stem);
  assert.equal(o.root.shellEngineState, gameplay ? 'gameplay' : 'menu');
  assert.doesNotMatch(o.log, /\[GPU (?:driver|draw|pending|world|probe)\]|Invalid WebGL|null function|Compile Status: 0|memory access out of bounds/);
  if (modern) assert.match(o.log, /NPOT textures: 1 \(OpenGL ES 3.0\)/);
  // Existing SDK -1 uniform diagnostics are retained, not silently called a clean console.
}
const root = stem => observations[stem].root;
const view = stem => root(stem).dukePlayerView.split(',').map(Number);
for (const [before, after] of [['modern-world', 'modern-moved'], ['classic-shared-restored', 'classic-moved']]) {
  assert.notDeepEqual(view(before).slice(0, 2), view(after).slice(0, 2));
  assert.deepEqual(view(before).slice(2), view(after).slice(2));
  assert.equal(root(after).buildLastKey, 'KeyW:up');
}
for (const [stem, key, text] of [['letter', 'KeyT:up', '84:1'], ['tex', 'KeyX:up', '88:1'],
  ['backspace', 'Backspace:up', '8:1'], ['name', 'Digit7:up', '55:1'], ['saved', 'Enter:up', '13:1']]) {
  assert.equal(root(`modern-${stem}`).buildLastKey, key);
  assert.equal(root(`modern-${stem}`).buildTextInput, text);
}
assert.equal(root('modern-loaded').dukeMenuId, '1000', 'historical loaded stem records the confirmation, not the restored world');
assert.equal(root('classic-load-prompt').dukeMenuId, '1000');
assert.deepEqual(view('modern-fired'), view('modern-moved'));
assert.deepEqual(view('modern-saved'), view('modern-fired'));
assert.deepEqual(view('classic-shared-restored'), view('modern-saved'));
assert.deepEqual(view('classic-saved'), view('classic-moved'));
for (const [profile, file] of [['modern', 'save0000.esv'], ['classic', 'save0001.esv']]) {
  assert.match(observations[`${profile}-saved`].log, new RegExp(`Saved: ${file.replace('.', '\\.')}`));
  assert.equal(root(`${profile}-saved`).buildTextInput, '13:1');
  assert.equal(root(`${profile}-reload-menu`).wasmDataSource, 'cache');
  assert.equal(root(`${profile}-restored`).wasmDataSource, 'cache');
  assert.equal(root(`${profile}-restored`).buildLastKey, 'KeyY:up');
  assert.deepEqual(view(`${profile}-restored`), view(`${profile}-saved`));
  assert(fs.readFileSync(path.join(directory, name(`${profile}-saved`, 'jpg'))).equals(
    fs.readFileSync(path.join(directory, name(`${profile}-restored`, 'jpg')))), `${profile}: identical saved/restored view`);
}
const p = read('package'), previous = JSON.parse(fs.readFileSync(path.join(directory, 'duke-alpha-package-2026-09-06.json')));
assert.equal(p.classicEngineUnchanged, false); assert.equal(p.textInputBothProfiles, true);
assert.equal(p.bloodUnchanged, true); assert.equal(p.unchangedFiles, 17);
assert.equal(p.ownerDataReadOnly, true); assert.equal(p.drawObserverPresent, false);
assert.equal(Object.keys(p.files).length, 23);
assert.deepEqual(Object.keys(p.files).filter(file => p.files[file] !== previous.files[file]).sort(), [
  '/opt/game-site/adapters/duke3d.js', '/opt/game-site/duke3d-modernized.js', '/opt/game-site/duke3d-modernized.wasm',
  '/opt/game-site/duke3d.js', '/opt/game-site/duke3d.wasm'
]);
assert.deepEqual(p.base, previous.base); assert.deepEqual(p.rtcw, previous.rtcw);
const native = read('full-native');
assert.equal(native.records.length, 4);
for (const record of native.records) {
  if (record.negative) assert.match(record.log, /text input mismatch: editor content/);
  else assert.equal(JSON.parse(record.output).checks, 12296);
}
assert.equal(read('source').tree, '1f312ca675092f3f1f2a72ce5a67d494e3e58fd1');
const files = Object.keys(observations).flatMap(stem => [name(stem), name(stem, 'jpg')])
  .concat(['source', 'package', 'full-native'].map(stem => name(stem)));
const hashes = Object.fromEntries(files.map(file => [file,
  createHash('sha256').update(fs.readFileSync(path.join(directory, file))).digest('hex')]));
const result = { observedAt: new Date().toISOString(), audited: true, modernizedAccepted: false, deployed: false,
  scope: 'Actual Chrome text/edit/save/reload/load in both profiles, cross-profile load, exact native position/view and retained screenshot identity; not automatic OCR or full-game acceptance',
  chromePairs: Object.keys(observations).length, hashedFiles: files.length, nativeChecksPerTarget: 12296,
  createdSaves: ['TEXT7 / save0000.esv', 'C7 / save0001.esv'], savesOverwritten: 0,
  restoredModernizedView: view('modern-restored'), restoredClassicView: view('classic-restored'),
  inputCaptureEstablished: false, knownSDKUniformWarnings: true,
  remaining: ['wider gameplay and sprite fidelity', 'held controls/capture/fullscreen', 'audio listening',
    'SDK -1 uniform diagnostics', 'Blood Modernized', 'deployment'], hashes };
if (process.env.DUKE_TEXT_EVIDENCE_PROOF) fs.writeFileSync(process.env.DUKE_TEXT_EVIDENCE_PROOF,
  JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(result, null, 2));
