#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {borderReference} from '../tests/q4-border-cpu-reference.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const files={},read=name=>{
 const file=`proofs/quake4-lod-${name}-2026-09-06.json`,bytes=fs.readFileSync(path.join(root,file));files[file]=hash(bytes);return JSON.parse(bytes);
};
let channels=0,modelPixels=0;
for(const driver of ['amd','host-software','old-software']){
 const p=read('cpu-'+driver);assert.equal(p.variants.length,3);
 for(const v of p.variants)for(const c of v.contexts){
  const matches=['fine','coarse'].map(policy=>{
   let errors=0;for(const row of c.cases)for(let y=0;y<11;y++)for(let x=0;x<11;x++){
    const expected=borderReference(row,x,y,policy);
    for(let k=0;k<4;k++)if(Math.abs(expected[k]-row.pixels[(y*11+x)*4+k])>1)errors++;
   }return errors;
  });
  assert.equal(Math.min(...matches),c.summary.mismatches);
  if(v.name==='production'){assert.equal(Math.min(...matches),0);channels+=c.summary.channels;}
  else assert.ok(matches.every(n=>n>0),'both legal derivative policies must reject the broken sampler');
 }
 const model=read('model-'+driver);assert.equal(model.cases.length,16);
 if(driver!=='amd')for(const c of model.cases)for(const s of c.samples){
  assert.deepEqual(s.implicit.map(v=>Math.round(v*255)),s.coarseFastSample.map(v=>Math.round(v*255)));modelPixels++;
 }
 const gate=read('validation-'+driver);assert.equal(gate.passed,true);
 assert.equal(gate.rawVendorStatus,driver==='amd'?0:1);
 assert.equal(gate.rawVendorSummary['isotropic-sampling-prototype'].mismatches,driver==='amd'?0:9);
 for(const name of ['anisotropic-sampling-prototype','gles-anisotropic-sampling-prototype'])assert.equal(gate.rawVendorSummary[name].nativeKernelMismatches,0);
}
for(const driver of ['amd','old-software']){
 const gate=read('validation-aniso16-'+driver);assert.equal(gate.passed,true);assert.equal(gate.anisotropy,16);assert.equal(gate.rawVendorStatus,0);
}
assert.equal(channels,46464);assert.equal(modelPixels,3872);
for(const file of ['tests/gl-border-lod.c','tests/gl-border-contract.c','tests/q4-border-cpu-reference.mjs','scripts/test-q4-border-lod.mjs','scripts/test-q4-border-contract.mjs','scripts/test-q4-border-validation.mjs','scripts/test-q4-lod-evidence.mjs','scripts/test-q4-border-sampling.mjs','tests/gl-border-sampling.c'])files[file]=hash(fs.readFileSync(path.join(root,file)));
const result={scope:'Recomputed independent CPU and native-driver model evidence; raw vendor failures retained separately from portable acceptance.',channels,modelPixels,files};
const index=path.join(root,'proofs/quake4-lod-evidence-2026-09-06.json');
if(process.argv.includes('--record'))fs.writeFileSync(index,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
else assert.deepEqual(result,JSON.parse(fs.readFileSync(index,'utf8')));
console.log(`${channels} independent CPU channels, ${modelPixels} exact driver-model pixels, negative controls and ${Object.keys(files).length} hashes verified.`);
