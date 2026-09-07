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
function section(file,startText,endText) {
  const source=fs.readFileSync(path.join(checkout,file),'utf8');
  const start=source.indexOf(startText),end=source.indexOf(endText,start+startText.length);
  assert.ok(start>=0 && end>start,file);
  return source.slice(start,end);
}
const production=section('neo/framework/Session.cpp','bool idSessionLocal::ProcessEvent(', '\n/*\n===============')+'\n'+
  section('neo/sys/linux/main.cpp','extern "C" EMSCRIPTEN_KEEPALIVE void D3WASM_BrowserOpenMenu(', 'extern "C" EMSCRIPTEN_KEEPALIVE void D3WASM_BrowserCapture(');
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'d3-session-events-'));
try {
  fs.writeFileSync(path.join(temporary,'d3-session-production.h'),production);
  const results=[];
  for(const browser of [false,true]) {
    const binary=path.join(temporary,browser?'browser-session':'desktop-session');
    const compiled=spawnSync(process.env.CXX || 'c++',['-std=c++17','-O1',...(browser?['-D__EMSCRIPTEN__']:[]),
      '-I',temporary,path.join(root,'tests/d3-session-events.cpp'),'-o',binary],{encoding:'utf8'});
    assert.equal(compiled.status,0,compiled.stdout+compiled.stderr);
    const run=spawnSync(binary,[],{encoding:'utf8',timeout:10000});
    assert.equal(run.status,0,run.stdout+run.stderr);
    const cases=run.stdout.trim().split('\n').map(line=>JSON.parse(line));
    assert.equal(cases.length,browser?20:15);
    results.push({browser,cases});
  }
  const proof={scope:'Exact shared Doom 3/RoE Session::ProcessEvent and BrowserOpenMenu bodies, compiled for browser/desktop preprocessor branches with tracing game, console, GUI and binding dependencies. Tests native routing, not full SDL/game/console implementations, pointer capture or rendering.',
    sourceSHA256:crypto.createHash('sha256').update(production).digest('hex'),results};
  if(process.env.D3_SESSION_PROOF)fs.writeFileSync(process.env.D3_SESSION_PROOF,JSON.stringify(proof,null,2)+'\n');
  const failures=results.flatMap(result=>result.cases.filter(row=>!row.passed).map(row=>({browser:result.browser,...row})));
  console.log(JSON.stringify({cases:35,failures},null,2));
  if(process.env.D3_SESSION_EXPECT_FAILURE==='1')assert.ok(failures.length>0);
  else assert.equal(failures.length,0);
} finally {fs.rmSync(temporary,{recursive:true,force:true});}
