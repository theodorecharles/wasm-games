#!/usr/bin/env node
// Identify the complete applied prefix, because later patches can legitimately
// change earlier patch contexts. Never reset a checkout or replace local edits.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=path.resolve(process.argv[2]);
const patches=fs.readFileSync(path.join(root,'patches/series'),'utf8').split('\n')
  .map(s=>s.trim()).filter(s=>s&&!s.startsWith('#')).map(s=>path.join(root,'patches',s));
const files=new Set(patches.flatMap(p=>[...fs.readFileSync(p,'utf8').matchAll(/^diff --git a\/(.+) b\/(.+)$/gm)].map(m=>m[2])));
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'wolf-patch-prefix-'));
try {
  execFileSync('tar',['-x','-C',temporary],{input:execFileSync('git',['-C',source,'archive','HEAD'],{maxBuffer:32*1024*1024})});
  let applied=-1;
  for(let index=0;index<=patches.length;index++) {
    if([...files].every(file=>{
      const actual=path.join(source,file),expected=path.join(temporary,file);
      if(!fs.existsSync(actual)||!fs.existsSync(expected))return fs.existsSync(actual)===fs.existsSync(expected);
      return fs.readFileSync(actual).equals(fs.readFileSync(expected));
    }))applied=index;
    if(index<patches.length) {
      execFileSync('git',['apply','--check',patches[index]],{cwd:temporary});
      execFileSync('git',['apply',patches[index]],{cwd:temporary});
    }
  }
  assert(applied>=0,'Wolf4SDL patched files contain local changes or an unknown patch combination; preserved without modification.');
  for(const patch of patches.slice(applied)) {
    execFileSync('git',['-C',source,'apply','--check',patch]);
    execFileSync('git',['-C',source,'apply',patch]);
  }
} finally {fs.rmSync(temporary,{recursive:true,force:true});}
