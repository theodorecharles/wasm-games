import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

// Read-only package comparison. No native build, source reset or owner-data writes.
const [baseline, candidate, baselineOrigin, candidateOrigin, report] = process.argv.slice(2);
assert.ok(baseline && candidate && baselineOrigin && candidateOrigin,
  'usage: node test-framework-refresh.mjs OLD_SITE NEW_SITE OLD_ORIGIN NEW_ORIGIN [REPORT]');
const game = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const framework = process.env.WASM_GAME_FRAMEWORK_ROOT || '/home/ted/Development/wasm-game-framework';
const oldCommit = 'ad0226db55a2925bb250c6e31ca6786bd0dc73bd';
const newCommit = 'ebb1ebe35ad8224a9080279a6529414db42d3284';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function inventory(root, relative = '') {
  const result = [];
  for (const entry of await fs.readdir(path.join(root, relative), { withFileTypes: true })) {
    const name = path.join(relative, entry.name);
    if (entry.isDirectory()) result.push(...await inventory(root, name));
    else { assert.ok(entry.isFile(), `non-regular package entry: ${name}`); result.push(name); }
  }
  return result.sort();
}
async function get(origin, name) {
  const response = await fetch(new URL(name, origin), { signal: AbortSignal.timeout(60000) });
  assert.equal(response.status, 200, `${origin}/${name}`);
  return Buffer.from(await response.arrayBuffer());
}
const names = await inventory(candidate);
assert.deepEqual(names, await inventory(baseline), 'package inventory changed');
const shell = ['index.html', 'wasm-game-framework.js', 'wasm-game-framework.css', 'wasm-game-bootstrap.js'];
const expectedChanged = ['openrct2-worker.js', 'wasm-game.json', 'wasm-game-framework.js',
  'wasm-game-bootstrap.js', 'wasm-game-framework.json'].sort();
const files = [];
for (const name of names) {
  const before = await fs.readFile(path.join(baseline, name));
  const after = await fs.readFile(path.join(candidate, name));
  assert.deepEqual(await get(baselineOrigin, name), before, `baseline HTTP mismatch: ${name}`);
  assert.deepEqual(await get(candidateOrigin, name), after, `candidate HTTP mismatch: ${name}`);
  if (name === 'openrct2-worker.js' || name === 'wasm-game.json') {
    assert.equal(before.toString().split(oldCommit).length, 2, `${name}: expected one old pin`);
    assert.equal(after.toString(), before.toString().replace(oldCommit, newCommit), `${name}: non-pin change`);
    assert.deepEqual(after, await fs.readFile(path.join(game, 'web', name)), `${name}: source mismatch`);
  } else if (shell.includes(name)) {
    assert.deepEqual(after, await fs.readFile(path.join(framework, 'dist', name)), `${name}: shared package mismatch`);
  } else if (name !== 'wasm-game-framework.json') {
    assert.deepEqual(after, before, `${name}: unrelated change`);
  }
  files.push({ name, changed: !before.equals(after), beforeSha256: hash(before), sha256: hash(after), bytes: after.length });
}
assert.deepEqual(files.filter(x => x.changed).map(x => x.name).sort(), expectedChanged);
const metadata = JSON.parse(await fs.readFile(path.join(candidate, 'wasm-game-framework.json')));
for (const [key, name] of Object.entries({ javascriptSha256: shell[1], stylesheetSha256: shell[2], bootstrapSha256: shell[3], documentSha256: shell[0] })) {
  assert.equal(metadata[key], files.find(x => x.name === name).sha256, `metadata: ${key}`);
}
assert.equal(metadata.version, '0.9.6');
const data = JSON.parse(await get(candidateOrigin, '/game-data/status'));
assert.deepEqual(data, JSON.parse(await get(baselineOrigin, '/game-data/status')));
assert.equal(data.ready, true);
assert.equal(data.mediaLibrary.entries[0].fileCount, 2953);
assert.equal(data.mediaLibrary.launcherVisibleWhenReady, false);
for (const origin of [baselineOrigin, candidateOrigin]) {
  for (const name of ['/data/', '/local-data/', '/Data/g1.dat', '/RCT2.EXE']) {
    assert.equal((await fetch(new URL(name, origin))).status, 404, `private path: ${origin}${name}`);
  }
}
const proof = { observedAt: new Date().toISOString(), baselineOrigin, candidateOrigin,
  unchanged: files.filter(x => !x.changed).length, changed: expectedChanged.length, files, data };
if (report) await fs.writeFile(report, JSON.stringify(proof, null, 2) + '\n');
console.log(`OpenRCT2 refresh verified: ${proof.unchanged} unchanged, ${proof.changed} tightly scoped changes; HTTP bytes, framework hashes, data readiness and privacy pass.`);
