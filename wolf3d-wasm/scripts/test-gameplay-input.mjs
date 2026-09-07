#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { stageNativeKeyHeaders } from './native-key-headers.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=process.env.WOLF4SDL_SOURCE_DIR || path.join(root,'.work/wolf4sdl');
const input=fs.readFileSync(path.join(source,'id_in.cpp'),'utf8');
const play=fs.readFileSync(path.join(source,'wl_play.cpp'),'utf8');
function extract(text,name) {
    const start=text.search(new RegExp('(?:extern "C" EMSCRIPTEN_KEEPALIVE int|extern "C" EMSCRIPTEN_KEEPALIVE void|static int|static void|boolean|void)\\s+'+name+'\\s*\\([^;{}]*\\)\\s*\\{'));
    assert(start>=0,name);let end=text.indexOf('{',start),depth=1;
    for(++end;depth && end<text.length;++end) {if(text[end]==='{')++depth;else if(text[end]==='}')--depth;}
    assert.equal(depth,0);return text.slice(start,end);
}
const declarations=input.slice(input.indexOf('static boolean WebGameplayKeyPressed'),input.indexOf('#include <emscripten/emscripten.h>'));
assert(declarations.includes('WebGameplayMouseSample'));
const production=declarations+'\n'+['WolfWasm_BrowserSetInputCaptured','INL_GetMouseButtons','processEvent',
    'IN_ProcessEvents','IN_ClearKeysDown','IN_GameplayKeyDown','IN_FinishGameplayInput'].map(name=>extract(input,name)).join('\n');
const controls=['PollKeyboardButtons','PollMouseButtons','PollKeyboardMove'].map(name=>extract(play,name)).join('\n');
const polling=extract(play,'PollControls');
assert.match(polling,/PollKeyboardButtons[\s\S]*PollMouseButtons[\s\S]*PollKeyboardMove[\s\S]*PollMouseMove[\s\S]*IN_FinishGameplayInput/);
assert.match(polling,/if \(demoplayback\)[\s\S]*IN_FinishGameplayInput\(\);\s*return;/);
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'wolf-gameplay-input-')),results={};
try {
    const sdkHeaders=stageNativeKeyHeaders(temporary);
    for(const mode of ['wolf3d','spear','desktop','sdk-wolf3d','sdk-spear','missing-key-edge','missing-mouse-edge']) {
        let code=production;
        if(mode==='missing-key-edge')code=code.replace('Keyboard[key] || WebGameplayKeyPressed[key]','Keyboard[key]');
        if(mode==='missing-mouse-edge')code=code.replace('buttons |= WebGameplayMousePressed;','/* old mouse held-state-only sampling */');
        fs.writeFileSync(path.join(temporary,'gameplay-input-production.h'),code);
        fs.writeFileSync(path.join(temporary,'gameplay-controls-production.h'),controls);
        const binary=path.join(temporary,mode);
        const compile=spawnSync(process.env.CXX || 'c++',['-std=c++17','-O1','-fsanitize=undefined','-fno-sanitize-recover=all',
            ...(mode==='desktop'?[]:['-DWOLF4SDL_WEB']),...(mode==='spear'?['-DSPEAR']:[]),'-I',temporary,
            ...(mode.startsWith('sdk-')?['-DWOLF_SDK_KEYCODES','-I',sdkHeaders.sdk]:[]),
            ...(mode==='sdk-spear'?['-DSPEAR']:[]),
            path.join(root,'tests/gameplay-input.cpp'),'-o',binary],{encoding:'utf8'});
        assert.equal(compile.status,0,compile.stderr);
        const run=spawnSync(binary,[],{encoding:'utf8',timeout:10000});assert.equal(run.signal,null);
        const checks=run.stdout.trim().split('\n').map(line=>JSON.parse(line));
        const failures=checks.filter(c=>!c.passed).length;
        if(mode.startsWith('missing-')) {assert.equal(run.status,1,run.stderr);assert(failures>0);}
        else {assert.equal(run.status,0,run.stderr);assert.equal(failures,0);}
        results[mode]={cases:checks.length,failures,checks};
    }
    const proof={observedAt:new Date().toISOString(),scope:'Extracted full native SDL event processing, held/edge sampling, keyboard/mouse gameplay polls, focus/capture loss and frame consumption with an SDL queue fixture under UBSan. Browser/desktop branches and two failing old-behavior controls. Not real Chrome capture or held-key acceptance.',
        productionSha256:createHash('sha256').update(production+controls+polling).digest('hex'),sdkHeaderHashes:sdkHeaders.hashes,results};
    if(process.env.WOLF_INPUT_PROOF)fs.writeFileSync(process.env.WOLF_INPUT_PROOF,JSON.stringify(proof,null,2)+'\n',{flag:'wx'});
    console.log(JSON.stringify(Object.fromEntries(Object.entries(results).map(([mode,r])=>[mode,{cases:r.cases,failures:r.failures}]))));
} finally {fs.rmSync(temporary,{recursive:true,force:true});}
