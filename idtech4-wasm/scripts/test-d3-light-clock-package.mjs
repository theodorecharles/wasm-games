#!/usr/bin/env node
// Read-only image/source audit for TEST-ONLY lighting diagnostics.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const command = (name, args) => execFileSync(name, args, {encoding:'utf8'}).trim();
const candidate = JSON.parse(fs.readFileSync(path.join(root, 'proofs/d3-mp-audio-package-2026-09-06.json')));
const images = {
  fixed:'local/idtech4-wasm:doom3-light-clock-diagnostic-20260906',
  legacy:'local/idtech4-wasm:doom3-light-clock-legacy-diagnostic-20260906',
};
assert.equal(command('docker', ['image', 'inspect', candidate.tag, '--format', '{{.Id}}']), candidate.image);
const files = Object.keys(candidate.verifiedImageFiles);
const results = {};
for (const [mode, tag] of Object.entries(images)) {
  const image = command('docker', ['image', 'inspect', tag, '--format', '{{.Id}}']);
  const output = command('docker', ['run', '--rm', '--network=none', '--read-only', '--entrypoint', 'sha256sum', image, ...files]);
  const verifiedImageFiles = Object.fromEntries(output.split('\n').map(line => {
    const match = /^(\w{64})\s+(.+)$/.exec(line);
    assert.ok(match, line);
    return [match[2], match[1]];
  }));
  const changedFromCandidate = files.filter(file => verifiedImageFiles[file] !== candidate.verifiedImageFiles[file]);
  assert.deepEqual(changedFromCandidate, ['/opt/game-site/dhewm3-base.js', '/opt/game-site/dhewm3-base.wasm']);
  results[mode] = {tag, image, verifiedImageFiles, changedFromCandidate};
}
const changedBetweenDiagnostics = files.filter(file => results.fixed.verifiedImageFiles[file] !== results.legacy.verifiedImageFiles[file]);
assert.deepEqual(changedBetweenDiagnostics, ['/opt/game-site/dhewm3-base.wasm']);

// Reapply the retained test patches to copies of the current v7 source.
// Only the fresh temporary directory is written or removed.
const source = path.join(root, '.work/d3wasm-sabot');
const diagnostic = path.join(root, '.work/d3-light-clock-diagnostic-20260906');
const expectedChanges = ['neo/framework/Common.cpp', 'neo/game/PlayerView.cpp', 'neo/sound/snd_emitter.cpp', 'neo/sound/snd_system.cpp'];
const patchFiles = ['tests/d3-light-clock-diagnostic.patch', 'tests/d3-light-clock-legacy.patch'];
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'd3-light-source-audit-'));
const sourceHashes = {};
try {
  for (const file of expectedChanges) {
    fs.mkdirSync(path.dirname(path.join(temporary, file)), {recursive:true});
    fs.copyFileSync(path.join(source, file), path.join(temporary, file));
  }
  for (const patch of patchFiles) {
    command('git', ['-C', temporary, 'apply', path.join(root, patch)]);
  }
  for (const file of expectedChanges) {
    const actual = fs.readFileSync(path.join(diagnostic, file));
    assert.deepEqual(actual, fs.readFileSync(path.join(temporary, file)), file);
    sourceHashes[file] = hash(actual);
  }
} finally {
  fs.rmSync(temporary, {recursive:true, force:true});
}
function walk(directory, prefix = '') {
  return fs.readdirSync(directory, {withFileTypes:true}).flatMap(entry => {
    const relative = path.join(prefix, entry.name);
    return entry.isDirectory() ? walk(path.join(directory, entry.name), relative) : [relative];
  });
}
const sourceFiles = walk(path.join(source, 'neo')).sort();
assert.deepEqual(walk(path.join(diagnostic, 'neo')).sort(), sourceFiles);
const actualChanges = sourceFiles.map(file => 'neo/' + file).filter(file =>
  !fs.readFileSync(path.join(source, file)).equals(fs.readFileSync(path.join(diagnostic, file))));
assert.deepEqual(actualChanges, expectedChanges);
const artifactInputs = Object.entries(candidate.inputs).filter(([file]) => file.startsWith('.work/d3wasm-sabot/build-wasm/') || file.startsWith('.work/d3-managed-sabot/'));
for (const [file, expected] of artifactInputs) assert.equal(hash(fs.readFileSync(path.join(root, file))), expected, file);
const proof = {
  scope:'TEST-ONLY images; same v7 base, nine checked image files, diagnostic pair differs only in Wasm. Legacy source equals current v7 plus exactly the three-file diagnostic and mixer-removal patches. No promotion or full rendering acceptance.',
  candidateImage:candidate.image, results, changedBetweenDiagnostics,
  checkedSourceFiles:sourceFiles.length, sourceHashes,
  patches:Object.fromEntries(patchFiles.map(file => [file, hash(fs.readFileSync(path.join(root, file)))])),
  unchangedCandidateArtifacts:Object.fromEntries(artifactInputs), deployed:false, passed:true,
};
if (process.env.D3_LIGHT_PACKAGE_PROOF) fs.writeFileSync(process.env.D3_LIGHT_PACKAGE_PROOF, JSON.stringify(proof, null, 2) + '\n');
console.log(JSON.stringify(proof, null, 2));
