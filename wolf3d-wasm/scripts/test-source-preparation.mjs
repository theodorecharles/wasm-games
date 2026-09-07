#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=process.env.WOLF4SDL_SOURCE_DIR||path.join(root,'.work/wolf4sdl');
const patches=fs.readFileSync(path.join(root,'patches/series'),'utf8').split('\n')
  .map(s=>s.trim()).filter(s=>s&&!s.startsWith('#')).map(s=>path.join(root,'patches',s));
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'wolf-prepare-test-'));
const git=(args,cwd)=>execFileSync('git',args,{cwd,stdio:['pipe','pipe','pipe']});
const prepare=checkout=>spawnSync(path.join(root,'scripts/fetch-source'),[],{
  env:{...process.env,WOLF4SDL_SOURCE_DIR:checkout},encoding:'utf8'});
try {
  const bundle=path.join(temporary,'source.bundle');
  git(['bundle','create',bundle,'HEAD'],source);
  for(let prefix=0;prefix<=patches.length;prefix++) {
    const checkout=path.join(temporary,'prefix-'+prefix);
    git(['clone','--no-checkout',bundle,checkout]);
    git(['checkout','--detach','3d41ccce8f8fecbed83aa9d8d42734c2c7e62374'],checkout);
    git(['remote','set-url','origin','https://github.com/theodorecharles/wolf3d-wasm.git'],checkout);
    for(const patch of patches.slice(0,prefix))git(['apply',patch],checkout);
    fs.writeFileSync(path.join(checkout,'LOCAL-NOTES.md'),'Preserve user notes.\n');
    const run=prepare(checkout);assert.equal(run.status,0,run.stderr);
    execFileSync(process.execPath,[path.join(root,'scripts/test-source.mjs')],{
      env:{...process.env,WOLF4SDL_SOURCE_DIR:checkout},stdio:'pipe'});
    const repeated=prepare(checkout);assert.equal(repeated.status,0,repeated.stderr);
    assert.equal(fs.readFileSync(path.join(checkout,'LOCAL-NOTES.md'),'utf8'),'Preserve user notes.\n');
    fs.appendFileSync(path.join(checkout,'id_in.cpp'),'\n// User input experiment, do not overwrite.\n');
    const before=git(['diff','--binary'],checkout);
    const dirty=prepare(checkout);assert.notEqual(dirty.status,0);
    assert.match(dirty.stderr,/preserved without modification/);
    assert.deepEqual(git(['diff','--binary'],checkout),before);
  }
  console.log(`Source preparation: ${patches.length+1} patch prefixes, repeat runs, local notes and overlapping-edit preservation passed.`);
} finally {fs.rmSync(temporary,{recursive:true,force:true});}
