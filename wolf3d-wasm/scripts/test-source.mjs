#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=process.env.WOLF4SDL_SOURCE_DIR || path.join(root,'.work/wolf4sdl');
const commit='3d41ccce8f8fecbed83aa9d8d42734c2c7e62374';
assert.equal(execFileSync('git',['-C',source,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),commit);
assert.doesNotMatch(fs.readFileSync(path.join(root,'scripts/fetch-source'),'utf8'),/find.*\.md.*-delete/,'source preparation must preserve upstream/user Markdown');
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'wolf-source-'));
try {
  execFileSync('tar',['-x','-C',temporary],{input:execFileSync('git',['-C',source,'archive',commit],{maxBuffer:32*1024*1024})});
  const files=new Set();
  const series=fs.readFileSync(path.join(root,'patches/series'),'utf8').split('\n').map(x=>x.trim()).filter(x=>x && !x.startsWith('#'));
  for(const patch of series) {
    const file=path.join(root,'patches',patch);
    execFileSync('git',['apply','--check',file],{cwd:temporary});
    execFileSync('git',['apply',file],{cwd:temporary});
    for(const match of fs.readFileSync(file,'utf8').matchAll(/^diff --git a\/(.+) b\/(.+)$/gm))files.add(match[2]);
  }
  for(const file of files)assert.deepEqual(fs.readFileSync(path.join(source,file)),fs.readFileSync(path.join(temporary,file)),file);
  console.log(`Exact ${series.length}-patch reconstruction matches all ${files.size} patched source files`);
} finally {fs.rmSync(temporary,{recursive:true,force:true});}
