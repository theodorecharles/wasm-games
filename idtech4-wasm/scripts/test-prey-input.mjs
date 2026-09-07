#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=fs.readFileSync(path.join(process.env.IDTECH4_WORK_ROOT || path.join(root,'.work'),'prey-d3wasm/neo/sys/linux/main.cpp'),'utf8');
const helper=source.indexOf('static SDL_Keycode PREYWASM_BrowserKeycode(');
const start=helper>=0 ? helper : source.indexOf('extern "C" EMSCRIPTEN_KEEPALIVE void PREYWASM_BrowserKey(');
const end=source.indexOf('extern "C" EMSCRIPTEN_KEEPALIVE void PREYWASM_BrowserFrame(',start);
assert.ok(start>=0 && end>start);
const production=source.slice(start,end);
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'prey-input-'));
try {
  fs.writeFileSync(path.join(temporary,'prey-input-production.h'),production);
  const binary=path.join(temporary,'input.cjs');
  const compiled=spawnSync(process.env.EMXX || 'em++',['-std=c++17','-O1','-sUSE_SDL=2','-sENVIRONMENT=node','-sEXIT_RUNTIME=1','-I',temporary,path.join(root,'tests/prey-input.cpp'),'-o',binary],{encoding:'utf8'});
  assert.equal(compiled.status,0,compiled.stdout+compiled.stderr);
  const run=spawnSync(process.execPath,[binary],{encoding:'utf8',timeout:10000});
  assert.equal(run.status,0,run.stdout+run.stderr);
  const cases=run.stdout.trim().split('\n').filter(line=>line.startsWith('{')).map(line=>JSON.parse(line));
  assert.equal(cases.length,43);
  const proof={scope:'Exact production browser keyboard and text exports compiled to Wasm with the real SDL2 event queue, initialized without video as in Prey. Includes uppercase SDL identity and unchanged text case. This fixture does not run the game event mapper, native main or a browser.',sourceSHA256:crypto.createHash('sha256').update(production).digest('hex'),cases};
  if(process.env.PREY_INPUT_PROOF)fs.writeFileSync(process.env.PREY_INPUT_PROOF,JSON.stringify(proof,null,2)+'\n');
  const failures=cases.filter(row=>!row.passed);
  console.log(JSON.stringify({cases:cases.length,failures:failures.length},null,2));
  if(process.env.PREY_INPUT_EXPECT_FAILURE==='1')assert.ok(failures.length>0,'legacy must expose missing browser keycodes');
  else assert.equal(failures.length,0,'all browser key events must reach SDL with the expected keycode');
} finally {
  fs.rmSync(temporary,{recursive:true,force:true});
}
