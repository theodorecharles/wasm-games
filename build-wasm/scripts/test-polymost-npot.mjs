#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root,'.work/source/source/build/src');
const read = file => fs.readFileSync(path.join(source,file),'utf8');
const base = read('baselayer.cpp'), polymost = read('polymost.cpp');
const capStart = base.indexOf('    glinfo.texnpot  ='), capEnd = base.indexOf('\n    glinfo.bgra',capStart);
assert(capStart > 0 && capEnd > capStart);
const capability = base.slice(capStart,capEnd);
const uvStart = polymost.indexOf('    vec2_t tsiz2 = tsiz;'), uvEnd = polymost.indexOf('    if (method & DAMETH_MASKPROPS',uvStart);
assert(uvStart > 0 && uvEnd > uvStart);
const coordinates = polymost.slice(uvStart,uvEnd);
let library; vm.runInNewContext(fs.readFileSync(path.join(root,'web/polymost-glsl.js'),'utf8'), {addToLibrary: value => library = value});
const vertex = library.$BuildPolymostGLSL(read('polymost1Vert.glsl'),true);
const fragment = library.$BuildPolymostGLSL(read('polymost1Frag.glsl').replace(' #define POLYMOST1_EXTENDED','//define POLYMOST1_EXTENDED'),false);
assert.match(fragment, /precision highp sampler2D;/, 'palette lookups must not inherit ES lowp sampler precision');
const temp = fs.mkdtempSync(path.join(os.tmpdir(),'polymost-npot-'));
const run = (cmd,args) => spawnSync(cmd,args,{encoding:'utf8',timeout:60000});
const hash = text => createHash('sha256').update(text).digest('hex');
try {
  fs.writeFileSync(path.join(temp,'coordinates.inc'),coordinates);
  fs.writeFileSync(path.join(temp,'shader.vert'),vertex); fs.writeFileSync(path.join(temp,'shader.frag'),fragment);
  const records = [];
  for (const variant of ['browser','old-detection','old-sampler-precision','desktop']) {
    fs.writeFileSync(path.join(temp,'capability.inc'),variant === 'old-detection' ? capability.replace('#ifdef __EMSCRIPTEN__','#if 0') : capability);
    fs.writeFileSync(path.join(temp,'shader.frag'),variant === 'old-sampler-precision'
      ? fragment.replace('precision highp sampler2D;', 'precision lowp sampler2D;') : fragment);
    const executable = path.join(temp,variant);
    const build = run('c++',['-std=c++17','-O2',`-DFIXTURE_BROWSER=${variant === 'desktop' ? 0 : 1}`,'-I',temp,
      path.join(root,'tests/polymost-npot.cpp'),'-lEGL','-lGLESv2','-o',executable]);
    assert.equal(build.status,0,build.stdout+build.stderr);
    for (const mode of variant === 'old-detection' ? ['','render-only'] : variant === 'desktop' ? ['caps-only'] : ['']) {
      const result = run(executable,[path.join(temp,'shader.vert'),path.join(temp,'shader.frag'),mode]);
      // Drivers may legally exceed lowp's minimum precision. Record whether
      // this driver reproduces the old palette-index loss; don't fake a failure.
      const precisionLoss = variant === 'old-sampler-precision' && result.status === 1;
      const negative = variant === 'old-detection' || precisionLoss;
      assert.equal(result.status,negative ? 1 : 0,result.stdout+result.stderr);
      if (negative) assert.match(result.stderr, precisionLoss ? /NPOT pixel mismatch/ : mode ? /NPOT pixel mismatch: 5x7/ : /NPOT capability mismatch/);
      else assert.equal(JSON.parse(result.stdout).capabilityChecks,9);
      if (variant === 'browser') assert.equal(JSON.parse(result.stdout).renderCases,18);
      records.push({variant,mode,expectedFailure:negative,precisionLoss,output:result.stdout.trim(),log:result.stderr.trim()});
    }
  }
  const proof = {scope:'Production NPOT detection/coordinate calculation and translated shaders through GLES pixel readback, not whole-game acceptance',
    hashes:{capability:hash(capability),coordinates:hash(coordinates),vertex:hash(vertex),fragment:hash(fragment)},records};
  if (process.env.POLYMOST_NPOT_PROOF) fs.writeFileSync(process.env.POLYMOST_NPOT_PROOF,JSON.stringify(proof,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify(proof,null,2));
} finally { fs.rmSync(temp,{recursive:true,force:true}); }
