#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const fixture=path.join(root,'tests/gl-border-lod.c');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'q4-border-lod-'));
const binary=path.join(temp,'probe');
execFileSync(process.env.CC||'cc',['-std=c11','-Wall','-Wextra','-Werror',fixture,'-o',binary,'-lEGL','-lGL','-lm']);
const result=JSON.parse(execFileSync(binary,[],{encoding:'utf8',env:{...process.env,EGL_PLATFORM:'surfaceless'},maxBuffer:8*1024*1024,timeout:60000}));
assert.equal(result.cases.length,16);
for(const row of result.cases){
 assert.equal(row.samples.length,121);
 row.summary={lodDifference:0,queryLodMaximum:0,exactLodMaximum:0,queryLodChannels:0,exactLodChannels:0,coarseFastMaximum:0,coarseFastChannels:0,fineFastMaximum:0,fineFastChannels:0};
 for(const s of row.samples){
  assert.ok([...s.query,s.exactLod,...s.implicit,...s.queryLod,...s.exactLodSample,...s.coarseFastSample,...s.fineFastSample,...s.modelLods].every(Number.isFinite));
  row.summary.lodDifference=Math.max(row.summary.lodDifference,Math.abs(s.query[1]-s.exactLod));
  for(let channel=0;channel<4;channel++)for(const [field,key] of [['queryLod','queryLod'],['exactLodSample','exactLod'],['coarseFastSample','coarseFast'],['fineFastSample','fineFast']]){
   const difference=Math.abs(Math.round(s.implicit[channel]*255)-Math.round(s[field][channel]*255));
   row.summary[key+'Maximum']=Math.max(row.summary[key+'Maximum'],difference);
   if(difference>1)row.summary[key+'Channels']++;
  }
 }
}
result.scope='Independent native implicit versus textureQueryLod-driven and mathematical explicit LOD samples, with float framebuffer readback; no game shader/helper and no Chrome acceptance.';
result.fixtureSHA256=crypto.createHash('sha256').update(fs.readFileSync(fixture)).digest('hex');
if(process.argv.includes('--expect-llvmpipe-model')){
 assert.match(result.driver,/llvmpipe/);
 for(const row of result.cases)assert.equal(row.summary.coarseFastMaximum,0,'coarse derivatives plus fast log must reproduce native implicit pixels exactly');
 assert.ok(result.cases.some(row=>row.summary.queryLodChannels>0),'query LOD alone must not explain all implicit pixels');
 assert.ok(result.cases.some(row=>row.summary.fineFastChannels>0),'fast log without coarse derivatives must not explain all implicit pixels');
}
if(process.env.Q4_LOD_PROOF)fs.writeFileSync(process.env.Q4_LOD_PROOF,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({driver:result.driver,version:result.version,cases:result.cases.map(({size,borderAlpha,projected,summary})=>({size,borderAlpha,projected,...summary}))},null,2));
