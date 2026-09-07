#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=fs.readFileSync(path.join(process.env.IDTECH4_WORK_ROOT || path.join(root,'.work'),'openq4/src/sys/linux/main.cpp'),'utf8');
const start=source.indexOf('static int q4wasmLastBrowserState = -1;');
const end=source.indexOf('\n#endif',start);
assert.ok(start>=0 && end>start);
const production=source.slice(start,end);
const pak=path.join(process.env.IDTECH4_WORK_ROOT || path.join(root,'.work'),'openq4/build/web/baseoq4/pak0.pk4');
const extracted=spawnSync('unzip',['-p',pak,'guis/mainmenu.gui'],{encoding:'utf8'});
assert.equal(extracted.status,0,extracted.stderr);
assert.match(extracted.stdout,/onESC\s*\{[\s\S]*?"desktop::video_check"\s*==\s*1[\s\S]*?"desktop::curr"\s*==\s*0\s*&&\s*"desktop::active"\s*==\s*0\s*&&\s*"gui::ingame"\s*!=\s*0/,
  'review browser resume classification when the shipped root-menu Escape branch changes');
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'q4-state-'));
try {
  fs.writeFileSync(path.join(temporary,'q4-state-production.h'),production);
  const binary=path.join(temporary,'state.cjs');
  const compiled=spawnSync(process.env.EMXX || 'em++',['-std=c++17','-O1','-sENVIRONMENT=node','-sEXIT_RUNTIME=1','-I',temporary,path.join(root,'tests/q4-state.cpp'),'-o',binary],{encoding:'utf8'});
  assert.equal(compiled.status,0,compiled.stdout+compiled.stderr);
  const run=spawnSync(process.execPath,[binary],{encoding:'utf8',timeout:10000});
  assert.equal(run.status,0,run.stdout+run.stderr);
  const messages=run.stdout.trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));
  const expected=[
    ['no-map-menu','menu','menu',false],['no-map-console','paused','console',false],
    ['gameplay','gameplay','gameplay',false],['gameplay-console','paused','console',true],
    ['console-over-menu','paused','console',false],['root-pause-menu','paused','menu',true],
    ['load-submenu','paused','menu',false],['save-submenu','paused','menu',false],
    ['settings-submenu','paused','menu',false],['menu-animation','paused','menu',false],
    ['menu-logo-video','paused','menu',false],['unknown-menu-schema','paused','menu',false],
    ['menu-no-ingame-flag','paused','menu',false],['missing-desktop','paused','menu',false],
    ['message-box','paused','menu',false],['test-gui','paused','menu',false],
    ['continue-stale-input-guard','paused','continue',false],['continue-ready','paused','continue',true],
    ['continue-before-console','paused','continue',true],['continue-without-map','paused','continue',false],
    ['return-gameplay','gameplay','gameplay',false],['cache-root-ready','paused','menu',true],
    ['cache-root-animation','paused','menu',false],['cache-root-ready-again','paused','menu',true]
  ];
  const cases=expected.map(([label,state,inputMode,resumeAvailable])=>{
    const actual=messages.find(message=>message.label===label);
    return {label,expected:{state,inputMode,resumeAvailable},actual:actual || null,
      passed:actual?.state===state && actual?.inputMode===inputMode && actual?.resumeAvailable===resumeAvailable};
  });
  const unexpected=messages.filter(message=>!expected.some(row=>row[0]===message.label));
  const proof={scope:'Production native browser-state classification/publication compiled to Wasm with recording session/window/console surroundings. GUI scripts and full native main are not run by this fixture.',
    sourceSHA256:crypto.createHash('sha256').update(source).digest('hex'),
    menuSHA256:crypto.createHash('sha256').update(extracted.stdout).digest('hex'),cases,unexpected};
  if(process.env.Q4_STATE_PROOF)fs.writeFileSync(process.env.Q4_STATE_PROOF,JSON.stringify(proof,null,2)+'\n');
  const failures=cases.filter(row=>!row.passed);
  console.log(JSON.stringify({cases:cases.length,failures:failures.length,unexpected:unexpected.length},null,2));
  assert.equal(unexpected.length,0,'unchanged state must not publish duplicate messages');
  if(process.env.Q4_STATE_EXPECT_FAILURE==='1')assert.ok(failures.length>0,'baseline must expose missing native state');
  else assert.equal(failures.length,0,'all native state/intent cases must pass');
}finally{fs.rmSync(temporary,{recursive:true,force:true});}
