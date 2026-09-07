#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stem = stage => `proofs/quake4-input-${stage}-2026-09-06`;
const files = {};
function bytes(file) {
  const value = fs.readFileSync(path.join(root, file));
  files[file] = crypto.createHash('sha256').update(value).digest('hex');
  return value;
}
const stages = ['legacy-before', 'legacy-after', 'current-before', 'current-after',
  'continue-before', 'continue-after', 'world', 'pause', 'resume', 'quit'];
const observations = {};
let lastTime = -Infinity;
for (const stage of stages) {
  const record = JSON.parse(bytes(stem(stage) + '.json'));
  const time = Date.parse(record.observedAt);
  assert.ok(Number.isFinite(time) && time > lastTime, `${stage}: ordered observations`);
  lastTime = time;
  const o = record.observation;
  const legacy = stage.startsWith('legacy-');
  assert.equal(o.url, legacy
    ? 'http://127.0.0.1:32961/?game=quake4&proof=q4-input-legacy'
    : 'http://127.0.0.1:32962/?game=quake4&proof=q4-input-current');
  assert.equal(o.root.wasmGameVariant, 'quake4');
  assert.equal(o.root.wasmGameMode, 'single');
  assert.equal(o.proof.proofId, legacy ? 'q4-input-legacy' : 'q4-input-current');
  assert.equal(o.fullscreen, null);
  assert.equal(o.pointerLock, null);
  assert.equal(o.root.shellInputCaptured, 'false');
  assert.deepEqual(o.proof.errors, []);
  assert.doesNotMatch(o.log, /RuntimeError|memory access out of bounds|Aborted\(/);
  const jpeg = bytes(stem(stage) + '.jpg');
  assert.equal(jpeg.readUInt16BE(0), 0xffd8);
  assert.ok(jpeg.length > 10000);
  observations[stage] = o;
}
const obs = stage => observations[stage];
function keys(events) {
  return events.filter(e => e.type === 'key')
    .map(({scan, down, key, repeat}) => ({scan, down, key, repeat}));
}
const edge = (scan, down) => ({scan, down, key:0, repeat:false});
function validateModifiers(o, repaired) {
  assert.deepEqual(keys(o.proof.input.events), repaired
    ? [edge(224, true), edge(224, false), edge(226, true), edge(226, false)]
    : [edge(224, false), edge(226, false)]);
  assert.equal(o.proof.input.keyDown, repaired ? 2 : 0);
  assert.equal(o.proof.input.keyUp, 2);
  assert.equal(o.proof.input.text, 0);
  assert.equal(o.root.shellEngineState, 'menu');
}
for (const stage of ['legacy-before', 'current-before'])
  assert.deepEqual(obs(stage).proof.input.events, []);
validateModifiers(obs('legacy-after'), false);
validateModifiers(obs('current-after'), true);
assert.throws(() => validateModifiers(obs('legacy-after'), true));

const before = obs('continue-before'), after = obs('continue-after');
assert.equal(before.root.shellEngineState, 'paused');
assert.deepEqual(before.proof.states.at(-1), {
  ...before.proof.states.at(-1), state:'paused', inputMode:'continue', resumeAvailable:true
});
assert.match(before.log, /Loading continue gate ready/);
assert.doesNotMatch(before.log, /Loading continue gate completed/);
assert.match(after.log, /Loading continue gate completed/);
assert.equal(after.root.shellEngineState, 'gameplay');
const delta = after.proof.input.events.slice(before.proof.input.events.length);
assert.deepEqual(keys(delta), [edge(224, true), edge(224, false)]);
assert.equal(delta.length, 2, 'only a Ctrl down/up, no competing click/text/Enter');
const native = after.proof.states.at(-1);
assert.equal(native.state, 'gameplay');
assert.equal(native.inputMode, 'gameplay');
assert.ok(native.at > delta[0].at);
const capture = after.proof.capture;
assert.deepEqual(capture.map(c => c.kind), ['resume-request', 'error']);
assert.ok(capture[0].at >= native.at, 'capture waits for native acknowledgement');
assert.ok(capture[1].at >= capture[0].at);
assert.ok(capture.every(c => c.trusted && c.focused && !c.locked));
for (const stage of ['world', 'resume']) assert.equal(obs(stage).root.shellEngineState, 'gameplay');
assert.match(obs('world').log, /msec to load game\/airdefense1/);
assert.equal(obs('pause').root.shellEngineState, 'paused');
assert.equal(obs('quit').root.shellEngineState, 'menu');
assert.match(obs('quit').log, /Game Map Shutdown/);
const packaged = JSON.parse(bytes(stem('package') + '.json'));
assert.equal(packaged.image, 'sha256:1bfbdfd01881aff9e821d850c912307780c36e3dad4c36c7d73c43b6fee67618');
assert.equal(packaged.unchanged, 46);
assert.equal(packaged.positive.status, 0);
assert.equal(packaged.negative.status, 1);
for (const file of ['scripts/test-q4-input-package.mjs', 'scripts/test-q4-input-evidence.mjs',
  'scripts/test-adapter.mjs', 'site/game-adapter.js', 'proofs/quake4-input-candidate-2026-09-06.Dockerfile']) bytes(file);
const result = {
  scope:'Retained Chrome old/new Ctrl/Alt forwarding and a sole physical Ctrl tap completing native Continue, followed by world/pause/resume/quit. Pointer lock still denied. Not held movement/firing, audible quality, full campaign or live deployment acceptance.',
  pairs:stages.length, packageImage:packaged.image,
  modifierTapMsec:[obs('current-after').proof.input.events[1].at - obs('current-after').proof.input.events[0].at,
    obs('current-after').proof.input.events[3].at - obs('current-after').proof.input.events[2].at],
  continueTapMsec:delta[1].at - delta[0].at,
  continueNativeAt:native.at, captureRequestedAt:capture[0].at, captureDeniedAt:capture[1].at,
  files
};
const index = path.join(root, stem('evidence') + '.json');
if (process.argv.includes('--record')) fs.writeFileSync(index, JSON.stringify(result, null, 2) + '\n', {flag:'wx'});
else assert.deepEqual(result, JSON.parse(fs.readFileSync(index, 'utf8')));
console.log(`${stages.length} Chrome pairs, old/new modifier edges, sole-Ctrl native Continue and ${Object.keys(files).length} hashes verified.`);
