#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(repo, 'sources.json'), 'utf8'));
const pin = manifest.sources.find(source => source.name === 'crispy-doom');
const fetchSource = fs.readFileSync(path.join(repo, 'scripts/fetch-crispy-source.sh'), 'utf8');
const patchList = fetchSource.match(/patch_files=\(([\s\S]*?)\)/)?.[1];
assert.ok(patchList, 'fetch script must declare its ordered patches');
assert.deepEqual(Array.from(patchList.matchAll(/"\$\{repo_dir\}\/(patches\/[^"\n]+\.patch)"/g), match => match[1]),
  pin.patches, 'fetch order must match the complete pinned patch manifest');
const prepared = process.env.IDTECH1_CRISPY_SOURCE_DIR || path.join(repo, '.work/crispy-doom');
const run = (command, args, options = {}) => execFileSync(command, args,
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options }).trim();
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'idtech1-source-proof-'));
try {
  const checkout = path.join(temporary, 'source');
  run('git', ['clone', '--shared', '--no-checkout', prepared, checkout]);
  run('git', ['-C', checkout, 'remote', 'set-url', 'origin', pin.repository]);
  run('git', ['-C', checkout, 'checkout', '--detach', pin.commit]);
  for (const patch of pin.patches) run('git', ['-C', checkout, 'apply', path.join(repo, patch)]);
  run('git', ['-C', checkout, 'diff', '--check']);
  const before = run('git', ['-C', checkout, 'status', '--porcelain']);
  run('bash', [path.join(repo, 'scripts/fetch-crispy-source.sh')],
    { env: { ...process.env, IDTECH1_CRISPY_SOURCE_DIR: checkout } });
  assert.equal(run('git', ['-C', checkout, 'status', '--porcelain']), before,
    'source validation must not delete upstream Markdown or mutate the checkout');
  const sources = run('git', ['-C', checkout, 'ls-files']).split('\n')
    .filter(file => /\.(?:c|h)$/.test(file));
  sources.push('src/i_browser.c', 'src/i_browser.h');
  const differences = [];
  for (const file of sources) {
    const actual = fs.readFileSync(path.join(prepared, file));
    const expected = fs.readFileSync(path.join(checkout, file));
    if (!actual.equals(expected)) differences.push({ file, actual: actual.length, expected: expected.length,
      eofWhitespaceOnly: actual.toString().trimEnd() === expected.toString().trimEnd() });
  }
  assert.deepEqual(differences, [], 'prepared source differs from canonical patches');
  run('git', ['-C', checkout, 'add', '-A']);
  const tree = run('git', ['-C', checkout, 'write-tree']);
  // The fetch guard must fail closed on a cached checkout missing this repair.
  run('git', ['-C', checkout, 'apply', '--reverse', path.join(repo, pin.patches.at(-1))]);
  assert.throws(() => run('bash', [path.join(repo, 'scripts/fetch-crispy-source.sh')],
    { env: { ...process.env, IDTECH1_CRISPY_SOURCE_DIR: checkout } }));
  console.log(JSON.stringify({ source: pin.commit, patches: pin.patches, tree,
    comparedSourceFiles: sources.length, preservesUpstreamMarkdown: true, rejectsMissingRepair: true }, null, 2));
} finally {
  // Only this invocation's uniquely allocated, disposable source reconstruction.
  fs.rmSync(temporary, { recursive: true, force: true });
}
