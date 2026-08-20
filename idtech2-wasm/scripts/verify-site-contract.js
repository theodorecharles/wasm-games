#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const repo = path.resolve(__dirname, '..');
const web = path.join(repo, 'web');
const dist = path.join(web, 'dist');
const framework = process.env.WASM_FRAMEWORK_DIR
  ? path.resolve(process.env.WASM_FRAMEWORK_DIR)
  : path.resolve(repo, '../wasm-game-framework');
const config = JSON.parse(fs.readFileSync(path.join(web, 'wasm-game.json'), 'utf8'));
const data = JSON.parse(fs.readFileSync(path.join(web, 'wasm-game-data.json'), 'utf8'));
const variants = ['quake', 'quake2'];
const quake2Runbook = fs.readFileSync(path.join(repo, 'engines/quake2/RUNBOOK.md'), 'utf8');

assert.equal(JSON.parse(fs.readFileSync(path.join(framework, 'package.json'), 'utf8')).version, '0.9.4');
assert.equal(childProcess.execFileSync('git', ['-C', framework, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), 'c4ad3b9e075f881d32f044299fbfeee703a9169d');
assert.equal(fs.existsSync(path.join(framework, 'dist', 'wasm-game-framework.js')), true);
assert.equal(fs.existsSync(path.join(framework, 'dist', 'wasm-game-bootstrap.js')), true);
assert.equal(fs.existsSync(path.join(framework, 'dist', 'wolfwasm-shell.js')), false);

for (const forbidden of ['index.html', 'service-worker.js', 'app.webmanifest', 'wasm-game-config.js']) {
  assert.equal(fs.existsSync(path.join(web, forbidden)), false, `the framework must own ${forbidden}`);
}
assert.deepEqual(Object.keys(config.variants), variants);
assert.deepEqual(Object.keys(data.variants), variants);
assert.equal(config.id, 'idtech2-family');
assert.equal(config.title, 'id Tech 2 WASM Suite');
assert.equal(config.defaultVariant, 'quake');
assert.equal(config.preferencesNamespace, 'idtech2-family');
assert.equal(config.adapter, '/game-adapter.js');
assert.equal(config.fullscreen, true);
assert.equal(config.defaultFullscreen, false);
assert.equal(config.pointerLock, true);
assert.equal(data.namespace, 'idtech2-family');
assert.doesNotMatch(quake2Runbook, /\|\s*(?:Passed(?: with gesture caveat)?|Partial|Not implemented)\s*\|/i,
  'public milestone status labels must use only Live or Still in development');
assert.equal((quake2Runbook.match(/\| Still in development \|/g) || []).length, 10,
  'every Quake II milestone must use the portfolio status vocabulary');

const quake = config.variants.quake;
assert.equal(quake.displayMode, '4:3');
assert.equal(quake.canvasWidth, 640);
assert.equal(quake.canvasHeight, 480);
assert.equal(quake.nativeManaged, true);
assert.equal(quake.syncBackbuffer, false);
assert.equal(quake.pixelated, true);
assert.equal(quake.fps, false);
assert.equal(quake.dynamicQuality, false);
assert.deepEqual(quake.profiles.map(profile => profile.value), ['original', 'modernized']);
assert.equal(quake.defaultProfile, 'original');

const quake2 = config.variants.quake2;
assert.equal(quake2.displayMode, 'dynamic');
assert.equal(quake2.nativeManaged, true);
assert.equal(quake2.syncBackbuffer, false);
assert.equal(quake2.pixelated, false);
assert.deepEqual(quake2.profiles.map(profile => profile.value), ['medium', 'high', 'ultra']);
assert.deepEqual(quake2.fpsTargets, [30, 60, 120]);
assert.equal(quake2.dynamicQuality, true);
assert.equal(quake.menuCursor, 'none');
assert.equal(quake2.menuCursor, 'browser');

function pngSize(filename) {
  const bytes = fs.readFileSync(filename);
  assert.deepEqual(bytes.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}

for (const key of variants) {
  const variant = config.variants[key];
  assert.match(variant.pwa.id, /^\/apps\/idtech2\//);
  assert.deepEqual(variant.pwa.icons.map(icon => icon.sizes), ['192x192', '512x512']);
  assert.ok(variant.icon && variant.background);
  assert.equal(variant.controller.mode, 'disabled');
  assert.equal(variant.persistence.root, '/persistent/idtech2/{variant}');
  if (fs.existsSync(dist)) {
    for (const filename of [variant.icon, variant.background, ...variant.pwa.icons.map(icon => icon.src)]) {
      assert.ok(fs.existsSync(path.join(dist, filename.replace(/^\//, ''))), `${key} asset missing: ${filename}`);
    }
    for (const icon of variant.pwa.icons) {
      const size = Number(icon.sizes.split('x')[0]);
      assert.deepEqual(pngSize(path.join(dist, icon.src.replace(/^\//, ''))), [size, size]);
    }
  }
  for (const file of data.variants[key].files) {
    assert.ok(Number.isSafeInteger(file.size) && file.size > 0, `${key}/${file.key} needs an exact size`);
    assert.equal(file.magic, 'PACK');
    assert.match(file.sha256, /^[a-f0-9]{64}$/);
  }
}
assert.deepEqual(data.variants.quake.files.map(file => file.path), ['id1/pak0.pak', 'id1/pak1.pak']);
assert.deepEqual(data.variants.quake2.files.map(file => file.path), ['pak0.pak', 'pak1.pak', 'pak2.pak']);

const familyAdapter = fs.readFileSync(path.join(web, 'game-adapter.js'), 'utf8');
const quakeAdapter = fs.readFileSync(path.join(web, 'quake-adapter.js'), 'utf8');
const quake2Adapter = fs.readFileSync(path.join(repo, 'engines/quake2/web/game-adapter.js'), 'utf8');
assert.match(familyAdapter, /quake: '\/adapters\/quake\.js'/);
assert.match(familyAdapter, /quake2: '\/adapters\/quake2\.js'/);
for (const source of [familyAdapter, quakeAdapter, quake2Adapter]) {
  assert.equal(source.includes('WolfWasmShell'), false);
  assert.match(source, /globalThis\.WasmGameAdapter/);
}
for (const source of [quakeAdapter, quake2Adapter]) {
  assert.match(source, /ctx\.framework\.createOwnerDataSet/);
  assert.match(source, /ctx\.dataClient\.load/);
  assert.match(source, /ctx\.persistence\.attach/);
  assert.match(source, /controllerFrame/);
  assert.match(source, /controllerChanged/);
}

console.log('Verified framework 0.9.4, family dispatch, disabled-controller policy, PWA/display policy, and exact game-data contracts.');
