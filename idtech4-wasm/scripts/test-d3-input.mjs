#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const checkout=path.join(process.env.IDTECH4_WORK_ROOT || path.join(root,'.work'),'d3wasm');
const source=fs.readFileSync(path.join(checkout,'neo/sys/linux/main.cpp'),'utf8');
const start=source.indexOf('extern "C" EMSCRIPTEN_KEEPALIVE void D3WASM_BrowserKey(');
const end=source.indexOf('extern "C" EMSCRIPTEN_KEEPALIVE void D3WASM_BrowserCommand(',start);
assert.ok(start>=0 && end>start);
const production=source.slice(start,end);
assert.match(fs.readFileSync(path.join(checkout,'neo/framework/Common.cpp'),'utf8'),/SDL_Init\(SDL_INIT_TIMER \| SDL_INIT_VIDEO/);
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'d3-input-'));
try {
  // Shared vector fixture includes this filename; its contents are actual D3.
  fs.writeFileSync(path.join(temporary,'prey-input-production.h'),production);
  const binary=path.join(temporary,'input.cjs');
  const compiled=spawnSync(process.env.EMXX || 'em++',['-std=c++17','-O1','-sUSE_SDL=2','-sENVIRONMENT=node','-sEXIT_RUNTIME=1',
    '-I',temporary,path.join(root,'tests/d3-input.cpp'),'-o',binary],{encoding:'utf8'});
  assert.equal(compiled.status,0,compiled.stdout+compiled.stderr);
  const run=spawnSync(process.execPath,[binary],{encoding:'utf8',timeout:10000});
  assert.equal(run.status,0,run.stdout+run.stderr);
  const cases=run.stdout.trim().split('\n').filter(line=>line.startsWith('{')).map(line=>JSON.parse(line));
  assert.equal(cases.length,52);
  const proof={scope:'Exact shared Doom 3/RoE browser keyboard/text exports compiled to Wasm with real SDL2 event queue and SDL_KeyboardInit, the actual keymap step used by SDL video initialization. Session/console conditions are fixtures for Escape routing. Covers non-text keys, uppercase identity, text case, case changes before keyup and seven Escape states. Not a browser, full video driver, gameplay mapper or campaign test.',
    sourceSHA256:crypto.createHash('sha256').update(production).digest('hex'),cases};
  if(process.env.D3_INPUT_PROOF)fs.writeFileSync(process.env.D3_INPUT_PROOF,JSON.stringify(proof,null,2)+'\n');
  const failures=cases.filter(row=>!row.passed);
  console.log(JSON.stringify({cases:cases.length,failures},null,2));
  if(process.env.D3_INPUT_EXPECT_FAILURE==='1')assert.ok(failures.length>0);
  else assert.equal(failures.length,0);
} finally {fs.rmSync(temporary,{recursive:true,force:true});}
