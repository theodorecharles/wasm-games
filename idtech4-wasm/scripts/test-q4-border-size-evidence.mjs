#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const proofs=path.join(root,'proofs'),indexFile=path.join(proofs,'quake4-border-size-evidence-2026-09-06.json');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const read=name=>JSON.parse(fs.readFileSync(path.join(proofs,name),'utf8'));
const negative=read('quake4-border-llvmpipe-recheck-2026-09-06.json');
const fixed=read('quake4-border-size-fixed-llvmpipe-2026-09-06.json');
assert.equal(negative.fixtureSHA256,fixed.fixtureSHA256);
assert.equal(fixed.fixtureSHA256,hash(fs.readFileSync(path.join(root,'tests/gl-border-sampling.c'))));
assert.equal(hash(fs.readFileSync(path.join(root,'scripts/test-q4-border-sampling.mjs'))),'22bf038e837d5078768ee8e7048b6909ed720652be164f0651acb24b60967420');
assert.equal(negative.transformSHA256,fixed.transformSHA256);
assert.equal(negative.imageSourceSHA256,fixed.imageSourceSHA256);
assert.equal(negative.summary['isotropic-sampling-prototype'].mismatches,14);
assert.equal(negative.summary['isotropic-sampling-prototype'].maximumChannelDifference,117);
assert.equal(fixed.summary['isotropic-sampling-prototype'].mismatches,9);
assert.equal(fixed.summary['isotropic-sampling-prototype'].maximumChannelDifference,5);
for(const label of ['anisotropic-sampling-prototype','gles-anisotropic-sampling-prototype']) {
  assert.equal(negative.summary[label].nativeKernelMismatches,14);
  assert.equal(fixed.summary[label].nativeKernelMismatches,0);
  assert.ok(fixed.summary[label].nativeKernelMaximumChannelDifference<=1);
}
const size=read('quake4-border-size-llvmpipe-2026-09-06.json');
let badQueries=0,correctDerived=0;
for(const context of size.contexts)for(const row of context.cases) {
  const mismatches=row.samples.filter(sample=>sample.actual.some((value,i)=>value!==sample.expected[i])).length;
  assert.equal(row.mismatches,mismatches);
  for(const sample of row.samples)assert.equal(sample.observedLod,sample.lod);
  if(row.method==='varying-size-query')badQueries+=mismatches;
  else {assert.equal(mismatches,0);correctDerived+=row.samples.length;}
}
assert.equal(badQueries,680);assert.equal(correctDerived,968);
for(const [file,failedSettings] of [['quake4-border-size-matrix-llvmpipe-2026-09-06.json',[1]],['quake4-border-size-matrix-amd-complete-2026-09-06.json',[]]]) {
  const matrix=read(file);
  assert.deepEqual(matrix.cases.map(row=>row.anisotropy),Array.from({length:16},(_,i)=>i+1));
  assert.deepEqual(matrix.failures.map(row=>row.anisotropy),failedSettings);
  for(const row of matrix.cases)for(const label of ['desktop','gles']) {
    assert.equal(row[label].cases,128);assert.equal(row[label].nativeKernelMismatches,0);
    assert.ok(row[label].nativeKernelMaximumChannelDifference<=1);
  }
}
const packageProof=read('quake4-border-size-package-2026-09-06.json');
assert.equal(packageProof.helperSHA256,fixed.prototypeSHA256);
assert.equal(packageProof.files['/opt/game-site/openQ4-client_wasm32.js'],fixed.packagedJsSHA256);
assert.deepEqual(packageProof.changedFiles,['/opt/game-site/openQ4-client_wasm32.js']);
const stages=['menu','new-game','continue','intro','world','pause','resume','quit-menu'];
for(const stage of stages) {
  const stem=`quake4-border-size-${stage}-2026-09-06`;
  const {observation}=read(stem+'.json');
  assert.equal(observation.url,'http://127.0.0.1:32957/?game=quake4');
  assert.equal(observation.root.wasmGameVariant,'quake4');
  assert.equal(observation.fullscreen,null,'no fullscreen acceptance is claimed');
  const expected=['world','intro','resume'].includes(stage)?'gameplay':['continue','pause'].includes(stage)?'paused':'menu';
  assert.equal(observation.root.shellEngineState,expected,stage);
  const screenshot=fs.readFileSync(path.join(proofs,stem+'.jpg'));
  assert.ok(screenshot.length>10000);assert.equal(screenshot.subarray(0,2).toString('hex'),'ffd8');
}
const proofFiles=fs.readdirSync(proofs).filter(file=>/^quake4-border-size-.*2026-09-06\.(json|jpg|Dockerfile)$/.test(file)&&file!==path.basename(indexFile));
proofFiles.push('quake4-border-llvmpipe-recheck-2026-09-06.json','quake4-border-amd-recheck-2026-09-06.json','quake4-border-host-software-recheck-2026-09-06.json');
const files={};
for(const file of proofFiles.sort())files[`proofs/${file}`]=hash(fs.readFileSync(path.join(proofs,file)));
for(const file of ['scripts/test-q4-border-size.mjs','scripts/test-q4-border-size-package.mjs','scripts/test-q4-border-size-evidence.mjs','scripts/test-q4-border-matrix.mjs','scripts/test-q4-border-sampling.mjs','tests/gl-border-size.c','tests/gl-border-sampling.c'])files[file]=hash(fs.readFileSync(path.join(root,file)));
if(process.argv.includes('--record')) {
  assert.equal(fs.existsSync(indexFile),false,'do not replace retained evidence');
  fs.writeFileSync(indexFile,JSON.stringify({scope:'Integrity and observed-milestone audit, not blanket renderer/control acceptance. Implicit-filter and intro-visual issues remain explicit.',files},null,2)+'\n');
} else assert.deepEqual(files,read(path.basename(indexFile)).files);
console.log(`${stages.length} Chrome screenshot/DOM pairs, both 4096-case matrices, retained negative size/filter results and ${Object.keys(files).length} evidence hashes verified.`);
