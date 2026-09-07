#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync, spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wasm = process.argv[2] === '--wasm';
const original = path.join(root, '.work', wasm ? 'd3wasm-sabot' : 'd3-managed-sabot-source');
const reproduced = path.join(root, '.work', wasm ? 'd3-sabot-wasm-reproduced-source' : 'd3-sabot-reproduced-source');
const git = (tree, args) => execFileSync('git', ['-C', tree, ...args], {encoding: 'utf8'});
function changed(tree) {
  return [...new Set([...git(tree, ['diff', '--name-only']).trim().split('\n'),
    ...git(tree, ['ls-files', '--others', '--exclude-standard']).trim().split('\n')])].filter(Boolean).sort();
}
const files = changed(original);
assert.deepEqual(changed(reproduced), files, 'reproduction must modify/import exactly the same files');
assert.ok(files.length >= 25);
const hashes = {};
for (const file of files) {
  const actual = fs.readFileSync(path.join(reproduced, file));
  assert.deepEqual(actual, fs.readFileSync(path.join(original, file)), `reproduction differs: ${file}`);
  hashes[file] = crypto.createHash('sha256').update(actual).digest('hex');
}
const guard = spawnSync(process.execPath, [path.join(root, 'scripts/prepare-d3-sabot.mjs'),
  ...(wasm ? ['--wasm'] : []), reproduced], {encoding: 'utf8'});
assert.notEqual(guard.status, 0);
assert.match(guard.stderr, /Destination already exists/);
for (const [file, expected] of Object.entries(hashes)) {
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(reproduced, file))).digest('hex'), expected,
    'existing-destination refusal must not change files');
}
const proof = {scope: 'Fresh source reconstruction compared byte-for-byte with the tested isolated prototype, plus non-mutating existing-destination guard. Not a binary reproducibility or gameplay test.',
  target: wasm ? 'wasm' : 'native', files: hashes, existingDestinationRefused: true, passed: true};
if (process.env.D3_SABOT_SOURCE_PROOF) fs.writeFileSync(process.env.D3_SABOT_SOURCE_PROOF, JSON.stringify(proof, null, 2) + '\n');
console.log(JSON.stringify({target: proof.target, files: files.length, existingDestinationRefused: true, passed: true}));
