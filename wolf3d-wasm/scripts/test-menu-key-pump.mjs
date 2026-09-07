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
const input=fs.readFileSync(path.join(source,'id_in.cpp'),'utf8');
const start=input.indexOf('void IN_ProcessEvents()'),end=input.indexOf('\n}',start);assert.ok(start>=0 && end>start);
const production=input.slice(start,end+2),temporary=fs.mkdtempSync(path.join(os.tmpdir(),'wolf-menu-keys-'));
try {
  fs.writeFileSync(path.join(temporary,'wolf-key-pump-production.h'),production);
  const binary=path.join(temporary,'keys');
  const compiled=spawnSync(process.env.CXX || 'c++',['-std=c++17','-O1','-DWOLF4SDL_WEB','-I',temporary,path.join(root,'tests/menu-key-pump.cpp'),'-o',binary],{encoding:'utf8'});
  assert.equal(compiled.status,0,compiled.stdout+compiled.stderr);
  const run=spawnSync(binary,[],{encoding:'utf8',timeout:10000});
  const cases=run.stdout.trim().split('\n').map(line=>JSON.parse(line));assert.equal(cases.length,12);
  const proof={scope:'Exact production IN_ProcessEvents with fixture SDL queue/event-state updates. Verifies menu/paused key-down visibility, releases, chords, directions, and unchanged gameplay/non-key drain policy. Not full SDL or held movement acceptance.',sourceSHA256:crypto.createHash('sha256').update(production).digest('hex'),cases};
  if(process.env.WOLF_MENU_KEYS_PROOF)fs.writeFileSync(process.env.WOLF_MENU_KEYS_PROOF,JSON.stringify(proof,null,2)+'\n');
  const failures=cases.filter(c=>!c.passed);console.log(JSON.stringify({cases:12,failures}));
  if(process.env.WOLF_MENU_KEYS_EXPECT_FAILURE==='1')assert.ok(failures.length>0);else assert.equal(failures.length,0);
} finally {fs.rmSync(temporary,{recursive:true,force:true});}
