#!/usr/bin/env node
// Package the exact, tested local pair without staging over accepted binaries.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync, spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const policy = path.join(root, 'bots/doom3');
const lock = JSON.parse(await fs.readFile(path.join(policy, 'source-lock.json')));
const candidate = lock.candidate;
const reference = path.resolve(process.env.D3_SABOT_REFERENCE || path.join(root, '.work/idtech4a-bot-reference'));
const tag = process.argv[2] || 'local/idtech4-wasm:doom3-sabot-candidate';
if (process.argv.length > 3 || !/^local\/idtech4-wasm:doom3-sabot-[a-z0-9._-]+$/.test(tag)) throw new Error('Choose a local Doom 3 SABot candidate tag.');
const docker = (...args) => execFileSync('docker', args, {encoding: 'utf8'}).trim();
if (docker('image', 'inspect', candidate.baseImage, '--format', '{{.Id}}') !== candidate.baseImageID) throw new Error('Accepted base image changed.');
if (spawnSync('docker', ['image', 'inspect', tag], {stdio: 'ignore'}).status === 0) throw new Error('Candidate tag already exists; choose a new tag.');
if (execFileSync('git', ['-C', reference, 'rev-parse', 'HEAD'], {encoding: 'utf8'}).trim() !== lock.reference.commit) throw new Error('Wrong reference revision.');
const hash = async file => crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
const verified = {};
async function verify(file, expected) {
  const actual = await hash(file);
  if (actual !== expected) throw new Error('Checksum mismatch: ' + file);
  verified[path.relative(root, file)] = actual;
}
const expansion = lock.browser.expansion;
const expansionRoot = path.join(root, '.work/d3wasm-roe-game');
if (execFileSync('git', ['-C', expansionRoot, 'rev-parse', 'HEAD'], {encoding:'utf8'}).trim() !== expansion.commit) throw new Error('Wrong RoE source revision.');
await verify(path.join(root, expansion.patch), expansion.patchSHA256);
execFileSync('git', ['-C', expansionRoot, 'apply', '--reverse', '--check', path.join(root, expansion.patch)], {stdio:'inherit'});
for (const [file, expected] of Object.entries(candidate.runtimeInputs)) await verify(path.join(root, file), expected);
for (const [file, value] of Object.entries(candidate.artifacts)) await verify(path.join(root, file), value.sha256);
const patch = path.join(policy, candidate.runtimePatch);
await verify(patch, candidate.runtimePatchSHA256);
const archive = path.join(reference, lock.assets.path);
await verify(archive, lock.assets.sha256);
if ((await fs.stat(archive)).size !== lock.assets.bytes) throw new Error('Wrong bot asset length.');
// Both source reproductions, including refusal guards, must still match.
for (const extra of [[], ['--wasm']]) execFileSync(process.execPath, [path.join(root, 'scripts/test-d3-sabot-source.mjs'), ...extra], {stdio: 'inherit'});
execFileSync(process.execPath, [path.join(root, 'scripts/test-d3-mp-audio.mjs')], {
  env: {...process.env, D3_AUDIO_SOURCE: path.join(root, '.work/d3wasm-sabot')}, stdio: 'inherit'});
