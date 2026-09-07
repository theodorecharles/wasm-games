#!/usr/bin/env node
// Compare a CS-menu candidate with the retained pre-fix release on 32932.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const candidate = process.env.CS_MENU_CANDIDATE || 'http://127.0.0.1:32946';
const baseline = process.env.CS_MENU_BASELINE_ORIGIN || 'http://127.0.0.1:32932';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function get(origin, file) {
  const response = await fetch(new URL('/' + file, origin), { signal: AbortSignal.timeout(30000) });
  assert.equal(response.status, 200, `${origin}/${file}`);
  return Buffer.from(await response.arrayBuffer());
}
async function files(directory, prefix = '') {
  const result = [];
  for (const entry of await fs.readdir(path.join(directory, prefix), { withFileTypes: true })) {
    const file = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) result.push(...await files(directory, file));
    else { assert(entry.isFile()); result.push(file); }
  }
  return result.sort();
}
const oldAdapter = (await get(baseline, 'game-adapter.js')).toString();
const newAdapter = (await get(candidate, 'game-adapter.js')).toString();
const menuPattern = /artifacts\/cs-menu-framework-[A-Z0-9]+\.wasm/g;
const oldNames = [...new Set(oldAdapter.match(menuPattern))];
const newNames = [...new Set(newAdapter.match(menuPattern))];
assert.equal(oldNames.length, 1); assert.equal(newNames.length, 1);
const [oldMenu] = oldNames, [newMenu] = newNames;
assert.notEqual(oldMenu, newMenu);
assert.equal(newAdapter, oldAdapter.replaceAll(oldMenu, newMenu), 'only CS menu URL changes in the adapter');
const unchanged = [], changed = [];
for (const file of await files(path.join(root, 'web'))) {
  const previousFile = file === newMenu ? oldMenu : file;
  const [before, after, source] = await Promise.all([
    get(baseline, previousFile), get(candidate, file), fs.readFile(path.join(root, 'web', file))]);
  assert.equal(hash(after), hash(source), 'candidate equals source: ' + file);
  if ([newMenu, 'game-adapter.js'].includes(file)) {
    assert.notEqual(hash(after), hash(before));
    changed.push({ file, previousFile, sha256: hash(after), previousSHA256: hash(before) });
  } else {
    assert.equal(hash(after), hash(before), 'unchanged: ' + file);
    unchanged.push({ file, sha256: hash(after) });
  }
  if (file === newMenu) {
    assert.equal(hash(after), hash(await fs.readFile(path.join(root, 'native/cs-menu-framework.wasm'))));
    const oldModule = new WebAssembly.Module(before), newModule = new WebAssembly.Module(after);
    assert.deepEqual(WebAssembly.Module.exports(newModule),
      WebAssembly.Module.exports(oldModule).filter(item => item.name !== 'gpGlobals'),
      'all public functions and every other export remain unchanged');
    assert(!WebAssembly.Module.imports(newModule).some(item => item.name === 'gpGlobals'));
  }
}
for (const file of ['shared-shell/wasm-game-framework.js', 'shared-shell/wasm-game-bootstrap.js', 'shared-shell/wasm-game-framework.css']) {
  const [before, after] = await Promise.all([get(baseline, file), get(candidate, file)]);
  assert.equal(hash(after), hash(before)); unchanged.push({ file, sha256: hash(after) });
}
const readiness = [];
for (const variant of ['half-life', 'blue-shift', 'opposing-force', 'counter-strike']) {
  const status = JSON.parse(await get(candidate, 'game-data/status?variant=' + variant));
  assert(status.ready && status.files.every(file => file.valid)); readiness.push({ variant, ready: true });
}
for (const file of ['/data', '/data/goldsource/valve-owner.pk3', '/owner-report.json', '/' + oldMenu])
  assert.equal((await fetch(new URL(file, candidate))).status, 404, file);
const report = { testedAt: new Date().toISOString(), candidate, baseline, unchanged, changed, readiness,
  publicExportsPreservedExceptPrivateGpGlobals: true, gameplayAcceptance: false, passed: true };
if (process.env.CS_MENU_PACKAGE_PROOF) await fs.writeFile(process.env.CS_MENU_PACKAGE_PROOF, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
