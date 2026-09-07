#!/usr/bin/env node
// Read-only HTTP acceptance of an isolated WAD-storage candidate.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const candidate = process.env.WAD_CANDIDATE_ORIGIN;
const baseline = process.env.WAD_BASELINE_ORIGIN;
const stage = process.env.WAD_STAGE_DIR;
assert.ok(candidate && baseline && stage, 'set WAD_CANDIDATE_ORIGIN, WAD_BASELINE_ORIGIN and WAD_STAGE_DIR');
const owner = JSON.parse(await readFile(path.join(stage, 'owner-report.json')));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function get(origin, name) {
  const response = await fetch(new URL(name, origin), { signal: AbortSignal.timeout(30000) });
  assert.equal(response.status, 200, `${origin}${name}`);
  return Buffer.from(await response.arrayBuffer());
}
async function files(root, prefix = '') {
  const result = [];
  for (const entry of await readdir(path.join(root, prefix), { withFileTypes: true })) {
    const name = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) result.push(...await files(root, name));
    else if (entry.isFile()) result.push(name);
    else assert.fail(`Unexpected staged site entry ${name}`);
  }
  return result.sort();
}
const site = path.join(stage, 'site');
const unchanged = [];
for (const name of await files(site)) {
  if (name === 'wasm-game-data.json') continue;
  const [before, after, local] = await Promise.all([get(baseline, `/${name}`), get(candidate, `/${name}`), readFile(path.join(site, name))]);
  assert.equal(hash(after), hash(before), `browser bytes must not change: ${name}`);
  assert.equal(hash(after), hash(local), `staged bytes must match: ${name}`);
  unchanged.push({ file: name, sha256: hash(after) });
}
assert.equal(unchanged.filter(entry => entry.file.startsWith('artifacts/')).length, 13);
for (const name of ['wasm-game-framework.js', 'wasm-game-bootstrap.js', 'wasm-game-framework.css']) {
  const file = `/shared-shell/${name}`;
  const [before, after] = await Promise.all([get(baseline, file), get(candidate, file)]);
  assert.equal(hash(after), hash(before), `shared framework must not change: ${file}`);
  unchanged.push({ file, sha256: hash(after) });
}
const expected = JSON.parse(await readFile(path.join(site, 'wasm-game-data.json')));
const previous = JSON.parse(await get(baseline, '/wasm-game-data.json'));
const actual = JSON.parse(await get(candidate, '/wasm-game-data.json'));
assert.deepEqual(actual, expected);
const transformed = structuredClone(previous);
transformed.version += '-stored-wad-v1';
const readiness = [];
for (const [variant, definition] of Object.entries(transformed.variants)) {
  for (const entry of definition.files) {
    const archive = owner.archives[entry.path];
    if (!archive) continue;
    assert.equal(archive.previousSHA256, entry.sha256);
    assert.equal(archive.previousSize, entry.size);
    assert.equal(archive.payloadsIdentical, true);
    assert.equal(archive.nonWadCompressedBytesIdentical, true);
    assert.ok(archive.wads.length > 0);
    assert.ok(archive.wads.every(wad => wad.method === 0));
    entry.sha256 = archive.sha256;
    entry.size = archive.size;
  }
  const status = JSON.parse(await get(candidate, `/game-data/status?variant=${variant}`));
  assert.equal(status.ready, true, `${variant} owner data must validate`);
  assert.ok(status.files.every(file => file.valid));
  readiness.push({ variant, ready: true });
}
assert.deepEqual(actual, transformed, 'only archive size/hash and manifest version may change');
for (const file of ['/data', '/data/goldsource/valve-owner.pk3', '/owner-report.json']) {
  const response = await fetch(new URL(file, candidate));
  assert.equal(response.status, 404, `private candidate files must not be published: ${file}`);
}
const report = { generatedAt: new Date().toISOString(), candidate, baseline,
  dataManifestSHA256: hash(await get(candidate, '/wasm-game-data.json')),
  unchanged, readiness, privateOwnerData: true, browserGameplay: false, passed: true };
if (process.env.WAD_PACKAGE_PROOF) await writeFile(process.env.WAD_PACKAGE_PROOF, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
