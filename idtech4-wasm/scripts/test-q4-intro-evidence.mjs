#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const proofs=path.join(root,'proofs'),index='quake4-intro-evidence-2026-09-06.json';
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const bytes=n=>fs.readFileSync(path.join(proofs,n));
const read=n=>JSON.parse(bytes(n));
const stem=s=>`quake4-intro-${s}-2026-09-06`;
const observation=s=>read(stem(s)+'.json').observation;
const shot=s=>hash(bytes(stem(s)+'.jpg'));
const base=shot('old-frozen');
assert.equal(base,'9c3326a48d8f261622eaa19e2bdf6f89b7a61f4743d9c67c8989df1e95c55629');
for(const stage of ['no-fog','no-new-ambient','skip-sky-cvar','only-no-overlays','render-defaults']) assert.equal(shot('old-'+stage),base,stage);
assert.equal(shot('old-only-no-decals'),'075bd0340d6dbfa2e21530940a13bcc0da4817afc95733ee89390f31c1e1494e');
assert.equal(shot('old-no-decals'),shot('old-only-no-decals'));
assert.notEqual(shot('old-only-no-decals'),base);
function cvar(log,name,value) {
  const rows=log.split('\n').filter(l=>l.startsWith(`"${name}" is:`));
  assert.ok(rows.length,name+' must have a native value query');
  assert.ok(rows.at(-1).startsWith(`"${name}" is:"${value}"`),name+' must be restored');
}
const restored=observation('old-restored').log;
for(const name of ['g_stopTime','r_skipFogLights','r_skipAmbient','r_skipNewAmbient','r_skipDecals','r_skipOverlays','r_showSurfaceInfo','r_showPrimitives']) cvar(restored,name,0);
cvar(restored,'bse_render',1);
for(const [name,value] of [['g_stopTime',0],['r_skipDecals',0],['r_useStateCaching',1]]) cvar(observation('trace-restored').log,name,value);
cvar(observation('draw-restored').log,'g_stopTime',0);
cvar(observation('sequence-restored').log,'g_stopTime',0);
const drawPrefix='[q4-intro-draw] ';
const draws=observation('draw-ships-steady').log.split('\n').filter(l=>l.startsWith(drawPrefix)).map(l=>JSON.parse(l.slice(drawPrefix.length)));
assert.equal(draws.length,3);
assert.deepEqual(draws.map(d=>d.args[1]),[33,138,120]);
for(const d of draws) {
  for(const key of ['preexistingErrors','queryErrors','drawErrors','afterQueryErrors']) assert.deepEqual(d[key],[]);
  assert.equal(d.state.BLEND,true);assert.equal(d.state.BLEND_SRC_RGB,774);assert.equal(d.state.BLEND_DST_RGB,768);
  assert.equal(d.state.BLEND_EQUATION_RGB,32774);assert.equal(d.state.DEPTH_WRITEMASK,false);
  assert.equal(d.state.DEPTH_FUNC,515);assert.equal(d.args[2],5125);
  assert.deepEqual(d.uniforms.q4bsInfo_u_texUnit0,[0,0,0,1]);
  assert.deepEqual(d.before,d.after,'these sampled draws did not lift the sampled pixels');
  for(const p of d.after) assert.deepEqual(p.rgba,[0,0,0,255]);
  const position=d.attributes.find(a=>a.name==='a_position');
  assert.equal(position.stride,64);assert.equal(position.values.length,3);
  assert.ok(position.values.flat().every(Number.isFinite));
}
const sequencePrefix='[q4-intro-sequence] ';
const sequenceLog=observation('sequence-frozen').log;
const sequence=sequenceLog.split('\n').filter(l=>l.startsWith(sequencePrefix)).map(l=>JSON.parse(l.slice(sequencePrefix.length)));
// The bounded visible console retained draws 2–21, not the first full record.
assert.deepEqual(sequence.map(d=>d.sequence),Array.from({length:20},(_,i)=>i+2));
assert.ok(sequenceLog.includes('[q4-intro-sequence-end] color clear after 21 draws'));
for(const d of sequence)for(const key of ['preexistingErrors','queryErrors','drawErrors','afterQueryErrors'])assert.deepEqual(d[key],[]);
const gray=sequence.find(d=>d.sequence===3);
assert.deepEqual(gray.args,[4,6,5123,0]);
assert.equal(gray.state.BLEND_SRC_RGB,775);assert.equal(gray.state.BLEND_DST_RGB,1);
assert.equal(gray.state.DEPTH_TEST,false);
assert.deepEqual(gray.before[0].rgba,[0,0,0,255]);assert.deepEqual(gray.after[0].rgba,[51,51,51,255]);
const badPosition=gray.attributes.find(a=>a.name==='a_position');
assert.equal(badPosition.bufferBytes,2176);assert.equal(badPosition.stride,16);assert.equal(badPosition.size,4);
assert.ok(Math.abs(badPosition.values[0][0])>3000,'fullscreen quad incorrectly reads model data');
const immediate=read('quake4-immediate-buffer-native-2026-09-06.json');
assert.deepEqual(immediate.legacy.cases.filter(c=>!c.draw.temp).map(c=>c.binding),[1,1,2,2]);
assert.ok(immediate.candidate.cases.every(c=>c.passed&&c.returnedVBOPointers));
assert.equal(immediate.candidate.throwRestored,true);
const files={};let pairs=0;
for(const file of fs.readdirSync(proofs).filter(n=>/^quake4-intro-.*2026-09-06\.(json|jpg)$/.test(n)&&n!==index).sort()) {
  files['proofs/'+file]=hash(bytes(file));
  if(file.endsWith('.json')&&!file.includes('package')) {
    const o=read(file).observation;
    assert.equal(o.root.wasmGameVariant,'quake4');assert.equal(o.fullscreen,null);
    assert.match(o.url,/^http:\/\/127\.0\.0\.1:(32875|32958|32959|32960)\/\?game=quake4$/);
    const jpeg=bytes(file.replace(/json$/,'jpg'));assert.equal(jpeg.subarray(0,2).toString('hex'),'ffd8');assert.ok(jpeg.length>10000);pairs++;
  }
}
files['proofs/quake4-immediate-buffer-native-2026-09-06.json']=hash(bytes('quake4-immediate-buffer-native-2026-09-06.json'));
for(const file of ['tests/q4-intro-decal-diagnostic.patch','tests/q4-intro-draw-worker.js','tests/q4-intro-sequence-worker.js','tests/q4-immediate-buffer-transform.mjs','scripts/test-q4-immediate-buffer.mjs','scripts/test-q4-intro-package.mjs','scripts/test-q4-intro-sequence-package.mjs','scripts/test-q4-intro-evidence.mjs']) files[file]=hash(fs.readFileSync(path.join(root,file)));
const result={scope:'Integrity, exact faulty-draw isolation and candidate SDK regression, not a deployed visual repair or full game acceptance.',pairs,draws:draws.length,sequenceDraws:sequence.length,files};
if(process.argv.includes('--record')) fs.writeFileSync(path.join(proofs,index),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
else assert.deepEqual(result,read(index));
console.log(`${pairs} screenshot/DOM pairs, frozen A/B identities, native setting restoration, ${draws.length}+${sequence.length} actual GPU draws, SDK regression and ${Object.keys(files).length} evidence hashes verified.`);
