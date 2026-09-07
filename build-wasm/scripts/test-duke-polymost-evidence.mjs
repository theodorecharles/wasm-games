#!/usr/bin/env node
// Audit retained observations, including failures. This is NOT an acceptance gate.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = path.join(root, 'proofs');
const stems = ['duke-modern-classic-menu', 'duke-modern-classic-world', 'duke-modern-classic-fired',
  'duke-modern-classic-pause', 'duke-polymost-initial', 'duke-polymost-sync', 'duke-polymost-fog',
  'duke-polymost-shader-first', 'duke-polymost-essl-menu', 'duke-polymost-frame-error',
  'duke-polymost-attachments-menu', 'duke-polymost-frontend-menu', 'duke-polymost-draw-trace'];
const file = (stem, ext) => `${stem}-2026-09-06.${ext}`;
const observations = Object.fromEntries(stems.map(stem => [stem,
  JSON.parse(fs.readFileSync(path.join(directory, file(stem, 'json')), 'utf8')).observation]));
for (const stem of ['duke-modern-classic-world', 'duke-modern-classic-fired']) {
  const observation = observations[stem];
  assert.equal(observation.root.buildRenderBpp, '8');
  assert.equal(observation.root.buildRenderMode, '0');
  assert.equal(observation.root.shellEngineState, 'gameplay');
}
assert.match(observations['duke-polymost-initial'].log, /null function[\s\S]*polymost_initdrawpoly/);
assert.match(observations['duke-polymost-sync'].log, /null function[\s\S]*videoSetGameMode/);
assert.doesNotMatch(observations['duke-polymost-sync'].log, /at duke3d\.wasm\.polymost_initdrawpoly/);
assert.match(observations['duke-polymost-fog'].log, /#version directive must occur before/);
assert.match(observations['duke-polymost-shader-first'].log, /macro name is reserved/);
assert.match(observations['duke-polymost-frame-error'].log, /Cannot read properties of undefined.*reading 'type'/);
for (const stem of ['duke-polymost-attachments-menu', 'duke-polymost-frontend-menu']) {
  const observation = observations[stem];
  assert.ok(Number(observation.root.buildInputFrames) > 1);
  assert.equal(observation.root.buildRenderBpp, '32');
  assert.equal(observation.root.buildRenderMode, '3');
  assert.doesNotMatch(observation.log, /Compile Status: 0|\[GPU probe\]/);
}
const trace = observations['duke-polymost-draw-trace'].log;
assert.match(trace, /\[GPU driver\]/);
const draws = trace.split('\n').filter(line => line.startsWith('[GPU draw] '))
  .map(line => JSON.parse(line.slice('[GPU draw] '.length)));
assert.equal(draws.length, 6);
assert.ok(draws.every(draw => draw.uniforms.u_textureMatrix0.every(value => value === 0)));
const names = stems.flatMap(stem => [file(stem, 'json'), file(stem, 'jpg')]).concat([
  file('duke-polymost-source', 'json'), file('polymost-stream-native', 'json'),
  file('duke-polymost-glsl-amd', 'jsonl'), file('duke-polymost-glsl-software', 'jsonl'),
  file('duke-polymost-fog-sdk', 'jsonl'), file('duke-polymost-frontend-package', 'json'),
  file('duke-polymost-draw-package', 'json')]);
const hashes = Object.fromEntries(names.map(name => [name,
  createHash('sha256').update(fs.readFileSync(path.join(directory, name))).digest('hex')]));
const result = {scope:'Retained Chrome failure/progress observations and supporting artifact integrity; not gameplay acceptance',
  audited:true, modernizedAccepted:false, chromePairs:stems.length, hashedFiles:names.length,
  unresolved:['black image', 'texture upload/driver errors', 'zero texture matrix uniforms',
    'widescreen/profile integration', 'GPU gameplay, controls and save acceptance'], hashes};
if (process.env.DUKE_EVIDENCE_PROOF) fs.writeFileSync(process.env.DUKE_EVIDENCE_PROOF,
  JSON.stringify(result, null, 2) + '\n', {flag:'wx'});
console.log(JSON.stringify(result, null, 2));
