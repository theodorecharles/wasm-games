#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const renderer=path.join(process.env.IDTECH4_WORK_ROOT || path.join(root,'.work'),'prey-d3wasm/neo/renderer');
function extract(source,signature) {
  const start=source.indexOf(signature),end=source.indexOf('\n}',start);
  assert.ok(start>=0 && end>start,signature);
  return source.slice(start,end+2);
}
const init=fs.readFileSync(path.join(renderer,'Image_init.cpp'),'utf8');
const load=fs.readFileSync(path.join(renderer,'Image_load.cpp'),'utf8');
const production=extract(init,'void idImage::MakeDefault()')+'\n'+
  extract(load,'void idImage::PurgeImage()')+'\n'+
  extract(load,'int idImage::BitsForInternalFormat(')+'\n'+
  extract(load,'int idImage::StorageSize(');
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'prey-default-images-'));
try {
  fs.writeFileSync(path.join(temporary,'prey-default-production.h'),production);
  const binary=path.join(temporary,'defaults');
  const build=spawnSync(process.env.CXX || 'c++',['-std=c++17','-O1','-I',temporary,
    path.join(root,'tests/prey-default-images.cpp'),'-lEGL','-lGLESv2','-o',binary],{encoding:'utf8'});
  assert.equal(build.status,0,build.stdout+build.stderr);
  const run=spawnSync(binary,[],{encoding:'utf8',env:{...process.env,EGL_PLATFORM:'surfaceless'},timeout:10000});
  assert.equal(run.status,0,run.stdout+run.stderr);
  const result=JSON.parse(run.stdout);
  assert.equal(result.cases.length,11);
  const proof={scope:'Exact Prey MakeDefault, PurgeImage and accounting functions on real EGL/GLES textures. The fixture supplies image fields and a minimal GenerateImage uploader (not the complete production mip/downsize implementation). It verifies missing-texture ownership, metadata, purge isolation and unchanged fallback pixels; not full gameplay or deferred-archive recovery.',
    productionSHA256:crypto.createHash('sha256').update(production).digest('hex'),...result};
  if(process.env.PREY_DEFAULT_IMAGES_PROOF)fs.writeFileSync(process.env.PREY_DEFAULT_IMAGES_PROOF,JSON.stringify(proof,null,2)+'\n');
  const failed=result.cases.filter(c=>!c.passed);
  console.log(JSON.stringify({cases:result.cases.length,failed:failed.length,failures:failed.map(c=>c.label)},null,2));
  if(process.env.PREY_DEFAULT_IMAGES_EXPECT_FAILURE==='1')assert.ok(failed.length>0);
  else assert.equal(failed.length,0,'default images must own valid independent textures');
} finally { fs.rmSync(temporary,{recursive:true,force:true}); }
