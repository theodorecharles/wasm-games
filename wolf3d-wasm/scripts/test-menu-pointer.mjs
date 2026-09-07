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
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'wolf-menu-pointer-'));
try {
  const binary=path.join(temporary,'menu');
  const legacy=process.env.WOLF_MENU_LEGACY==='1';
  const compiled=spawnSync(process.env.CXX || 'c++',['-std=c++17','-O1','-pthread',...(legacy?['-DWOLF_MENU_LEGACY']:[]),'-I',source,path.join(root,'tests/menu-pointer.cpp'),'-o',binary],{encoding:'utf8'});
  assert.equal(compiled.status,0,compiled.stdout+compiled.stderr);
  const run=spawnSync(binary,[],{encoding:'utf8',timeout:10000});
  assert.ifError(run.error);
  const cases=run.stdout.trim().split('\n').map(line=>JSON.parse(line));
  assert.equal(cases.length,40);
  const proof={scope:'Production atomic menu-pointer mailbox and hit testing with native-style menu descriptors, including all lines of episode titles. Tests quick clicks, enabled rows, bounds, cancellation and transitions. Legacy mode uses the preceding one-row episode call. Not full native UI, concurrent scheduling or browser acceptance.',legacy,sourceSHA256:crypto.createHash('sha256').update(fs.readFileSync(path.join(source,'web/menu_pointer.h'))).digest('hex'),cases};
  if(process.env.WOLF_MENU_PROOF)fs.writeFileSync(process.env.WOLF_MENU_PROOF,JSON.stringify(proof,null,2)+'\n');
  assert.equal(run.status,0,run.stdout+run.stderr);
  assert.ok(cases.every(row=>row.passed));
  console.log(`${cases.length} production Wolf4SDL menu-pointer cases passed`);
} finally {fs.rmSync(temporary,{recursive:true,force:true});}
