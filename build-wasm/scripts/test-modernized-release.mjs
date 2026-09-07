#!/usr/bin/env node
// Read-only release audit. Capture before replacing only blood and duke3d,
// then verify the deployed artifacts, preserved owner data and other services.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const proofDir = path.join(root, 'proofs');
const mode = process.argv[2];
assert(['before', 'after'].includes(mode), 'usage: test-modernized-release.mjs before|after');
const run = args => execFileSync('docker', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).trim();
const hash = value => createHash('sha256').update(value).digest('hex');
const read = name => JSON.parse(fs.readFileSync(path.join(proofDir, name)));
const reference = read('build-family-package-2026-09-06.json');
const chrome = read('build-family-evidence-2026-09-06.json');
assert.equal(chrome.chromePairs, 16); assert.equal(chrome.modulesReachedGameplay.length, 4);
for (const [file, sha] of Object.entries(chrome.hashes))
  assert.equal(hash(fs.readFileSync(path.join(proofDir, file))), sha, file);
const services = { blood: 8007, duke3d: 18007 };
const images = {};
for (const variant of ['suite', 'blood', 'duke3d']) {
  const tag = `local/${variant === 'suite' ? 'build' : variant}-wasm:modernized-release-20260906`;
  const info = JSON.parse(run(['image', 'inspect', tag]))[0];
  assert(info.Config.Env.includes(`WASM_GAME_VARIANT=${variant}`));
  assert.equal(info.Config.Labels['io.wasm-game-framework.version'], '0.9.6');
  const files = Object.keys(reference.files).map(file => `/opt/game-site/${file}`);
  files.push(...Object.keys(reference.shell).map(file => `/opt/shared-shell/${file}`));
  const installed = Object.fromEntries(run(['run', '--rm', '--read-only', '--entrypoint', 'sha256sum', tag, ...files])
    .split('\n').map(line => [line.slice(66), line.slice(0, 64)]));
  for (const [file, sha] of Object.entries(reference.files)) assert.equal(installed[`/opt/game-site/${file}`], sha, `${variant}/${file}`);
  for (const [file, sha] of Object.entries(reference.shell)) assert.equal(installed[`/opt/shared-shell/${file}`], sha, `${variant}/shell/${file}`);
  images[variant] = { tag, id: info.Id, verifiedFiles: files.length };
}
const log = fs.readFileSync('/tmp/build-family-release-images-20260906.log', 'utf8');
for (const variant of ['suite', 'blood', 'duke3d']) assert(log.includes(`(${variant}).`));
assert(log.includes('Verified optional password gate'));
const ids = run(['ps', '-aq']).split(/\s+/).filter(Boolean);
const containers = Object.fromEntries(JSON.parse(run(['inspect', ...ids])).map(c => [c.Name.slice(1), {
  id: c.Id, image: c.Image, status: c.State.Status, startedAt: c.State.StartedAt,
  mounts: c.Mounts.map(m => ({ type: m.Type, source: m.Source, destination: m.Destination, rw: m.RW }))
    .sort((a, b) => a.destination.localeCompare(b.destination)),
  ports: c.HostConfig.PortBindings
}]));
const ownerData = {};
for (const game of Object.keys(services)) {
  const dir = `/home/ted/wasm-game-data/${game}`;
  for (const file of fs.readdirSync(dir, { recursive: true }).sort()) {
    const full = path.join(dir, file);
    if (fs.statSync(full).isFile()) ownerData[`${game}/${file}`] = hash(fs.readFileSync(full));
  }
}
const result = { observedAt: new Date().toISOString(), mode, images, containers, ownerData,
  testedPackage: reference.candidate.image, chromeEvidenceHash: hash(fs.readFileSync(path.join(proofDir, 'build-family-evidence-2026-09-06.json'))),
  imageTestsLogHash: hash(log), fullGameAccepted: false };
if (mode === 'before') {
  for (const game of Object.keys(services)) {
    const c = containers[`wasm-${game}`];
    assert.equal(c.status, 'running');
    assert.equal(JSON.parse(run(['image', 'inspect', `${game}-wasm:dev`]))[0].Id, c.image);
  }
} else {
  const before = read('build-modernized-release-before-2026-09-06.json');
  // Docker does not promise inspect.Mounts order. Compare every mount field,
  // normalized by unique destination; preserve the frozen original snapshot.
  for (const c of Object.values(before.containers)) c.mounts.sort((a, b) => a.destination.localeCompare(b.destination));
  assert.deepEqual(images, before.images);
  assert.deepEqual(ownerData, before.ownerData, 'owner data changed');
  assert.deepEqual(Object.keys(containers).sort(), Object.keys(before.containers).sort());
  const changed = new Set(['wasm-blood', 'wasm-duke3d']);
  for (const [name, c] of Object.entries(containers)) if (!changed.has(name))
    assert.deepEqual(c, before.containers[name], `unrelated container changed: ${name}`);
  const http = {};
  for (const [game, port] of Object.entries(services)) {
    const c = containers[`wasm-${game}`], old = before.containers[`wasm-${game}`];
    assert.equal(c.status, 'running'); assert.equal(c.image, images[game].id); assert.notEqual(c.id, old.id);
    assert.deepEqual(c.mounts, old.mounts); assert.deepEqual(c.ports, old.ports);
    assert.equal(JSON.parse(run(['image', 'inspect', `${game}-wasm:dev`]))[0].Id, c.image);
    assert.equal(JSON.parse(run(['image', 'inspect', `local/${game}-wasm:before-modernized-20260906`]))[0].Id, old.image);
    const base = `http://127.0.0.1:${port}`;
    const config = await fetch(`${base}/wasm-game-config.js`).then(r => r.text());
    assert(config.includes(`WASM_GAME_VARIANT = "${game}"`));
    const ready = await fetch(`${base}/game-data/status?variant=${game}`).then(r => r.json());
    assert.equal(ready.variant, game); assert.equal(ready.ready, true);
    const expected = { ...reference.http, ...Object.fromEntries(Object.entries(reference.shell)
      .filter(([file]) => file !== 'index.html').map(([file, sha]) => [`shared-shell/${file}`, sha])) };
    for (const [file, sha] of Object.entries(expected)) {
      const r = await fetch(`${base}/${file}`); assert.equal(r.status, 200);
      const bytes = Buffer.from(await r.arrayBuffer()); assert.equal(hash(bytes), sha, `${game}/${file}`);
      if (file.endsWith('.wasm')) assert(WebAssembly.validate(bytes));
    }
    http[game] = { port, ready: true, lockedVariant: game, assetsVerified: Object.keys(expected).length };
  }
  result.http = http;
  result.otherContainersUnchanged = Object.keys(containers).length - changed.size;
  result.ownerFilesUnchanged = Object.keys(ownerData).length;
  result.deployed = true;
}
if (process.env.BUILD_RELEASE_PROOF) fs.writeFileSync(process.env.BUILD_RELEASE_PROOF, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ mode, images, containers: Object.keys(containers).length,
  ownerFiles: Object.keys(ownerData).length, otherContainersUnchanged: result.otherContainersUnchanged,
  http: result.http, audited: true }, null, 2));
