#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pin = JSON.parse(fs.readFileSync(path.join(repo, 'sources.json'), 'utf8'))
  .sources.find(source => source.name === 'zandronum');
const prepared = process.env.ZANDRONUM_SOURCE_DIR || path.join(repo, '.work/zandronum');
const run = (command, args, options = {}) => execFileSync(command, args,
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options }).trim();
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'idtech1-zandronum-source-'));
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
try {
  const checkout = path.join(temporary, 'source');
  run('git', ['clone', '--shared', '--no-checkout', '--single-branch', prepared, checkout]);
  run('git', ['-C', checkout, 'checkout', '--detach', pin.commit]);
  for (const patch of pin.patches) run('git', ['-C', checkout, 'apply', path.join(repo, patch)]);
  run('git', ['-C', checkout, 'diff', '--check']);
  const before = run('git', ['-C', checkout, 'status', '--porcelain']);
  run('bash', [path.join(repo, 'scripts/fetch-zandronum-source.sh')],
    { env: { ...process.env, ZANDRONUM_SOURCE_DIR: checkout } });
  assert.equal(run('git', ['-C', checkout, 'status', '--porcelain']), before,
    'fetch validation must preserve the prepared checkout');
  run('git', ['-C', checkout, 'add', '-A']);
  const files = run('git', ['-C', checkout, 'ls-files']).split('\n');
  const differences = files.filter(file => !fs.existsSync(path.join(prepared, file)) ||
    !fs.readFileSync(path.join(prepared, file)).equals(fs.readFileSync(path.join(checkout, file))));
  assert.deepEqual(differences, [], 'prepared files must exactly match the pinned source plus canonical patch');
  const audioDir = path.join(repo, 'wasm/zandronum-audio');
  const audioSources = Object.fromEntries(fs.readdirSync(audioDir).filter(file => /\.(cpp|h)$/.test(file))
    .sort().map(file => [file, hash(path.join(audioDir, file))]));
  const decoderDir = run('bash', [path.join(repo, 'scripts/fetch-audio-decoders.sh')]);
  const decoderPin = JSON.parse(fs.readFileSync(path.join(repo, 'sources.json'), 'utf8'))
    .sources.find(source => source.name === 'dr_libs');
  assert.equal(run('git', ['-C', decoderDir, 'rev-parse', 'HEAD']), decoderPin.commit);
  console.log(JSON.stringify({ source: pin.commit, patches: Object.fromEntries(pin.patches.map(patch =>
    [patch, createHash('sha256').update(fs.readFileSync(path.join(repo, patch))).digest('hex')])),
    tree: run('git', ['-C', checkout, 'write-tree']), comparedFiles: files.length,
    preservesPreparedCheckout: true, audioSources, decoder: { commit: decoderPin.commit,
      files: Object.fromEntries(['dr_flac.h', 'dr_wav.h', 'LICENSE'].map(file =>
        [file, hash(path.join(decoderDir, file))])) } }, null, 2));
} finally {
  // This invocation owns only this uniquely allocated disposable reconstruction.
  fs.rmSync(temporary, { recursive: true, force: true });
}
