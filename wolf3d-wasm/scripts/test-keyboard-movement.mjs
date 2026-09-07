#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=process.env.WOLF4SDL_SOURCE_DIR || path.join(root,'.work/wolf4sdl');
const play=fs.readFileSync(path.join(source,'wl_play.cpp'),'utf8');
const start=play.indexOf('void PollKeyboardMove (void)'),end=play.indexOf('\n}',start);
assert.ok(start>=0 && end>start);
const main=fs.readFileSync(path.join(source,'wl_main.cpp'),'utf8');
const restore=main.match(/    dirscan\[di_north\] = sc_UpArrow;\n    dirscan\[di_east\] = sc_RightArrow;\n    dirscan\[di_south\] = sc_DownArrow;\n    dirscan\[di_west\] = sc_LeftArrow;/)?.[0];
assert.ok(restore);
const production=`void RestoreBrowserDirections(){\n${process.env.WOLF_MOVEMENT_LEGACY==='1'?'':restore}\n}\n`+play.slice(start,end+2);
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'wolf-movement-'));
try {
  fs.writeFileSync(path.join(temporary,'wolf-movement-production.h'),production);
  const results=[];
  for(const variant of ['wolf3d','spear']) {
    const binary=path.join(temporary,variant);
    const compiled=spawnSync(process.env.CXX || 'c++',['-std=c++17','-O1','-DWOLF4SDL_WEB',...(variant==='spear'?['-DSPEAR']:[]),'-I',temporary,path.join(root,'tests/keyboard-movement.cpp'),'-o',binary],{encoding:'utf8'});
    assert.equal(compiled.status,0,compiled.stdout+compiled.stderr);
    const run=spawnSync(binary,[],{encoding:'utf8',timeout:10000});
    const cases=run.stdout.trim().split('\n').map(line=>JSON.parse(line));assert.equal(cases.length,14);
    results.push({variant,cases});
  }
  const proof={scope:'Exact production PollKeyboardMove and four browser ReadConfig direction assignments, with fixture keyboard/control fields seeded with old persisted WASD direction bindings. Both native variant defines. Not full configuration I/O, actor physics or Chrome held-key acceptance.',legacyDirections:process.env.WOLF_MOVEMENT_LEGACY==='1',sourceSHA256:crypto.createHash('sha256').update(production).digest('hex'),results};
  if(process.env.WOLF_MOVEMENT_PROOF)fs.writeFileSync(process.env.WOLF_MOVEMENT_PROOF,JSON.stringify(proof,null,2)+'\n');
  const failed=results.flatMap(r=>r.cases).filter(c=>!c.passed).length;
  console.log(JSON.stringify({cases:28,failed}));
  if(process.env.WOLF_MOVEMENT_LEGACY==='1')assert.ok(failed>0);else assert.equal(failed,0);
} finally {fs.rmSync(temporary,{recursive:true,force:true});}
