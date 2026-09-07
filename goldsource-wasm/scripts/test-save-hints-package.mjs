#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
const candidate = process.env.MENU_CANDIDATE_ORIGIN;
const baseline = process.env.MENU_BASELINE_ORIGIN;
const site = process.env.MENU_CANDIDATE_SITE;
const oldSite = process.env.MENU_BASELINE_SITE;
assert.ok(candidate && baseline && site && oldSite, 'set MENU_CANDIDATE_ORIGIN, MENU_BASELINE_ORIGIN, MENU_CANDIDATE_SITE and MENU_BASELINE_SITE');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function get(origin, file) {
  const response = await fetch(new URL('/' + file, origin), { signal: AbortSignal.timeout(30000) });
  assert.equal(response.status, 200, `${origin}/${file}`);
  return Buffer.from(await response.arrayBuffer());
}
async function files(root, prefix = '') {
  const list = [];
  for (const entry of await readdir(path.join(root, prefix), { withFileTypes: true })) {
    const file = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) list.push(...await files(root, file));
    else { assert.ok(entry.isFile()); list.push(file); }
  }
  return list.sort();
}
const oldFiles = await files(oldSite), newFiles = await files(site);
const menu = file => /^artifacts\/menu-framework-[^.]+\.wasm$/.test(file);
assert.equal(oldFiles.filter(menu).length, 1);
assert.equal(newFiles.filter(menu).length, 1);
const oldMenu = oldFiles.find(menu), newMenu = newFiles.find(menu);
assert.deepEqual(newFiles.filter(file => !menu(file)), oldFiles.filter(file => !menu(file)));
assert.equal(newFiles.filter(file => file.startsWith('artifacts/')).length, 13);
const unchanged = [], changed = [];
for (const file of newFiles) {
  const oldFile = menu(file) ? oldMenu : file;
  const [before, after, local, oldLocal] = await Promise.all([
    get(baseline, oldFile), get(candidate, file), readFile(path.join(site, file)), readFile(path.join(oldSite, oldFile))]);
  assert.equal(hash(after), hash(local), `candidate matches staged ${file}`);
  assert.equal(hash(before), hash(oldLocal), `baseline matches retained ${oldFile}`);
  if (menu(file)) {
    assert.notEqual(hash(before), hash(after));
    assert.equal(hash(after), hash(await readFile(new URL('../native/menu-framework.wasm', import.meta.url))));
    changed.push({ file, previousFile: oldFile, sha256: hash(after), previousSHA256: hash(before) });
  } else if (file === 'game-adapter.js') {
    assert.equal(after.toString(), before.toString().replaceAll(oldMenu, newMenu), 'only the immutable menu URL may change in the adapter bundle');
    changed.push({ file, sha256: hash(after), previousSHA256: hash(before) });
  } else {
    assert.equal(hash(before), hash(after), `unchanged ${file}`);
    unchanged.push({ file, sha256: hash(after) });
  }
}
for (const name of ['wasm-game-framework.js', 'wasm-game-bootstrap.js', 'wasm-game-framework.css']) {
  const file = `shared-shell/${name}`;
  const [before, after] = await Promise.all([get(baseline, file), get(candidate, file)]);
  assert.equal(hash(after), hash(before));
  unchanged.push({ file, sha256: hash(after) });
}
const readiness = [];
for (const variant of ['half-life', 'blue-shift', 'opposing-force', 'counter-strike']) {
  const result = JSON.parse(await get(candidate, `game-data/status?variant=${variant}`));
  assert.equal(result.ready, true);
  assert.ok(result.files.every(file => file.valid));
  readiness.push({ variant, ready: true });
}
for (const file of ['/data', '/data/goldsource/valve-owner.pk3', '/owner-report.json']) {
  assert.equal((await fetch(new URL(file, candidate))).status, 404);
}
const report = { generatedAt: new Date().toISOString(), candidate, baseline, unchanged, changed, readiness,
  privateOwnerData: true, browserGameplay: false, passed: true };
if (process.env.MENU_PACKAGE_PROOF) await writeFile(process.env.MENU_PACKAGE_PROOF, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
