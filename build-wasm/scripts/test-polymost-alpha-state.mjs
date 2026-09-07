#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root,'.work/source/source/build/src/glbuild.cpp'),'utf8');
const reset = source.slice(source.indexOf('void buildgl_resetStateAccounting()'),source.indexOf('void buildgl_setViewport('));
const wrappers = reset + source.slice(source.indexOf('void buildgl_setAlphaFunc('),source.indexOf('//POGOTODO: these wrappers'));
assert.match(wrappers,/build_webglSyncAlphaTest/);
const temp = fs.mkdtempSync(path.join(os.tmpdir(),'polymost-alpha-state-'));
try {
  const records = [];
  for (const negative of [false,true]) {
    fs.writeFileSync(path.join(temp,'alpha-wrappers.inc'),negative
      ? wrappers.replaceAll('build_webglSyncAlphaTest();','(void)0;') : wrappers);
    const output = path.join(temp,'state.cjs');
    const build = spawnSync(process.env.EMXX || path.resolve(root,'../idtech4-wasm/.work/host-tools/emxx-6'),
      ['-O1','-std=c++17','-fno-strict-aliasing','-I',temp,path.join(root,'tests/polymost-alpha-state.cpp'),
        '--js-library',path.join(root,'web/polymost-glsl.js'),
        '-sLEGACY_GL_EMULATION=1','-sMIN_WEBGL_VERSION=2','-sMAX_WEBGL_VERSION=2',
        '-sENVIRONMENT=node','-sEXIT_RUNTIME=1','-sASSERTIONS=1','-sGL_ASSERTIONS=1','-sSAFE_HEAP=1',
        '-fsanitize=undefined','-fno-sanitize-recover=all','-o',output],{encoding:'utf8',timeout:120000});
    assert.equal(build.status,0,build.stdout+build.stderr);
    const result = spawnSync(process.execPath,[output],{encoding:'utf8',timeout:30000});
    assert.equal(result.status,negative ? 1 : 0,result.stdout+result.stderr);
    if (negative) assert.match(result.stderr,/alpha state mismatch/);
    else assert.equal(JSON.parse(result.stdout).stateChecks,343);
    records.push({negative,output:result.stdout.trim(),log:result.stderr.trim()});
  }
  const proof = {scope:'Actual native state wrappers/reset and SDK compatibility state, recorded WebGL uniforms; not GPU rendering',
    wrappersHash:createHash('sha256').update(wrappers).digest('hex'),records};
  if (process.env.POLYMOST_ALPHA_STATE_PROOF) fs.writeFileSync(process.env.POLYMOST_ALPHA_STATE_PROOF,JSON.stringify(proof,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify(proof,null,2));
} finally { fs.rmSync(temp,{recursive:true,force:true}); }