execFileSync(process.execPath, [path.join(root, 'scripts/test-d3-trace-cache.mjs')], {stdio: 'inherit'});
for (const name of ['snapshot', 'population', 'voting']) execFileSync(process.execPath, [path.join(root, 'scripts/test-d3-sabot-' + name + '.mjs')], {stdio: 'inherit'});
execFileSync(process.execPath, [path.join(root, 'scripts/test-d3-sabot-roster.mjs')], {stdio: 'inherit'});
const stage = await fs.mkdtemp(path.join(root, '.work/d3-sabot-package-'));
async function copy(source, target) {
  const destination = path.join(stage, target);
  await fs.mkdir(path.dirname(destination), {recursive: true});
  await fs.copyFile(source, destination);
}
try {
  for (const file of Object.keys(candidate.runtimeInputs)) await copy(path.join(root, file), file);
  // Do not let Git discover the surrounding workspace: apply from a nested
  // ignored directory can silently skip paths outside its current prefix.
  execFileSync('git', ['init', '--quiet'], {cwd: stage, stdio: 'inherit'});
  execFileSync('git', ['apply', '--check', patch], {cwd: stage, stdio: 'inherit'});
  execFileSync('git', ['apply', patch], {cwd: stage, stdio: 'inherit'});
  for (const [file, expected] of Object.entries(candidate.runtimeOutputs)) {
    if (await hash(path.join(stage, file)) !== expected) throw new Error('Candidate patch output mismatch: ' + file);
  }
  execFileSync(process.execPath, [path.join(root, 'scripts/test-modifier-keys.mjs')], {
    env: {...process.env, IDTECH4_ADAPTER_SOURCE: path.join(stage, 'site/game-adapter.js')}, stdio: 'inherit'});
  execFileSync(process.execPath, [path.join(root, 'scripts/test-d3-sabot-map-status.mjs')], {
    env: {...process.env, D3_SABOT_RUNTIME_SOURCE: path.join(stage, 'server/runtime.cjs')}, stdio: 'inherit'});
  execFileSync(process.execPath, [path.join(root, 'scripts/test-d3-sabot-worker.mjs')], {
    env: {...process.env, D3_SABOT_WORKER_SOURCE: path.join(stage, 'site/d3-worker.js')}, stdio: 'inherit'});
  await copy(path.join(root, 'server/sabot-roster.cjs'), 'server/sabot-roster.cjs');
  for (const [file, value] of Object.entries(candidate.artifacts)) await copy(path.join(root, file), value.target);
  await copy(archive, 'site/bots/d3_sabot_a7.pk4');
  await copy(path.join(reference, 'LICENSE'), 'notices/upstream-LICENSE');
  await copy(path.join(reference, 'doom3/COPYING.txt'), 'notices/upstream-doom3-COPYING.txt');
  await copy(path.join(policy, 'CANDIDATE-NOTICE.txt'), 'notices/CANDIDATE-NOTICE.txt');
  await copy(path.join(policy, 'Dockerfile.candidate'), 'Dockerfile');
  execFileSync('docker', ['build', '--pull=false', '--network=none', '--build-arg', 'BASE_IMAGE=' + candidate.baseImage, '-t', tag, stage], {stdio: 'inherit'});
  const image = docker('image', 'inspect', tag, '--format', '{{.Id}}');
  const imageFiles = {};
  const destination = file => file.replace(/^server\//, '/opt/doom3-server/').replace(/^site\//, '/opt/game-site/').replace(/^native\//, '/opt/doom3-native/');
  for (const [file, expected] of Object.entries(candidate.runtimeOutputs)) imageFiles[destination(file)] = expected;
  for (const value of Object.values(candidate.artifacts)) imageFiles[destination(value.target)] = value.sha256;
  imageFiles['/opt/doom3-server/sabot-roster.cjs'] = await hash(path.join(root, 'server/sabot-roster.cjs'));
  imageFiles['/opt/game-site/bots/d3_sabot_a7.pk4'] = lock.assets.sha256;
  docker('run', '--rm', '--network', 'none', '--entrypoint', 'node', tag, '-e',
    'const fs=require("node:fs"),crypto=require("node:crypto");for(const [file,expected] of Object.entries(JSON.parse(process.argv[1]))) {if(crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex")!==expected) throw Error("Packaged file mismatch: "+file)}', JSON.stringify(imageFiles));
  const proof = {scope: 'Isolated local acceptance image containing exact bot-enabled native/Wasm artifacts, MP-only archive mounting and bounded actual bot telemetry. No registry push, live service replacement or public redistribution acceptance.',
    image, tag, baseImage: candidate.baseImageID, inputs: verified, verifiedImageFiles: imageFiles,
    rosterSHA256: await hash(path.join(root, 'server/sabot-roster.cjs')), passed: true};
  if (process.env.D3_SABOT_PACKAGE_PROOF) await fs.writeFile(process.env.D3_SABOT_PACKAGE_PROOF, JSON.stringify(proof, null, 2) + '\n');
  console.log(JSON.stringify(proof, null, 2));
} finally {
  // Only this invocation's exact mkdtemp staging directory is removed.
  await fs.rm(stage, {recursive: true, force: true});
}
