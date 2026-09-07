#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=process.env.WOLF4SDL_SOURCE_DIR || path.join(root,'.work/wolf4sdl');
const cpp=fs.readFileSync(path.join(source,'id_vl.cpp'),'utf8'), header=fs.readFileSync(path.join(source,'id_vl.h'),'utf8');
function extract(input,name) {
    const start=input.search(new RegExp('(?:static void|void inline|void) '+name+'\\s*\\('));
    assert(start>=0,name);let end=input.indexOf('{',start),depth=1;
    for(++end;depth && end<input.length;++end) {if(input[end]==='{')++depth;else if(input[end]==='}')--depth;}
    assert.equal(depth,0);return input.slice(start,end);
}
const production='#ifdef WOLF4SDL_WEB\n'+extract(cpp,'VL_WebPresentPalette')+'\n#endif\n'+
    extract(cpp,'VL_SetColor')+'\n'+extract(cpp,'VL_SetPalette')+'\n'+extract(header,'VL_ClearScreen')+'\n';
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'wolf-palette-'));
const results={};
try {
    for(const mode of ['web','desktop','missing-repaint','canvas-only-clear']) {
        let text=production;
        if(mode==='missing-repaint')text=text.replaceAll('VL_WebPresentPalette();','(void)0; /* preceding missing repaint */');
        if(mode==='canvas-only-clear')text=text.replace('VL_BarScaledCoord(0, 0, screenWidth, screenHeight, color);','SDL_FillRect(curSurface, NULL, color);');
        fs.writeFileSync(path.join(temporary,'palette-production.h'),text);
        const binary=path.join(temporary,mode);
        const compile=spawnSync(process.env.CXX || 'c++',['-std=c++17','-O1','-fsanitize=undefined','-fno-sanitize-recover=all',
            ...(mode==='desktop'?[]:['-DWOLF4SDL_WEB']),'-I',temporary,path.join(root,'tests/palette-present.cpp'),'-o',binary],{encoding:'utf8'});
        assert.equal(compile.status,0,compile.stderr);
        const run=spawnSync(binary,[],{encoding:'utf8',timeout:10000});assert.equal(run.signal,null);assert.equal(run.stderr,'');
        const cases=run.stdout.trim().split('\n').map(line=>JSON.parse(line)),failures=cases.filter(c=>!c.passed);
        if(['web','desktop'].includes(mode)) {assert.equal(run.status,0);assert.equal(failures.length,0);}
        else {assert.equal(run.status,1);assert(failures.length>0);}
        results[mode]={cases:cases.length,failures:failures.length,checks:cases};
    }
    const proof={observedAt:new Date().toISOString(),scope:'Extracted native palette/set-color/clear functions under UBSan with an indexed SDL surface fixture; desktop path preserved, two preceding-behavior negatives fail. Actual browser rendering requires separate Chrome checks.',
        productionSha256:createHash('sha256').update(production).digest('hex'),results};
    if(process.env.WOLF_PALETTE_PROOF)fs.writeFileSync(process.env.WOLF_PALETTE_PROOF,JSON.stringify(proof,null,2)+'\n',{flag:'wx'});
    console.log(JSON.stringify(Object.fromEntries(Object.entries(results).map(([mode,result])=>[mode,{cases:result.cases,failures:result.failures}]))));
} finally {fs.rmSync(temporary,{recursive:true,force:true});}
