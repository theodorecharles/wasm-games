#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const borderDirectory=path.join(process.env.IDTECH4_WORK_ROOT||path.join(root,'.work'),'openq4/tools/build');
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'q4-border-formats-'));
try{
  const fixture=path.join(root,'tests/gl-border-formats.c'),binary=path.join(temporary,'formats');
  const cc=spawnSync(process.env.CC||'cc',['-std=c11','-Wall','-Wextra','-Werror',fixture,'-o',binary,'-lEGL','-lGL','-lm'],{encoding:'utf8'});
  assert.equal(cc.status,0,cc.stdout+cc.stderr);
  const run=spawnSync(binary,[path.join(borderDirectory,'emscripten_border_sampler.glsl')],{encoding:'utf8',env:{...process.env,EGL_PLATFORM:'surfaceless'},timeout:60000});
  assert.equal(run.status,0,run.stdout+run.stderr);
  const result={scope:'Native desktop GL verification of black border colors after legacy format expansion and texture swizzles, for both compatibility/core-style allocations. Not engine execution or browser acceptance.',
    fixtureSHA256:crypto.createHash('sha256').update(fs.readFileSync(fixture)).digest('hex'),...JSON.parse(run.stdout)};
  assert.equal(result.cases.length,40);
  const opaque=new Set(['xrgb8','rgb565','compat-luminance8','core-luminance8-swizzle','srgb8','depth24','depth24-stencil8']);
  const transparent=new Set(['compat-intensity8','core-intensity8-swizzle','core-luminance-alpha8-swizzle','rgb-normal-swizzle','compat-intensity16']);
  const white=new Set(['compat-alpha8-swizzle','core-alpha8-swizzle','green-alpha-swizzle']);
  for(const row of result.cases){
    const expected=white.has(row.format)?[255,255,255,0]:[0,0,0,opaque.has(row.format)?255:transparent.has(row.format)?0:row.requestedAlpha*255];
    assert.deepEqual(row.border,expected,`${row.format}, requested alpha ${row.requestedAlpha}`);
    if(row.format==='compat-alpha8-swizzle') {
      // Native legacy ALPHA8 has zero RED; this desktop swizzle also wipes
      // interior coverage. Keep the observation, not that interior defect.
      assert.deepEqual(row.center,[255,255,255,0]);
    } else assert.ok(row.center.some((value,index)=>value!==row.border[index]), `${row.format}: interior control must differ from the border`);
    row.passed=true;
  }
  if(process.env.Q4_BORDER_FORMAT_PROOF)fs.writeFileSync(process.env.Q4_BORDER_FORMAT_PROOF,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result,null,2));
}finally{fs.rmSync(temporary,{recursive:true,force:true});}
