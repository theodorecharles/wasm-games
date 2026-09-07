#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const renderer=path.join(process.env.IDTECH4_WORK_ROOT || path.join(root,'.work'),'openq4/src/renderer');
const capture=fs.readFileSync(path.join(renderer,'RenderSystem.cpp'),'utf8');
const tiled=fs.readFileSync(path.join(renderer,'RenderSystem_init.cpp'),'utf8');
function extract(source,signature) {
  const start=source.indexOf(signature), end=source.indexOf('\n}\n',start);
  assert.ok(start>=0 && end>start,signature);
  return source.slice(start,end+3);
}
const production=extract(capture,'void idRenderSystemLocal::CaptureRenderToFile(')+'\n'+
  extract(tiled,'void R_ReadTiledPixels(');
const helperPath=path.join(renderer,'ScreenshotReadback.h');
const helper=fs.existsSync(helperPath)?fs.readFileSync(helperPath,'utf8'):'';
function nativePreprocessed(source) {
  const result=spawnSync(process.env.CXX || 'c++',['-E','-P','-x','c++','-'],{input:source,encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  return result.stdout.replace(/\s+/g,'');
}
const original=['RenderSystem.cpp','RenderSystem_init.cpp'].map(name=>{
  const result=spawnSync('git',['-C',renderer,'show',`HEAD:src/renderer/${name}`],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  return extract(result.stdout,name==='RenderSystem.cpp'?'void idRenderSystemLocal::CaptureRenderToFile(':'void R_ReadTiledPixels(');
}).join('\n');
assert.equal(nativePreprocessed(helper+'\n'+production),nativePreprocessed(original),
  'desktop/Vulkan preprocessed capture code must remain identical to pinned native source');
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'q4-readback-'));
const results=[];
try {
  fs.writeFileSync(path.join(temporary,'q4-readback-production.h'),helper+'\n'+production);
  for(const api of ['gles','desktop']) {
    const binary=path.join(temporary,api);
    const args=['-std=c++17','-O1','-I',temporary,path.join(root,'tests/q4-readback.cpp'),
      '-lEGL',api==='gles'?'-lGLESv2':'-lGL','-o',binary];
    if(api==='gles')args.unshift('-D__EMSCRIPTEN__=1');
    else args.unshift('-DQ4_READBACK_DESKTOP=1');
    const build=spawnSync(process.env.CXX || 'c++',args,{encoding:'utf8'});
    assert.equal(build.status,0,build.stdout+build.stderr);
    const run=spawnSync(binary,[],{encoding:'utf8',env:{...process.env,EGL_PLATFORM:'surfaceless'},timeout:30000});
    assert.equal(run.status,0,run.stdout+run.stderr);
    results.push({api,...JSON.parse(run.stdout)});
  }
  const proof={scope:'Exact native capture and tiled readback functions, with browser conditional selected for real EGL/GLES and unchanged desktop branch on EGL/GL. Fixture substitutes scene rendering and records pixels passed to the TGA writer; it does not run native main or encode a save file.',
    captureSourceSHA256:crypto.createHash('sha256').update(capture).digest('hex'),
    tiledSourceSHA256:crypto.createHash('sha256').update(tiled).digest('hex'),
    helperSHA256:helper?crypto.createHash('sha256').update(helper).digest('hex'):null,
    nativeBranchesUnchangedFromPin:true,results};
  if(process.env.Q4_READBACK_PROOF)fs.writeFileSync(process.env.Q4_READBACK_PROOF,JSON.stringify(proof,null,2)+'\n');
  console.log(JSON.stringify(results.map(r=>({api:r.api,cases:r.cases.length,failed:r.cases.filter(c=>!c.passed).length})),null,2));
  const browserFailures=results[0].cases.filter(c=>!c.passed);
  assert.ok(results[1].cases.every(c=>c.passed),'supported desktop capture path must remain unchanged');
  if(process.env.Q4_READBACK_EXPECT_FAILURE==='1')assert.ok(browserFailures.length>0,'baseline must expose invalid readback');
  else assert.equal(browserFailures.length,0,'browser capture and tiled pixels/state must match');
} finally { fs.rmSync(temporary,{recursive:true,force:true}); }
