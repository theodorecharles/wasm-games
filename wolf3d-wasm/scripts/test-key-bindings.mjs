#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {stageNativeKeyHeaders} from './native-key-headers.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=process.env.WOLF4SDL_SOURCE_DIR||path.join(root,'.work/wolf4sdl');
const menu=fs.readFileSync(path.join(source,'wl_menu.cpp'),'utf8');
const input=fs.readFileSync(path.join(source,'id_in.cpp'),'utf8');
function extract(text,name) {
  const match=new RegExp('(?:const char \\*|extern "C" EMSCRIPTEN_KEEPALIVE void)\\s*'+name+'\\s*\\([^;{}]*\\)\\s*\\{').exec(text);
  assert(match,name);let end=match.index+match[0].length,depth=1;
  for(;depth&&end<text.length;end++){if(text[end]==='{')depth++;else if(text[end]==='}')depth--;}
  assert.equal(depth,0);return text.slice(match.index,end);
}
const table=menu.match(/static const char\* const ScanNames\[SDLK_LAST\][\s\S]*?\};/)[0];
const names=extract(menu,'IN_GetScanName'),controller=extract(input,'WolfWasm_BrowserControllerKey');
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'wolf-key-bindings-')),results={};
try {
  const headers=stageNativeKeyHeaders(temporary);
  for(const mode of ['wolf3d','spear','old-name-table','old-controller-codes']) {
    const code=table+'\n'+(mode==='old-name-table'?'const char *IN_GetScanName(ScanCode scan) { return ScanNames[scan]; }':names)+'\n'+
      (mode==='old-controller-codes'?controller.replace(/    switch \(keycode\)[\s\S]*?\n    }/,''):controller);
    fs.writeFileSync(path.join(temporary,'key-bindings-production.h'),code);
    const binary=path.join(temporary,mode);
    const compile=spawnSync(process.env.CXX||'c++',['-std=c++17','-O1','-fsanitize=undefined','-fno-sanitize-recover=all',
      '-DWOLF4SDL_WEB',...(mode==='spear'?['-DSPEAR']:[]),...(mode==='old-name-table'?['-DOLD_NAMES_CONTROL']:[]),
      '-I',headers.sdk,'-I',temporary,path.join(root,'tests/key-bindings.cpp'),'-o',binary],{encoding:'utf8'});
    assert.equal(compile.status,0,compile.stderr);
    const run=spawnSync(binary,[],{encoding:'utf8',timeout:10000});assert.equal(run.signal,null,run.stderr);
    const checks=run.stdout.trim().split('\n').map(line=>JSON.parse(line));
    const failures=checks.filter(c=>!c.passed).length;
    assert.equal(run.status,mode.startsWith('old-')?1:0,run.stderr);
    if(mode.startsWith('old-'))assert(failures>0);else assert.equal(failures,0);
    results[mode]={cases:checks.length,failures,checks};
  }
  const result={observedAt:new Date().toISOString(),sdkHeaderHashes:headers.hashes,
    productionSha256:createHash('sha256').update(table+names+controller).digest('hex'),results,
    scope:'Extracted native binding names and controller key translation compiled with actual SDK key enums/compat aliases under host UBSan. Not browser editing/persistence or gamepad acceptance.'};
  if(process.env.WOLF_KEY_BINDINGS_PROOF)fs.writeFileSync(process.env.WOLF_KEY_BINDINGS_PROOF,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify(Object.fromEntries(Object.entries(results).map(([k,v])=>[k,{cases:v.cases,failures:v.failures}]))));
} finally {fs.rmSync(temporary,{recursive:true,force:true});}
