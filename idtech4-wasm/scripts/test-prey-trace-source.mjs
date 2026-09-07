#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const checkout = process.env.PREY_TRACE_SOURCE || path.join(root, '.work/prey-d3wasm');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'prey-trace-source-'));
const patch = path.join(root, 'patches/prey2006-browser.patch');
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const git = (args, index) => execFileSync('git', ['-C', checkout, ...args], {
  encoding:'utf8', env:{...process.env, GIT_INDEX_FILE:path.join(temporary, index)}
}).trim();
try {
  git(['read-tree', 'HEAD'], 'expected');
  git(['apply', '--cached', '--whitespace=nowarn', patch], 'expected');
  git(['read-tree', 'HEAD'], 'actual');
  git(['add', '-A'], 'actual');
  const expected = git(['write-tree'], 'expected');
  const actual = git(['write-tree'], 'actual');
  assert.equal(actual, expected, 'complete prepared source equals canonical patch tree');
  const sha = hash(patch);
  assert.ok(fs.readFileSync(path.join(root, 'patches/SHA256SUMS'), 'utf8').includes(sha + '  prey2006-browser.patch'));
  const files = {};
  for (const file of ['neo/game/physics/Clip.cpp', 'neo/game/physics/Clip.h', 'neo/game/gamesys/SaveGame.cpp']) files[file] = hash(path.join(checkout, file));
  const proof = {scope:'Exact full Prey prepared-tree equality to canonical patch via private indexes; original checkout index untouched.',
    head:git(['rev-parse', 'HEAD'], 'actual'), tree:actual, patchSHA256:sha, files};
  if (process.env.PREY_TRACE_SOURCE_PROOF) fs.writeFileSync(process.env.PREY_TRACE_SOURCE_PROOF, JSON.stringify(proof, null, 2) + '\n', {flag:'wx'});
  console.log(JSON.stringify(proof, null, 2));
} finally {
  fs.rmSync(temporary, {recursive:true, force:true});
}
