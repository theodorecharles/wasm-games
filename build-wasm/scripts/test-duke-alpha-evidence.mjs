#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const directory = path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../proofs');
const name = (stem,ext='json') => `duke-alpha-${stem}-2026-09-06.${ext}`;
const read = stem => JSON.parse(fs.readFileSync(path.join(directory,name(stem)),'utf8'));
const stems = ['menu','world','fired','low-view','side-view','forward-tap','pause',
  'save-menu','save-preview','save-letter','save-cancelled','resumed'];
const observations = Object.fromEntries(stems.map(stem=>[stem,read(stem).observation]));
for (const [stem,o] of Object.entries(observations)) {
  assert.equal(new URL(o.url).port,'32985');
  for (const [key,value] of Object.entries({dukeProfile:'modernized',persistence:'ready',
    buildRenderMode:'3',buildRenderBpp:'32',buildRenderSize:'1280x720',dukeControlsMask:'31'}))
    assert.equal(o.root[key],value,`${stem}: ${key}`);
  assert.equal(o.canvas[0].width,1280); assert.equal(o.canvas[0].height,720);
  assert(Math.abs(o.canvas[0].cssWidth/o.canvas[0].cssHeight-16/9)<0.003);
  assert.equal(o.pointerLock,null); assert.equal(o.fullscreen,null);
  assert.match(o.log,/NPOT textures: 1 \(OpenGL ES 3.0\)/);
  assert.doesNotMatch(o.log,/\[GPU (?:driver|draw|pending|world|probe)\]|Invalid WebGL|null function|Compile Status: 0|alpha upload to unbound/);
  const gameplay = ['world','fired','low-view','side-view','forward-tap','resumed'].includes(stem);
  assert.equal(o.root.shellEngineState,gameplay ? 'gameplay' : 'menu');
  if (stem === 'pause' || stem === 'save-cancelled') assert.equal(o.root.dukeMenuId,'50');
  if (['save-menu','save-preview','save-letter'].includes(stem)) assert.equal(o.root.dukeMenuId,'350');
}
const view = stem => observations[stem].root.dukePlayerView.split(',').map(Number);
const fired=view('fired'), low=view('low-view'), side=view('side-view'), moved=view('forward-tap');
assert.deepEqual(fired,view('world'));
assert.deepEqual(low.slice(0,4),fired.slice(0,4)); assert(low[4]<fired[4]);
assert.deepEqual(side.slice(0,3),low.slice(0,3)); assert.equal(side[4],low[4]); assert(side[3]>low[3]);
assert.notDeepEqual(moved.slice(0,2),side.slice(0,2)); assert.deepEqual(moved.slice(2),side.slice(2));
assert.equal(observations['forward-tap'].root.buildLastKey,'KeyW:up');
assert.equal(observations['save-letter'].root.buildLastKey,'KeyT:up');
assert.deepEqual(view('resumed'),moved);
assert(fs.readFileSync(path.join(directory,name('resumed','jpg'))).equals(
  fs.readFileSync(path.join(directory,name('forward-tap','jpg')))), 'menu round trip must restore the same retained world image');
const p=read('package');
assert.equal(p.classicEngineUnchanged,true); assert.equal(p.bloodUnchanged,true);
assert.equal(p.unchangedFiles,19); assert.equal(Object.keys(p.files).length,23);
assert.equal(p.ownerDataReadOnly,true); assert.equal(p.drawObserverPresent,false);
const previous=JSON.parse(fs.readFileSync(path.join(directory,'duke-precision-package-2026-09-06.json'),'utf8'));
assert.deepEqual(Object.keys(p.files).filter(file=>p.files[file]!==previous.files[file]).sort(),
  ['/opt/game-site/duke3d-modernized.js','/opt/game-site/duke3d-modernized.wasm']);
assert.deepEqual(p.base,previous.base); assert.deepEqual(p.rtcw,previous.rtcw);
for (const driver of ['amd','software']) {
  const gpu=read(`full-${driver}`);
  assert.equal(gpu.records.length,6);
  for (const extended of [false,true]) {
    const records=gpu.records.filter(r=>r.extended===extended);
    const fixed=JSON.parse(records.find(r=>r.mode==='fixed').output);
    assert.equal(fixed.alphaCases,3840); assert.equal(fixed.colorChecks,3840); assert.equal(fixed.depthChecks,3840);
    for (const stage of ['color','depth']) assert.match(records.find(r=>r.mode===`missing-discard-${stage}`).log,
      new RegExp(`alpha ${stage} mismatch`));
  }
}
const state=read('full-state');
assert.equal(JSON.parse(state.records[0].output).stateChecks,343);
assert.match(state.records[1].log,/alpha state mismatch/);
assert.equal(read('source').tree,'183c701edf49365087e6ad217f050819d83304da');
const files=stems.flatMap(stem=>[name(stem),name(stem,'jpg')]).concat(
  ['full-amd','full-software','full-state','source','package'].map(stem=>name(stem)));
const hashes=Object.fromEntries(files.map(file=>[file,createHash('sha256').update(fs.readFileSync(path.join(directory,file))).digest('hex')]));
const proof={observedAt:new Date().toISOString(),audited:true,modernizedAccepted:false,
  scope:'Alpha color/depth readback and native state bridge; Chrome menu/world/firing/pitch/yaw/short forward tap, not full-game or automatic image acceptance',
  chromePairs:stems.length,hashedFiles:files.length,alphaCasesPerDriver:7680,nativeSDKStateChecks:343,
  nativePitch:[fired[4],low[4]],nativeYaw:[low[3],side[3]],nativeForwardXY:[side.slice(0,2),moved.slice(0,2)],
  inputCaptureEstablished:false,saveConfirmed:false,saveNameLetterVisible:false,
  remaining:['save-name text input and save/reload/load','wider gameplay and sprite fidelity',
    'held controls/capture/fullscreen','audio listening','Blood Modernized','deployment'],hashes};
if (process.env.DUKE_ALPHA_EVIDENCE_PROOF) fs.writeFileSync(process.env.DUKE_ALPHA_EVIDENCE_PROOF,
  JSON.stringify(proof,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(proof,null,2));
