#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const web = path.join(repo, 'web');
const framework = path.resolve(process.env.WASM_FRAMEWORK_DIR || path.join(repo, '../wasm-game-framework'));
const config = JSON.parse(readFileSync(path.join(web, 'wasm-game.json'), 'utf8'));
const data = JSON.parse(readFileSync(path.join(web, 'wasm-game-data.json'), 'utf8'));
const expected = ['half-life', 'blue-shift', 'opposing-force', 'counter-strike'];

assert.equal(JSON.parse(readFileSync(path.join(framework, 'package.json'), 'utf8')).version, '0.9.6');
assert.equal(execFileSync('git', ['-C', framework, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), 'ebb1ebe35ad8224a9080279a6529414db42d3284');
assert.equal(existsSync(path.join(web, 'index.html')), false, 'the framework must own index.html');
assert.equal(existsSync(path.join(web, 'service-worker.js')), false, 'the framework must own the service worker');
assert.equal(existsSync(path.join(web, 'app.webmanifest')), false, 'the framework must render the web manifest');
assert.equal(readdirSync(web, { recursive: true }).some(name => String(name).endsWith('.css')), false, 'the framework must own CSS');
assert.deepEqual(Object.keys(config.variants), expected);
assert.deepEqual(Object.keys(data.variants), expected);
assert.equal(config.displayMode, 'dynamic');
assert.equal(config.syncBackbuffer, true);
assert.equal(config.resizeTransition, 'immediate');
assert.equal(config.fullscreen, true);
assert.equal(config.menuCursor, 'browser');
assert.equal(config.controller.mode, 'disabled');
assert.equal(config.persistence.root, '/persistent/goldsource/{variant}');
assert.equal(readFileSync(path.join(repo, 'src/framework-adapter.js'), 'utf8').includes('WolfWasmShell'), false);

for (const key of expected) {
  const variant = config.variants[key];
  const policy = data.variants[key];
  assert.ok(variant.icon && variant.background, `${key} needs launcher artwork policy`);
  assert.ok(existsSync(path.join(web, variant.icon.replace(/^\//, ''))), `${key} launcher icon is missing`);
  assert.ok(existsSync(path.join(web, variant.background.replace(/^\//, ''))), `${key} background is missing`);
  assert.match(variant.pwa.id, /^\/apps\/goldsource\//);
  assert.deepEqual(variant.pwa.icons.map(icon => icon.sizes), ['192x192', '512x512']);
  assert.ok(variant.pwa.icons.every(icon => icon.src.includes(`variant=${key}`)), `${key} PWA icons must be variant-scoped`);
  assert.ok(policy.files.some(file => file.key === 'valve' && file.required !== false));
  assert.ok(policy.files.some(file => file.key === 'valve-liblist' && file.mountName === 'valve/liblist.gam'),
    `${key} must mount the descriptor Xash uses to register the Valve directory`);
  assert.ok(policy.files.some(file => file.key === 'icon-192' && file.mount === false));
  assert.ok(policy.files.some(file => file.key === 'icon-512' && file.mount === false));
  for (const file of policy.files) {
    assert.ok(Number.isSafeInteger(file.size) && file.size > 0, `${key}/${file.key} needs an exact size`);
    assert.match(file.sha256, /^[a-f0-9]{64}$/, `${key}/${file.key} needs an exact SHA-256`);
  }
}

assert.equal(config.variants['blue-shift'].identity, false);
assert.match(config.variants['counter-strike'].description, /multiplayer/i);
assert.ok(data.variants['blue-shift'].files.some(file => file.key === 'bshift'));
assert.ok(data.variants['blue-shift'].files.some(file => file.key === 'bshift-liblist'));
assert.ok(data.variants['opposing-force'].files.some(file => file.key === 'gearbox'));
assert.ok(data.variants['opposing-force'].files.some(file => file.key === 'gearbox-liblist'));
assert.ok(data.variants['counter-strike'].files.some(file => file.key === 'cstrike'));
assert.ok(data.variants['counter-strike'].files.some(file => file.key === 'cstrike-liblist'));

const adapter = path.join(web, 'game-adapter.js');
assert.ok(existsSync(adapter) && statSync(adapter).size > 1000, 'built adapter is missing');
const artifacts = readdirSync(path.join(web, 'artifacts')).map(name => path.join(web, 'artifacts', name));
assert.ok(artifacts.filter(file => file.endsWith('.wasm')).length >= 9);
assert.ok(artifacts.some(file => file.endsWith('.pk3')));
const patchedCore = artifacts.find(file => /xash-framework-.*\.wasm$/.test(file));
assert.ok(patchedCore, 'the built site must use the patched native Xash core');
for (const symbol of [
  'WasmGame_RuntimeState', 'WasmGame_CaptureIntent', 'WasmGame_PlayerNameStatus',
  'WasmGame_SetInputCaptured', 'WasmGame_ControllerAction', 'WasmGame_ControllerMouse'
]) {
  assert.ok(readFileSync(patchedCore).includes(Buffer.from(symbol)), `patched Xash core does not export ${symbol}`);
}
assert.equal(artifacts.some(file => /\/xash-[A-Z0-9]+\.wasm$/.test(file)), false,
  'the package core without the framework state seam must not be shipped');
for (const file of artifacts.filter(file => file.endsWith('.wasm'))) {
  assert.deepEqual(readFileSync(file).subarray(0, 4), Buffer.from([0, 97, 115, 109]), `${path.basename(file)} is not WebAssembly`);
}
for (const file of artifacts.filter(file => file.endsWith('.pk3'))) {
  assert.deepEqual(readFileSync(file).subarray(0, 4), Buffer.from([80, 75, 3, 4]), `${path.basename(file)} is not PK3 data`);
}

const tracked = execFileSync('git', ['-C', repo, 'ls-files'], { encoding: 'utf8' }).split('\n').filter(Boolean);
for (const file of tracked) {
  assert.equal(/(^|\/)(dayone|hldm|uplink)\.zip$/i.test(file), false, `unlicensed demo archive remains tracked: ${file}`);
  assert.equal(/\.(wad|bsp|mdl|sav)$/i.test(file), false, `game-data asset remains tracked: ${file}`);
}
console.log('Verified GoldSource framework 0.9.6 suite, browser-cursor, disabled-controller, persistence, PWA, and game-data boundary contract.');
