#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lock = JSON.parse(fs.readFileSync(path.join(repoDir, 'source-lock.json'), 'utf8'));
const required = new Set(['jolly-good-api', 'nestopia-jg', 'bsnes-jg', 'mednafen-jg', 'play']);

if (lock.schemaVersion !== 1 || !/^\d{4}-\d{2}-\d{2}$/.test(lock.auditedAt)) {
  throw new Error('source-lock.json has an invalid schema or audit date');
}
if (Object.keys(lock.sources).length !== required.size) throw new Error('source lock must contain exactly five native sources');

for (const [name, spec] of Object.entries(lock.sources)) {
  if (!required.delete(name)) throw new Error(`unexpected source lock: ${name}`);
  if (!/^https:\/\/(?:gitlab\.com|github\.com)\/.+\.git$/.test(spec.repository)) throw new Error(`${name}: repository must be a primary HTTPS Git origin`);
  if (!/^[0-9a-f]{40}$/.test(spec.commit)) throw new Error(`${name}: commit must be a full SHA-1`);
  if (!/^\d+(?:\.\d+){1,3}$/.test(spec.ref)) throw new Error(`${name}: ref must be an immutable release tag`);
  if (!spec.license || !spec.licenseFile || !Array.isArray(spec.buildUse) || !spec.buildUse.length) throw new Error(`${name}: incomplete provenance`);

  const checkout = path.join(repoDir, 'vendor', name);
  if (fs.existsSync(checkout)) {
    const actual = execFileSync('git', ['-C', checkout, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    if (actual !== spec.commit) throw new Error(`${name}: checkout is ${actual}, expected ${spec.commit}`);
    if (!fs.existsSync(path.join(checkout, spec.licenseFile))) throw new Error(`${name}: locked license file is missing`);
    for (const sourcePath of spec.buildUse) {
      if (!fs.existsSync(path.join(checkout, sourcePath))) throw new Error(`${name}: locked build path is missing: ${sourcePath}`);
    }
    for (const excludedPath of spec.excludedFromBuild || []) {
      if (!fs.existsSync(path.join(checkout, excludedPath))) throw new Error(`${name}: locked exclusion path is missing: ${excludedPath}`);
    }
  }
}
if (required.size) throw new Error(`missing source locks: ${[...required].join(', ')}`);

const play = lock.sources.play;
for (const forbidden of ['js/play_browser', 'Source/ui_js', 'build_cmake']) {
  if (!play.excludedFromBuild?.includes(forbidden)) throw new Error(`Play! exclusion is missing: ${forbidden}`);
}

console.log('native source lock passed');
