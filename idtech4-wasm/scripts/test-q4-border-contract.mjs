#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {borderReference} from '../tests/q4-border-cpu-reference.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const work=process.env.IDTECH4_WORK_ROOT||path.join(root,'.work');
const directory=path.join(work,'openq4/tools/build');
const {transformBorderShader}=await import(pathToFileURL(path.join(directory,'emscripten_border_shader.mjs')));
const helper=fs.readFileSync(path.join(directory,'emscripten_border_sampler.glsl'),'utf8');
const script=fs.readFileSync(path.join(root,'scripts/test-q4-border-sampling.mjs'),'utf8');
const fragment=script.match(/const samplingFragment = `([\s\S]*?)`;/)?.[1];
assert.ok(fragment&&!fragment.includes('${'),'reuse the retained fixture UVs and real builtin texture calls');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'q4-border-contract-'));
const binary=path.join(temp,'probe');
execFileSync(process.env.CC||'cc',['-std=c11','-Wall','-Wextra','-Werror',path.join(root,'tests/gl-border-contract.c'),'-o',binary,'-lEGL','-lGL','-lm']);
const packaged=fs.readFileSync(path.join(process.env.Q4_BORDER_PACKAGE||path.join(work,'openq4/build/web'),'openQ4-client_wasm32.js'),'utf8');
const gl={getParameter:()=>16,getShaderParameter:s=>s.type,shaderSource(s,text){s.source=text;}},sandbox={GLctx:gl};
const start=packaged.indexOf('var GLImmediate = {'),end=packaged.indexOf('GLImmediate.matrixLib =',start);
assert.ok(start>=0&&end>start);vm.runInNewContext(packaged.slice(start,end),sandbox);
const shader={type:0x8b30};sandbox.GLImmediate.q4Border.get(gl).shaderSource(shader,fragment);
assert.equal(shader.source,transformBorderShader(fragment,'fragment',helper).source,'test the exact linked shader routing');
const variants=[['production',helper]];
if(process.argv.includes('--negative-controls')){
 assert.ok(helper.includes('float clampedLod = clamp(lod, 0.0, float(lastLevel));'));
 assert.ok(helper.includes('return border;'));
 variants.push(['base-mip-only',helper.replace('float clampedLod = clamp(lod, 0.0, float(lastLevel));','float clampedLod = 0.0;')]);
 variants.push(['edge-substitution',helper.replace('return border;','return texelFetch(map, clamp(texel, ivec2(0), size - ivec2(1)), level);')]);
}
const variantsResult=[];
for(const [name,source] of variants){
 const sourceFile=path.join(temp,name+'.glsl'),fragmentFile=path.join(temp,name+'-fragment.glsl');
 fs.writeFileSync(sourceFile,source);
 fs.writeFileSync(fragmentFile,name==='production'?shader.source:transformBorderShader(fragment,'fragment',source).source);
 const result=JSON.parse(execFileSync(binary,[sourceFile,fragmentFile],{encoding:'utf8',env:{...process.env,EGL_PLATFORM:'surfaceless'},timeout:60000,maxBuffer:8*1024*1024}));
 assert.equal(result.contexts.length,2);
 for(const context of result.contexts){
  assert.equal(context.cases.length,16);context.derivativePolicies=[];
  assert.deepEqual(context.cases.map(r=>[r.size,r.borderAlpha,r.gradientMode]),
   [[8,8],[16,4],[7,5],[1,8]].flatMap(size=>[0,1].flatMap(alpha=>[2,3].map(mode=>[size,alpha,mode]))));
  // GLSL permits default derivatives to use fine or coarse local differencing.
  // Require one complete independently calculated policy across this context,
  // not a per-pixel best match or a driver-specific numerical tolerance.
  for(const derivatives of ['fine','coarse']){
   const summary={derivatives,pixels:0,channels:0,mismatches:0,maximum:0};
   for(const row of context.cases){
    assert.equal(row.pixels.length,484);
    for(let y=0;y<11;y++)for(let x=0;x<11;x++){
     const expected=borderReference(row,x,y,derivatives),actual=row.pixels.slice((y*11+x)*4,(y*11+x+1)*4);
     summary.pixels++;
     for(let c=0;c<4;c++){
      assert.ok(Number.isInteger(actual[c])&&actual[c]>=0&&actual[c]<=255);
      const difference=Math.abs(expected[c]-actual[c]);summary.channels++;
      summary.maximum=Math.max(summary.maximum,difference);
      if(difference>1)summary.mismatches++;
     }
    }
   }
   context.derivativePolicies.push(summary);
  }
  context.summary=context.derivativePolicies.toSorted((a,b)=>a.mismatches-b.mismatches)[0];
 }
 variantsResult.push({name,...result});
}
const result={scope:'Independent double-precision CPU finite-difference LOD and border/mip interpolation versus exact production helper in GL and packaged converted builtin calls in GLES. Fine/coarse GLSL derivative policy must match across each whole context; one-channel tolerance unchanged. Not Chrome/campaign acceptance.',helperSHA256:hash(helper),packagedJsSHA256:hash(packaged),variants:variantsResult};
if(process.env.Q4_BORDER_CONTRACT_PROOF)fs.writeFileSync(process.env.Q4_BORDER_CONTRACT_PROOF,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
for(const variant of variantsResult){
 console.log(JSON.stringify({variant:variant.name,contexts:variant.contexts.map(c=>({driver:c.driver,...c.summary}))}));
 for(const context of variant.contexts){
  if(variant.name==='production')assert.equal(context.summary.mismatches,0,'production sampler must match independent CPU reference');
  else assert.ok(context.summary.mismatches>0,'deliberately broken sampler must fail');
 }
}
