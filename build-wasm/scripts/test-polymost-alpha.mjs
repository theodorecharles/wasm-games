#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let library; vm.runInNewContext(fs.readFileSync(path.join(root,'web/polymost-glsl.js'),'utf8'),{addToLibrary:value=>library=value});
const read = name => fs.readFileSync(path.join(root,'.work/source/source/build/src',name),'utf8');
const vertex = library.$BuildPolymostGLSL(read('polymost1Vert.glsl'),true);
const temporary = fs.mkdtempSync(path.join(os.tmpdir(),'polymost-alpha-'));
const run = (command,args) => spawnSync(command,args,{encoding:'utf8',timeout:60000});
try {
  const executable = path.join(temporary,'alpha');
  const build = run('c++',['-std=c++17','-O2',path.join(root,'tests/polymost-alpha.cpp'),'-lEGL','-lGLESv2','-o',executable]);
  assert.equal(build.status,0,build.stdout+build.stderr);
  const records = [];
  for (const extended of [false,true]) {
    const source = read('polymost1Frag.glsl');
    const fragment = library.$BuildPolymostGLSL(extended ? source : source.replace(' #define POLYMOST1_EXTENDED','//define POLYMOST1_EXTENDED'),false);
    for (const mode of ['fixed','missing-discard-color','missing-discard-depth']) {
      const negative = mode !== 'fixed';
      const vertFile = path.join(temporary,'shader.vert'), fragFile = path.join(temporary,'shader.frag');
      fs.writeFileSync(vertFile,vertex);
      fs.writeFileSync(fragFile,negative ? fragment.replace('if (!buildAlphaPass(o_fragColor.a)) discard;','') : fragment);
      const result = run(executable,[vertFile,fragFile,...(mode.endsWith('depth') ? ['depth-only'] : [])]);
      assert.equal(result.status,negative ? 1 : 0,result.stdout+result.stderr);
      if (negative) assert.match(result.stderr,mode.endsWith('depth') ? /alpha depth mismatch: func=200/ : /alpha color mismatch: func=200/);
      else assert.equal(JSON.parse(result.stdout).alphaCases,3840);
      records.push({extended,mode,negative,fragmentHash:createHash('sha256').update(fragment).digest('hex'),
        output:result.stdout.trim(),log:result.stderr.trim()});
    }
  }
  const proof = {scope:'Production basic/extended shaders, all alpha comparisons, blended/unblended color and depth occlusion through GLES; not whole-game acceptance',records};
  if (process.env.POLYMOST_ALPHA_PROOF) fs.writeFileSync(process.env.POLYMOST_ALPHA_PROOF,JSON.stringify(proof,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify(proof,null,2));
} finally { fs.rmSync(temporary,{recursive:true,force:true}); }
