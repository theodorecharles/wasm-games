#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const work=process.env.IDTECH4_WORK_ROOT || path.join(root,'.work');
function extract(source, signature) {
  const start=source.indexOf(signature);
  assert.ok(start>=0,signature);
  let depth=0;
  for(let i=source.indexOf('{',start);i<source.length;i++) {
    if(source[i]==='{')depth++;
    if(source[i]==='}' && --depth===0)return source.slice(start,i+1);
  }
  throw Error(`Unclosed function: ${signature}`);
}
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'d3-image-accounting-'));
const results=[];
try {
  for(const engine of ['d3wasm','prey-d3wasm']) {
    const source=fs.readFileSync(path.join(work,engine,'neo/renderer/Image_load.cpp'),'utf8');
    assert.ok((source.match(/internalFormat = GL_RGBA;/g)||[]).length>=2,'Both real 2D and cube upload paths select RGBA');
    const production=extract(source,'int idImage::BitsForInternalFormat(')+'\n'+extract(source,'int idImage::StorageSize(');
    fs.writeFileSync(path.join(temporary,'d3-image-accounting-production.h'),production);
    const binary=path.join(temporary,'accounting');
    const compiled=spawnSync(process.env.CXX || 'c++',['-std=c++17','-O1','-I',temporary,path.join(root,'tests/d3-image-accounting.cpp'),'-o',binary],{encoding:'utf8'});
    assert.equal(compiled.status,0,compiled.stdout+compiled.stderr);
    const run=spawnSync(binary,[],{encoding:'utf8',timeout:10000});
    assert.equal(run.status,0,run.stdout+run.stderr);
    const cases=run.stdout.trim().split('\n').map(line=>JSON.parse(line));
    assert.equal(cases.length,23);
    results.push({engine,sourceSHA256:crypto.createHash('sha256').update(production).digest('hex'),cases});
  }
  const proof={scope:'Exact production image format/StorageSize functions with image-field and throwing-error surroundings. Covers the GL_RGBA selected by real 2D/cube uploads, legacy formats, invalid-format rejection and unloaded images. This is CPU accounting, not physical GPU allocation or full engine acceptance.',results};
  if(process.env.D3_IMAGE_ACCOUNTING_PROOF)fs.writeFileSync(process.env.D3_IMAGE_ACCOUNTING_PROOF,JSON.stringify(proof,null,2)+'\n');
  const summary=results.map(r=>({engine:r.engine,cases:r.cases.length,failed:r.cases.filter(c=>!c.passed).length}));
  console.log(JSON.stringify(summary,null,2));
  if(process.env.D3_IMAGE_ACCOUNTING_EXPECT_FAILURE==='1')assert.ok(summary.every(r=>r.failed>0));
  else assert.ok(summary.every(r=>r.failed===0),'every image format and storage estimate must pass');
} finally {
  fs.rmSync(temporary,{recursive:true,force:true});
}
