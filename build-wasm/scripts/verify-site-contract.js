#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const repo = path.resolve(__dirname, '..');
const web = path.join(repo, 'web');
const dist = path.join(repo, 'build-web', 'dist');
const framework = process.env.WASM_FRAMEWORK_DIR
  ? path.resolve(process.env.WASM_FRAMEWORK_DIR)
  : path.resolve(repo, '../wasm-game-framework');
const config = JSON.parse(fs.readFileSync(path.join(web, 'wasm-game.json'), 'utf8'));
const data = JSON.parse(fs.readFileSync(path.join(web, 'wasm-game-data.json'), 'utf8'));
const variants = ['blood', 'duke3d'];
const statusDocs = ['README.md', 'RUNBOOK.md'].map(filename =>
  fs.readFileSync(path.join(repo, filename), 'utf8'));

assert.equal(JSON.parse(fs.readFileSync(path.join(framework, 'package.json'), 'utf8')).version, '0.9.4');
assert.equal(childProcess.execFileSync('git', ['-C', framework, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), 'c4ad3b9e075f881d32f044299fbfeee703a9169d');
assert.equal(fs.existsSync(path.join(framework, 'dist', 'wasm-game-framework.js')), true);
assert.equal(fs.existsSync(path.join(framework, 'dist', 'wasm-game-bootstrap.js')), true);
assert.equal(fs.existsSync(path.join(framework, 'dist', 'wolfwasm-shell.js')), false);
if (fs.existsSync(dist)) {
  assert.equal(JSON.parse(fs.readFileSync(path.join(dist, 'shared-shell', 'wasm-game-framework.json'), 'utf8')).version, '0.9.4');
}

for (const contents of statusDocs) {
  assert.match(contents, /\| Blood \| Still in development \|/);
  assert.match(contents, /\| Duke Nukem 3D \| Still in development \|/);
  assert.doesNotMatch(contents, /partially working|mostly working/i);
}

for (const forbidden of ['index.html', 'service-worker.js', 'app.webmanifest', 'wasm-game-config.js']) {
  assert.equal(fs.existsSync(path.join(web, forbidden)), false, `the framework must own ${forbidden}`);
}
assert.equal(config.id, 'build-family');
assert.equal(config.title, 'Build Engine WASM Suite');
assert.equal(config.adapter, '/game-adapter.js');
assert.equal(config.preferencesNamespace, 'build-family');
assert.equal(config.defaultVariant, 'blood');
assert.equal(config.fullscreen, true);
assert.equal(config.defaultFullscreen, false);
assert.equal(config.pointerLock, true);
assert.deepEqual(Object.keys(config.variants), variants);
assert.equal(data.namespace, 'build-family');
assert.deepEqual(Object.keys(data.variants), variants);

function pngSize(filename) {
  const bytes = fs.readFileSync(filename);
  assert.deepEqual(bytes.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}

for (const key of variants) {
  const variant = config.variants[key];
  assert.equal(variant.displayMode, '4:3');
  assert.equal(variant.canvasWidth, 800);
  assert.equal(variant.canvasHeight, 600);
  assert.equal(variant.nativeManaged, false);
  assert.equal(variant.syncBackbuffer, false);
  assert.equal(variant.pixelated, true);
  assert.equal(variant.fps, false);
  assert.equal(variant.dynamicQuality, false);
  assert.equal(variant.controller.mode, 'disabled');
  assert.deepEqual(variant.profiles.map(profile => profile.value), ['classic']);
  assert.equal(variant.defaultProfile, 'classic');
  assert.match(variant.description, /horizontal-only mouse look/);
  assert.match(variant.pwa.id, /^\/apps\/build\//);
  assert.deepEqual(variant.pwa.icons.map(icon => icon.sizes), ['192x192', '512x512']);
  assert.ok(variant.icon && variant.background);
  if (fs.existsSync(dist)) {
    for (const filename of [variant.icon, variant.background, ...variant.pwa.icons.map(icon => icon.src)]) {
      assert.ok(fs.existsSync(path.join(dist, filename.replace(/^\//, ''))), `${key} asset missing: ${filename}`);
    }
    for (const icon of variant.pwa.icons) {
      const size = Number(icon.sizes.split('x')[0]);
      assert.deepEqual(pngSize(path.join(dist, icon.src.replace(/^\//, ''))), [size, size]);
    }
  }
}
assert.equal(config.variants.blood.menuCursor, 'none');
assert.equal(config.variants.duke3d.menuCursor, 'native');

const blood = data.variants.blood;
assert.equal(blood.namespace, 'build-blood-retail');
assert.equal(blood.files.length, 57);
assert.equal(blood.files.filter(file => file.required !== false).length, 24);
assert.equal(blood.files.filter(file => file.required === false).length, 33);
for (const file of blood.files) {
  assert.ok(Number.isSafeInteger(file.size) && file.size > 0);
  assert.match(file.sha256, /^[a-f0-9]{64}$/);
}
assert.deepEqual(blood.files.filter(file => /^tiles\d+\.art$/.test(file.key)).map(file => file.path),
  Array.from({ length: 18 }, (_, index) => `TILES${String(index).padStart(3, '0')}.ART`));

const duke = data.variants.duke3d;
assert.equal(duke.namespace, 'build-duke3d-registered');
assert.deepEqual(duke.files.map(file => file.path), ['DUKE3D.GRP', 'DUKE.RTS']);
assert.equal(duke.files[0].size, 26524524);
assert.equal(duke.files[0].magic, 'KenSilverman');
assert.equal(duke.files[0].sha256, '7c729a8f1f2877869feab30b77a062812cd927b8209452892c1b51d69247babc');
assert.equal(duke.files[1].size, 188954);
assert.equal(duke.files[1].magic, 'IWAD');
assert.equal(duke.files[1].sha256, '3fbc1d9b221f2a6952825a511ed63756f8eac4f98001eb094a81f17cb0fd05e5');
assert.equal(duke.files[1].required, false);

const familyAdapter = fs.readFileSync(path.join(web, 'game-adapter.js'), 'utf8');
const bloodAdapter = fs.readFileSync(path.join(web, 'blood-adapter.js'), 'utf8');
const dukeAdapter = fs.readFileSync(path.join(web, 'duke3d-adapter.js'), 'utf8');
assert.match(familyAdapter, /blood: '\/adapters\/blood\.js'/);
assert.match(familyAdapter, /duke3d: '\/adapters\/duke3d\.js'/);
for (const source of [familyAdapter, bloodAdapter, dukeAdapter]) {
  assert.equal(source.includes('WolfWasmShell'), false);
  assert.match(source, /globalThis\.WasmGameAdapter/);
}
for (const source of [bloodAdapter, dukeAdapter]) {
  assert.match(source, /ctx\.framework\.createOwnerDataSet/);
  assert.match(source, /ctx\.dataClient\.load/);
  assert.match(source, /ctx\.framework\.mountOwnerFiles/);
  assert.match(source, /root: '\/game'/);
  assert.match(source, /mode: 'memfs'/);
  assert.match(source, /preservePaths: true/);
}

console.log('Verified framework 0.9.4, persistence, disabled controllers, cursor policy, family dispatch, fixed classic profiles, PWA metadata, and exact data contracts.');
