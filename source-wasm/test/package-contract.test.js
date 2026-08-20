'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const checker = path.join(root, 'vendor', 'wasm-game-framework', 'scripts', 'check-game-package.js');
const site = path.join(root, 'web');
const result = spawnSync(process.execPath, [checker, site], { encoding: 'utf8' });
if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout || 'package contract failed\n');
  process.exit(result.status || 1);
}
process.stdout.write(result.stdout);

const lock = JSON.parse(fs.readFileSync(path.join(root, 'framework-lock.json'), 'utf8'));
if (lock.version !== '0.9.6' || lock.package !== '@wasm-game-framework/browser') {
  throw new Error(`framework lock is ${lock.package}@${lock.version}`);
}

const forbidden = ['index.html', 'service-worker.js', 'app.webmanifest'];
for (const name of forbidden) {
  if (fs.existsSync(path.join(site, name))) throw new Error(`forbidden downstream file ${name}`);
}
for (const name of fs.readdirSync(site)) {
  if (name.endsWith('.css') || name.endsWith('.webmanifest')) {
    throw new Error(`forbidden downstream file ${name}`);
  }
}

const dockerfile = fs.readFileSync(path.join(root, 'Dockerfile'), 'utf8');
if (/^COPY\s+web\/\s+/m.test(dockerfile)) {
  throw new Error('Dockerfile must not blanket-copy web/ (generated factory outputs are private)');
}
for (const asset of ['data-validator.mjs', 'game-adapter.js', 'icon.svg', 'wasm-game-data.json', 'wasm-game.json']) {
  if (!dockerfile.includes(`COPY web/${asset} /opt/game-site/${asset}`)) {
    throw new Error(`Dockerfile must explicitly copy ${asset}`);
  }
}

const manifest = JSON.parse(fs.readFileSync(path.join(site, 'wasm-game.json'), 'utf8'));
if (manifest.displayMode !== '16:9') throw new Error('displayMode must be fixed 16:9');
if (manifest.menuCursor !== 'browser') throw new Error('menuCursor must be browser');
if (manifest.pointerLock !== true) throw new Error('pointerLock must be true');
if (manifest.fullscreen !== true) throw new Error('fullscreen must be explicit true');
if (manifest.controller?.mode !== 'disabled') throw new Error('controller.mode must be disabled');
if (manifest.persistence?.root !== '/save/{variant}') throw new Error('persistence.root must be /save/{variant}');
if (manifest.nativeManaged !== false) throw new Error('nativeManaged must be false');
if (manifest.syncBackbuffer !== true) throw new Error('syncBackbuffer must be true');
if (!manifest.variants?.hl2) throw new Error('hl2 variant is required');
if (!manifest.variants?.portal) throw new Error('portal variant is required');
if (Object.keys(manifest.variants).some((key) => key !== 'hl2' && key !== 'portal')) {
  throw new Error('only the implemented hl2 and portal variants may be advertised');
}
if (!/Still in development/.test(manifest.description || '')) {
  throw new Error('product status must be Still in development');
}

const adapter = fs.readFileSync(path.join(site, 'game-adapter.js'), 'utf8');
if (!/WasmGameAdapter/.test(adapter) || !/start\s*\(/.test(adapter)) {
  throw new Error('adapter must expose WasmGameAdapter.start');
}
if (/requestPointerLock|exitPointerLock/.test(adapter)) {
  throw new Error('adapter must not call pointer lock');
}

if (!fs.existsSync(path.join(root, 'patches', 'series'))) {
  throw new Error('engine patch series is missing');
}
if (!fs.existsSync(path.join(root, 'scripts', 'apply-source-patches.mjs'))) {
  throw new Error('apply-source-patches.mjs is missing');
}
if (fs.existsSync(path.join(root, 'vendor', 'source-engine', 'wscript'))) {
  throw new Error('leaked engine tree must not be vendored');
}

process.stdout.write('source-wasm 0.9.6 package contract passed\n');
