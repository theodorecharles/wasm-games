#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const prepared = process.env.BUILD_ENGINE_SOURCE_DIR || path.join(repo, '.work/source');
const source = JSON.parse(fs.readFileSync(path.join(repo, 'games/blood/sources.json'))).repositories[0];
const run = (command, args, options = {}) => execFileSync(command, args, {
  encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options
}).trim();
const patches = ['patches', 'games/blood/patches', 'games/duke3d/patches'].flatMap(directory =>
  fs.readFileSync(path.join(repo, directory, 'series'), 'utf8').split('\n')
    .map(line => line.trim()).filter(line => line && !line.startsWith('#'))
    .map(file => `${directory}/${file}`));
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'build-source-proof-'));
try {
  assert.equal(run('git', ['-C', prepared, 'rev-parse', 'HEAD']), source.commit);
  const checkout = path.join(temporary, 'source');
  run('git', ['clone', '--shared', '--no-checkout', prepared, checkout]);
  run('git', ['-C', checkout, 'checkout', '--detach', source.commit]);
  run('git', ['-C', checkout, 'remote', 'set-url', 'origin', source.repository]);
  for (const patch of patches) run('git', ['-C', checkout, 'apply', path.join(repo, patch)]);
  run('git', ['-C', checkout, 'diff', '--check']);
  // Generated fixture proves source preparation also preserves developer notes.
  const fixture = path.join(checkout, 'BUILD-PRESERVE-NOTE.md');
  fs.writeFileSync(fixture, 'Source preparation must retain this generated test note.\n');
  const before = run('git', ['-C', checkout, 'status', '--porcelain']);
  run('bash', [path.join(repo, 'scripts/fetch-source')], {
    env: { ...process.env, BUILD_ENGINE_SOURCE_DIR: checkout }
  });
  assert.equal(run('git', ['-C', checkout, 'status', '--porcelain']), before);
  assert.equal(fs.readFileSync(fixture, 'utf8'), 'Source preparation must retain this generated test note.\n');
  fs.unlinkSync(fixture);
  run('git', ['-C', checkout, 'add', '-A']);
  const files = run('git', ['-C', checkout, 'ls-files']).split('\n');
  const differences = files.filter(file => !fs.existsSync(path.join(prepared, file)) ||
    !fs.readFileSync(path.join(prepared, file)).equals(fs.readFileSync(path.join(checkout, file))));
  assert.deepEqual(differences, [], 'prepared source must match the canonical pin and ordered patches');
  const tree = run('git', ['-C', checkout, 'write-tree']);
  // The observer is deliberately separate from the production patch series.
  run('git', ['-C', checkout, 'apply', '--check', path.join(repo, 'tests/blood-diagnostics.patch')]);
  const proof = { passed: true, source: source.commit, tree, comparedFiles: files.length,
    patches: Object.fromEntries(patches.map(patch => [patch, hash(path.join(repo, patch))])),
    preservesPreparedCheckout: true, preservesDeveloperMarkdown: true,
    observer: Object.fromEntries(['tests/blood-diagnostics.patch', 'tests/blood-diagnostics.cpp']
      .map(file => [file, hash(path.join(repo, file))])) };
  if (process.env.BUILD_SOURCE_PROOF) fs.writeFileSync(process.env.BUILD_SOURCE_PROOF,
    JSON.stringify(proof, null, 2) + '\n', {flag:'wx'});
  console.log(JSON.stringify(proof, null, 2));
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
