#!/usr/bin/env node
// Read-only, scoped release audit. Only the optional wx proof output writes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const proofDir = path.join(root, 'proofs');
const mode = process.argv[2];
assert(['before', 'after'].includes(mode), 'usage: test-input-release.mjs before|after');
const hash = value => createHash('sha256').update(value).digest('hex');
const run = args => execFileSync('docker', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).trim();
const inspect = ref => JSON.parse(run(['inspect', ref]))[0];
const services = { wolf3d: { port: 8011, candidatePort: 32992, stem: 'wolf' },
  spear: { port: 8012, candidatePort: 32993, stem: 'spear' } };
const images = {}, http = {}, evidence = {};
for (const [game, config] of Object.entries(services)) {
  const tag = `local/${game}-wasm:input-edges-20260906`;
  const checked = JSON.parse(execFileSync(process.execPath,
    [path.join(root, 'scripts/test-image-package.mjs'), tag, game], { encoding: 'utf8' }));
  images[game] = checked;
  const base = `http://127.0.0.1:${mode === 'before' ? config.candidatePort : config.port}`;
  const readyResponse = await fetch(`${base}/game-data/status`);
  assert.equal(readyResponse.status, 200);
  const ready = await readyResponse.json();
  assert.equal(ready.variant, game); assert.equal(ready.ready, true);
  const locked = await fetch(`${base}/wasm-game-config.js`).then(r => r.text());
  assert(locked.includes(`WASM_GAME_VARIANT = "${game}"`));
  // The shared-shell metadata/template copies are image assets, not public
  // routes. The framework manifest is served at the root and checked there.
  const expected = Object.fromEntries(Object.entries(checked.files).filter(([file]) =>
    !['shared-shell/index.html', 'shared-shell/wasm-game-framework.json'].includes(file)));
  for (const [file, sha] of Object.entries(expected)) {
    const response = await fetch(`${base}/${file}`); assert.equal(response.status, 200, file);
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(hash(bytes), sha, `${game}/${file}`);
    if (file.endsWith('.wasm')) assert(WebAssembly.validate(bytes));
  }
  http[game] = { base, ready: true, checkedFiles: Object.keys(expected).length };
  for (const [suffix, state] of [['menu', 'menu'], ['world', 'gameplay'], ['forward', 'gameplay'],
    ['fire-one', 'gameplay'], ['pause', 'paused'], ['resumed', 'gameplay'], ['resume-fire', 'gameplay']]) {
    const stem = `${config.stem}-input-${suffix}-2026-09-06`;
    const record = JSON.parse(fs.readFileSync(path.join(proofDir, `${stem}.json`)));
    assert.equal(record.observation.url, `http://127.0.0.1:${config.candidatePort}/`);
    assert.equal(record.observation.root.wasmGameVariant, game);
    assert.equal(record.observation.root.shellEngineState, state);
    assert.equal(record.observation.root.wolf3dControlsValid, 'true');
    for (const ext of ['json', 'jpg']) evidence[`${stem}.${ext}`] = hash(fs.readFileSync(path.join(proofDir, `${stem}.${ext}`)));
  }
}
const ids = run(['ps', '-aq']).split(/\s+/).filter(Boolean);
const containers = Object.fromEntries(JSON.parse(run(['inspect', ...ids])).map(c => [c.Name.slice(1), {
  id: c.Id, image: c.Image, status: c.State.Status, startedAt: c.State.StartedAt,
  mounts: c.Mounts.map(m => ({ type: m.Type, source: m.Source, destination: m.Destination, rw: m.RW }))
    .sort((a, b) => a.destination.localeCompare(b.destination)),
  ports: c.HostConfig.PortBindings
}]));
const ownerDir = '/home/ted/wasm-game-data/wolf3d', ownerData = {};
for (const file of fs.readdirSync(ownerDir, { recursive: true }).sort()) {
  const full = path.join(ownerDir, file);
  if (fs.statSync(full).isFile()) ownerData[file] = hash(fs.readFileSync(full));
}
const patches = Object.fromEntries(fs.readFileSync(path.join(root, 'patches/series'), 'utf8')
  .split('\n').map(x => x.trim()).filter(x => x && !x.startsWith('#'))
  .map(file => [file, hash(fs.readFileSync(path.join(root, 'patches', file)))]));
const result = { observedAt: new Date().toISOString(), mode, images, http, evidence, patches,
  containers, ownerData, fullGameAccepted: false };
if (mode === 'before') {
  for (const [game, config] of Object.entries(services)) {
    const live = containers[`wasm-${game}`];
    assert.equal(live.status, 'running');
    assert.equal(inspect(`${game}-wasm:dev`).Id, live.image);
    const candidate = containers[`${config.stem}-input-proof-20260906`];
    assert.equal(candidate.image, images[game].id); assert.equal(candidate.status, 'running');
    assert(candidate.mounts.some(m => m.source === ownerDir && m.destination === '/data/wolf3d' && m.rw === false));
  }
} else {
  const before = JSON.parse(fs.readFileSync(path.join(proofDir, 'input-release-before-2026-09-06.json')));
  for (const key of ['images', 'evidence', 'patches', 'ownerData']) assert.deepEqual(result[key], before[key], key);
  assert.deepEqual(Object.keys(containers).sort(), Object.keys(before.containers).sort());
  const changed = new Set(Object.keys(services).map(game => `wasm-${game}`));
  for (const [name, c] of Object.entries(containers)) if (!changed.has(name))
    assert.deepEqual(c, before.containers[name], `unrelated container changed: ${name}`);
  for (const game of Object.keys(services)) {
    const c = containers[`wasm-${game}`], old = before.containers[`wasm-${game}`];
    assert.equal(c.status, 'running'); assert.equal(c.image, images[game].id); assert.notEqual(c.id, old.id);
    assert.deepEqual(c.mounts, old.mounts); assert.deepEqual(c.ports, old.ports);
    assert.equal(inspect(`${game}-wasm:dev`).Id, c.image);
    assert.equal(inspect(`local/${game}-wasm:before-input-20260906`).Id, old.image);
  }
  result.otherContainersUnchanged = Object.keys(containers).length - changed.size;
  result.ownerFilesUnchanged = Object.keys(ownerData).length;
  result.deployed = true;
}
if (process.env.WOLF_RELEASE_PROOF) fs.writeFileSync(process.env.WOLF_RELEASE_PROOF,
  JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ mode, images: Object.fromEntries(Object.entries(images).map(([g, x]) => [g, x.id])),
  http, containers: Object.keys(containers).length, ownerFiles: Object.keys(ownerData).length,
  otherContainersUnchanged: result.otherContainersUnchanged, audited: true }, null, 2));
