#!/usr/bin/env node
// Deliberately separate from production source preparation and staging.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const policyRoot = path.join(root, 'bots/doom3');
const lock = JSON.parse(await fs.readFile(path.join(policyRoot, 'source-lock.json')));
const arguments_ = process.argv.slice(2);
const wasm = arguments_[0] === '--wasm';
if (wasm) arguments_.shift();
if (arguments_.length > 1 || arguments_[0]?.startsWith('--')) throw new Error('Usage: prepare-d3-sabot.mjs [--wasm] [NEW_DESTINATION]');
const reference = path.resolve(process.env.D3_SABOT_REFERENCE || path.join(root, '.work/idtech4a-bot-reference'));
const source = path.resolve(wasm ? (process.env.D3_WASM_SOURCE || path.join(root, '.work/d3wasm'))
  : (process.env.D3_NATIVE_SOURCE || path.join(root, '.work/d3wasm-roe-game')));
const commit = wasm ? lock.browser.commit : lock.nativeCommit;
const target = path.resolve(arguments_[0] || path.join(root, wasm ? '.work/d3-sabot-wasm-reproduced-source' : '.work/d3-sabot-reproduced-source'));
const git = (cwd, args) => execFileSync('git', ['-C', cwd, ...args], {encoding: 'utf8'}).trim();
if (git(reference, ['rev-parse', 'HEAD']) !== lock.reference.commit) throw new Error('Wrong SABot reference revision');
if (git(source, ['rev-parse', 'HEAD']) !== commit) throw new Error('Wrong engine source revision');
const hash = async file => crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
for (const [file, expected] of Object.entries(lock.reference.files)) {
  if (await hash(path.join(reference, file)) !== expected) throw new Error('Modified reference: ' + file);
}
if (await hash(path.join(reference, lock.assets.path)) !== lock.assets.sha256) throw new Error('Wrong reference assets');
const patch = path.join(policyRoot, lock.patch);
if (await hash(patch) !== lock.patchSHA256) throw new Error('Port patch checksum mismatch');
const populationPatch = path.join(policyRoot, lock.populationPatch);
if (await hash(populationPatch) !== lock.populationPatchSHA256) throw new Error('Population patch checksum mismatch');
const votingPatch = path.join(policyRoot, lock.votingPatch);
if (await hash(votingPatch) !== lock.votingPatchSHA256) throw new Error('Voting patch checksum mismatch');
const basePatch = wasm && path.join(root, lock.browser.basePatch);
const hooksPatch = wasm && path.join(policyRoot, lock.browser.hooksPatch);
if (wasm) {
  if (await hash(basePatch) !== lock.browser.basePatchSHA256) throw new Error('Browser base patch checksum mismatch');
  if (await hash(hooksPatch) !== lock.browser.hooksPatchSHA256) throw new Error('Browser bot hooks checksum mismatch');
}
try { await fs.lstat(target); throw new Error('Destination already exists; choose a new directory.'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
await fs.mkdir(path.dirname(target), {recursive: true});
execFileSync('git', ['clone', '--no-hardlinks', '--no-checkout', source, target], {stdio: 'inherit'});
git(target, ['checkout', '--detach', commit]);
if (wasm) {
  git(target, ['apply', '--check', basePatch]);
  git(target, ['apply', basePatch]);
}
await fs.mkdir(path.join(target, 'neo/game/bots'), {recursive: true});
for (const file of Object.keys(lock.reference.files)) {
  await fs.copyFile(path.join(reference, file), path.join(target, 'neo/game/bots', path.basename(file)));
}
const excludes = wasm ? lock.browser.nativePatchExcludes.map(file => '--exclude=' + file) : [];
git(target, ['apply', '--check', ...excludes, patch]);
git(target, ['apply', ...excludes, patch]);
if (wasm) {
  git(target, ['apply', '--check', hooksPatch]);
  git(target, ['apply', hooksPatch]);
}
git(target, ['apply', '--check', populationPatch]);
git(target, ['apply', populationPatch]);
git(target, ['apply', '--check', votingPatch]);
git(target, ['apply', votingPatch]);
console.log(`Prepared isolated SABot ${wasm ? 'Wasm' : 'native'} source at ${target}. Production sources and binaries are unchanged.`);
