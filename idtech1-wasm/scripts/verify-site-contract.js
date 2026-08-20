#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const repo = path.resolve(__dirname, '..');
const web = path.join(repo, 'web');
const framework = process.env.WASM_FRAMEWORK_DIR
  ? path.resolve(process.env.WASM_FRAMEWORK_DIR)
  : path.resolve(repo, '../wasm-game-framework');
const config = JSON.parse(fs.readFileSync(path.join(web, 'wasm-game.json'), 'utf8'));
const data = JSON.parse(fs.readFileSync(path.join(web, 'wasm-game-data.json'), 'utf8'));
const expected = ['doom', 'doom2', 'tnt', 'plutonia', 'heretic', 'hexen', 'chex'];
assert.equal(config.menuCursor, 'none');
const frameworkCommit = 'c4ad3b9e075f881d32f044299fbfeee703a9169d';

assert.equal(JSON.parse(fs.readFileSync(path.join(framework, 'package.json'), 'utf8')).version, '0.9.4');
assert.equal(childProcess.execFileSync('git', ['-C', framework, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), frameworkCommit);
assert.equal(fs.existsSync(path.join(framework, 'dist', 'wasm-game-framework.js')), true);
assert.equal(fs.existsSync(path.join(framework, 'dist', 'wasm-game-bootstrap.js')), true);
assert.equal(fs.existsSync(path.join(framework, 'dist', 'wolfwasm-shell.js')), false);
assert.equal(fs.existsSync(path.join(web, 'index.html')), false, 'the framework, not this repository, must own index.html');
assert.equal(fs.existsSync(path.join(web, 'wasm-game-config.js')), false, 'the framework injects the deployment variant');
assert.equal(fs.existsSync(path.join(web, 'service-worker.js')), false, 'the framework must own the service worker');
assert.equal(fs.existsSync(path.join(web, 'app.webmanifest')), false, 'the framework must render the web manifest');
assert.deepEqual(Object.keys(config.variants), expected);
assert.deepEqual(Object.keys(data.variants), expected);
assert.equal(config.id, 'idtech1-family');
assert.equal(config.title, 'id Tech 1 WASM Suite');
assert.equal(config.preferencesNamespace, 'idtech1-family');
assert.equal(data.namespace, 'idtech1-family');
assert.equal(config.adapter, '/game-adapter.js');
assert.equal(config.identity, false);
assert.equal(config.nativeManaged, true);
assert.equal(config.fullscreen, true);
assert.equal(fs.readFileSync(path.join(web, 'game-adapter.js'), 'utf8').includes('WolfWasmShell'), false);
assert.equal(fs.existsSync(path.join(web, 'data-validator.mjs')), true);
assert.deepEqual(data.validator, {
  module: '/data-validator.mjs',
  export: 'validateIdTech1Data',
  version: 'idtech1-wad-directory-v2',
  maxReadBytes: 1048576,
  maxTotalReadBytes: 1048600,
  policy: { maxLumps: 65536 }
});

function pngSize(filename) {
  const bytes = fs.readFileSync(filename);
  assert.deepEqual(bytes.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}

for (const key of expected) {
  const variant = config.variants[key];
  assert.equal(variant.displayMode, '4:3', `${key} must start with the fixed classic display policy`);
  assert.ok(variant.icon && variant.background, `${key} needs explicit icon/background policy`);
  assert.ok(fs.existsSync(path.join(web, variant.icon.replace(/^\//, ''))), `${key} icon is missing`);
  assert.ok(fs.existsSync(path.join(web, variant.background.replace(/^\//, ''))), `${key} background is missing`);
  assert.match(variant.pwa.id, /^\/apps\/idtech1\//, `${key} needs stable PWA identity`);
  assert.deepEqual(variant.pwa.icons.map(icon => icon.sizes), ['192x192', '512x512']);
  for (const icon of variant.pwa.icons) {
    const filename = path.join(web, icon.src.replace(/^\//, ''));
    assert.ok(fs.existsSync(filename), `${key} PWA icon is missing: ${icon.src}`);
    const size = Number(icon.sizes.split('x')[0]);
    assert.deepEqual(pngSize(filename), [size, size], `${key} PWA icon dimensions disagree with the manifest`);
  }
  assert.deepEqual(variant.profiles.slice(0, 2).map(profile => profile.value), ['original', 'smooth']);
  assert.ok(data.variants[key].files.some(file => file.key === 'iwad' && file.required !== false));
  for (const file of data.variants[key].files) {
    assert.equal(file.minSize, 12, `${key}/${file.key} needs a finite lower envelope`);
    assert.equal(file.maxSize, 67108864, `${key}/${file.key} needs a finite upper envelope`);
    assert.equal(file.size, undefined, `${key}/${file.key} must not retain a one-release size gate`);
    assert.equal(file.sha256, undefined, `${key}/${file.key} must not retain a one-release digest gate`);
    assert.equal(file.magic, undefined, `${key}/${file.key} format validation belongs in the downstream module`);
    assert.equal(file.validator.policy.family, key);
    assert.equal(file.validator.policy.identification, key === 'chex' ? 'PWAD' : 'IWAD');
  }
}

for (const key of ['doom', 'doom2', 'tnt', 'plutonia', 'heretic', 'hexen', 'chex']) {
  assert.ok(config.variants[key].profiles.some(profile => profile.value === 'modernized'));
}

const adapterSource = fs.readFileSync(path.join(web, 'game-adapter.js'), 'utf8');
assert.equal(adapterSource.includes('sha256Hex'), false, 'the adapter must not implement file-format validation');
assert.equal(adapterSource.includes('failed exact SHA-256 verification'), false);
console.log('Verified generic framework 0.9.4 site/PWA/validator contract for 7 id Tech 1 variants.');
