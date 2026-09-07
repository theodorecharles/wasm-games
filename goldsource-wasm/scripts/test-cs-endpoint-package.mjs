#!/usr/bin/env node
// Read-only comparison against the previously accepted frontend. No deployment.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';

const candidate = process.env.CS_ENDPOINT_ORIGIN;
const previous = process.env.CS_PREVIOUS_ORIGIN;
assert.ok(candidate && previous, 'set CS_ENDPOINT_ORIGIN and CS_PREVIOUS_ORIGIN');
const hash = value => createHash('sha256').update(value).digest('hex');
async function get(origin, file) {
  const response = await fetch(new URL(file, origin), { signal: AbortSignal.timeout(10000) });
  assert.equal(response.status, 200, `${origin}${file}`);
  return Buffer.from(await response.arrayBuffer());
}
const files = (await readdir(new URL('../web/artifacts/', import.meta.url))).sort();
assert.equal(files.length, 13, 'expected immutable GoldSource artifacts');
const artifacts = [];
for (const file of files) {
  const local = await readFile(new URL(`../web/artifacts/${file}`, import.meta.url));
  const [oldBytes, newBytes] = await Promise.all([get(previous, `/artifacts/${file}`), get(candidate, `/artifacts/${file}`)]);
  assert.equal(hash(newBytes), hash(local), `staged artifact ${file}`);
  assert.equal(hash(newBytes), hash(oldBytes), `native/support artifact must remain unchanged: ${file}`);
  artifacts.push({ file, sha256: hash(newBytes) });
}
const unchanged = [];
const changed = [];
for (const file of ['/shared-shell/wasm-game-bootstrap.js', '/shared-shell/wasm-game-framework.js', '/shared-shell/wasm-game-framework.css', '/wasm-game.json', '/wasm-game-data.json']) {
  const [oldBytes, newBytes] = await Promise.all([get(previous, file), get(candidate, file)]);
  if (file === '/shared-shell/wasm-game-framework.js' && process.env.GOLDSOURCE_EXPECTED_FRAMEWORK_FILE) {
    const expected = await readFile(process.env.GOLDSOURCE_EXPECTED_FRAMEWORK_FILE);
    assert.equal(hash(newBytes), hash(expected), 'candidate must serve the exact tested framework source');
    assert.notEqual(hash(newBytes), hash(oldBytes), 'expected framework repair must actually be packaged');
    changed.push({ file, sha256: hash(newBytes), previousSHA256: hash(oldBytes) });
    continue;
  }
  assert.equal(hash(newBytes), hash(oldBytes), `${file} must remain unchanged`);
  unchanged.push({ file, sha256: hash(newBytes) });
}
const adapter = await get(candidate, '/game-adapter.js');
assert.equal(hash(adapter), hash(await readFile(new URL('../web/game-adapter.js', import.meta.url))));
assert.notEqual(hash(adapter), hash(await get(previous, '/game-adapter.js')));
assert.match((await get(candidate, '/')).toString(), /wasm-game-bootstrap\.js/);
for (const file of ['/data', '/data/valve/pak0.pak', '/data/cstrike/liblist.gam']) {
  const response = await fetch(new URL(file, candidate), { signal: AbortSignal.timeout(10000) });
  assert.equal(response.status, 404, `owner data must not be directly served at ${file}`);
}
const report = { generatedAt: new Date().toISOString(), candidate, previous,
  adapterSHA256: hash(adapter), artifacts, unchanged, changed, ownerDataPrivate: true,
  browserGameplay: false, passed: true };
if (process.env.CS_ENDPOINT_PACKAGE_PROOF) await writeFile(process.env.CS_ENDPOINT_PACKAGE_PROOF, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
