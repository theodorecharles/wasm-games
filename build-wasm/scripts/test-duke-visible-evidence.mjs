#!/usr/bin/env node
// Retained evidence audit, not a substitute for visual gameplay review.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = path.join(root,'proofs');
const name = (stem,ext='json') => `duke-polymost-${stem}-2026-09-06.${ext}`;
const read = stem => JSON.parse(fs.readFileSync(path.join(directory,name(stem)),'utf8'));
const stems = ['matrix-trace','texture-trace','texture-world','texture-fired','pixels-menu',
  'pixels-world','pixels-sky','hint-menu','world-uniforms','hints-fixed-menu','sky-uniforms',
  'visible-menu','visible-world','visible-fired','visible-pause',
  'projection-menu','projection-world','projection-fired','projection-pause','projection-resumed'];
const observations = Object.fromEntries(stems.map(stem=>[stem,read(stem).observation]));
const rows = (stem,kind) => {
  const prefix = `[GPU ${kind}] `;
  return observations[stem].log.split('\n').filter(line=>line.includes(prefix))
    .map(line=>JSON.parse(line.slice(line.indexOf(prefix)+prefix.length)));
};
for (const [stem,o] of Object.entries(observations)) {
  assert.equal(o.root.buildRenderMode,'3',stem);
  assert.equal(o.root.buildRenderBpp,'32',stem);
  assert(Number(o.root.buildInputFrames)>1,stem);
}
const identity = [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const textured = rows('matrix-trace','draw').filter(d=>d.uniforms.u_useColorOnly===0);
assert.equal(textured.length,3);
for (const draw of textured) assert.deepEqual(draw.uniforms.u_textureMatrix0,identity);
const rejectedRed = rows('matrix-trace','driver').filter(d=>d.name==='texImage2D' && d.args[2]===6403);
assert.deepEqual(rejectedRed.map(d=>[d.args[3],d.args[4],d.error]),[[8192,8192,1281],[2048,2048,1281]]);
assert(rows('texture-world','driver').some(d=>d.name==='texImage2D' && d.args[6]===32993 && d.args[7]===33639));
for (const stem of ['texture-trace','pixels-world','pixels-sky']) assert.equal(rows(stem,'driver').length,0,stem);
assert.deepEqual(rows('hint-menu','driver').map(d=>[d.name,d.error,d.args[0]]),[['hint',1280,3152],['hint',1280,3156]]);
for (const stem of ['hints-fixed-menu','sky-uniforms']) {
  assert.equal(rows(stem,'driver').length,0,stem);
  assert.equal(rows(stem,'pending').length,0,stem);
}
assert.equal(rows('sky-uniforms','world').length,24);
for (const stem of ['visible-menu','visible-world','visible-fired','visible-pause',
  'projection-menu','projection-world','projection-fired','projection-pause','projection-resumed']) {
  assert.doesNotMatch(observations[stem].log,/\[GPU (?:draw|world|driver|pending|probe)\]|Invalid WebGL|null function|Compile Status: 0/);
  const menu = stem.endsWith('menu') || stem.endsWith('pause');
  assert.equal(observations[stem].root.shellEngineState,menu?'menu':'gameplay',stem);
  if (stem.endsWith('pause')) assert.equal(observations[stem].root.dukeMenuId,'50');
}
const packages = ['matrix','texture','pixels','hint','world','hints-fixed','sky','visible','projection'];
for (const stem of packages) {
  const p = read(`${stem}-package`);
  assert.deepEqual(p.changed,['/opt/game-site/duke3d.js','/opt/game-site/duke3d.wasm']);
  assert.equal(p.unchangedFiles,19); assert(p.ownerDataReadOnly && p.ready);
  assert.equal(p.base.image,'sha256:8631a4e193cadf1eb16c4b5b5d8c3cb639dd605bcab109c7fd9dac5ea8788e90');
}
assert.equal(read('projection-package').http['duke3d.js'],read('visible-package').http['duke3d.js']);
assert.notEqual(read('projection-package').http['duke3d.wasm'],read('visible-package').http['duke3d.wasm']);
assert.equal(read('projection-clean-package').drawObserverPresent,false);
assert.deepEqual(read('projection-clean-package').http,read('projection-package').http);
for (const driver of ['amd','software']) {
  const textures = read(`textures-${driver}`), projection = read(`projection-${driver}`);
  assert.equal(JSON.parse(textures.records[0].output).checks,40);
  assert.equal(textures.records.filter(r=>r.expectedFailure).length,4);
  assert.equal(JSON.parse(projection.records[0].output).checks,27);
  assert(projection.records[1].negative);
}
const files = stems.flatMap(stem=>[name(stem),name(stem,'jpg')]).concat(
  packages.map(stem=>name(`${stem}-package`)),
  ['textures-amd','textures-software','projection-amd','projection-software','visible-source','projection-source','projection-clean-package'].map(stem=>name(stem)));
const hashes = Object.fromEntries(files.map(file=>[file,createHash('sha256').update(fs.readFileSync(path.join(directory,file))).digest('hex')]));
const proof = {scope:'Retained Chrome diagnostics and observer-free progress; not complete Modernized acceptance',
  audited:true,modernizedAccepted:false,chromePairs:stems.length,hashedFiles:files.length,
  remaining:['widescreen/profile integration','transparency/depth review','capture/movement/mouselook acceptance','audio listening','save and full reload'],hashes};
if (process.env.DUKE_VISIBLE_EVIDENCE_PROOF) fs.writeFileSync(process.env.DUKE_VISIBLE_EVIDENCE_PROOF,JSON.stringify(proof,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(proof,null,2));
