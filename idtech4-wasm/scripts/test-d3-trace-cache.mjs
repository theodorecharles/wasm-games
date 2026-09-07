#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync, execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const targets=[
  ['base', process.env.D3_TRACE_BASE_SOURCE || path.join(root,'.work/d3wasm-sabot'), 'neo/game'],
  ['roe', process.env.D3_TRACE_ROE_SOURCE || path.join(root,'.work/d3wasm-roe-game'), 'neo/d3xp'],
];
const digest=text=>crypto.createHash('sha256').update(text).digest('hex');
function method(source, signature) {
  const start=source.indexOf(signature);
  assert.ok(start>=0,signature);
  let depth=0;
  for(let i=source.indexOf('{',start);i<source.length;i++) {
    if(source[i]==='{') depth++;
    if(source[i]==='}' && --depth===0) return source.slice(start,i+1);
  }
  assert.fail('Unclosed method: '+signature);
}
const cacheMethods=[
  'void idClipModel::ClearTraceModelCache(', 'int idClipModel::AllocTraceModel(',
  'void idClipModel::FreeTraceModel(', 'idTraceModel *idClipModel::GetCachedTraceModel(',
  'int idClipModel::GetTraceModelHashKey(', 'void idClipModel::SaveTraceModels(',
  'void idClipModel::RestoreTraceModels(', 'void idClipModel::LoadModel( const idTraceModel &trm )',
];
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'d3-trace-cache-'));
const activeCompiler=spawnSync('em++',['--version'],{encoding:'utf8'});
const emxx=process.env.EMXX || (/\b6\.0\.6\b/.test(activeCompiler.stdout||'')?'em++':path.join(root,'.work/host-tools/emxx-6'));
const results=[];
try {
  for(const [variant,checkout,game] of targets) {
    const clip=fs.readFileSync(path.join(checkout,game,'physics/Clip.cpp'),'utf8');
    const header=fs.readFileSync(path.join(checkout,game,'physics/Clip.h'),'utf8');
    const save=fs.readFileSync(path.join(checkout,game,'gamesys/SaveGame.cpp'),'utf8');
    const upstream=execFileSync('git',['-C',checkout,'show','HEAD:'+game+'/physics/Clip.cpp'],{encoding:'utf8'});
    for(const signature of cacheMethods) assert.equal(method(clip,signature),method(upstream,signature),'existing cache/save method unchanged: '+signature);
    assert.match(header,/void\s+RestoreTraceModels\( idRestoreGame \*savefile \);/);
    assert.match(header,/void\s+FreeTraceModels\( void \);/);
    const init=method(clip,'void idClip::Init(').match(/\tdefaultClipModel\.LoadModel\([^\n]+/)[0];
    const reference=method(clip,'void idClipModel::Restore(').match(/\tsavefile->ReadInt\( traceModelIndex \);\n\tif \( traceModelIndex >= 0 \) \{\n\t\ttraceModelCache\[traceModelIndex\]->refCount\+\+;\n\t\}/)[0];
    const restoreObjects=method(save,'void idRestoreGame::RestoreObjects(');
    const call='\tgameLocal.clip.RestoreTraceModels( this );';
    assert.equal(restoreObjects.split(call).length,2,'one repaired restore call site');
    assert.ok(restoreObjects.indexOf(call)<restoreObjects.indexOf('CallRestore_r('),'cache restored before entity references');
    const declaration=clip.match(/typedef struct trmCache_s \{[\s\S]+?\} trmCache_t;/)[0];
    const common=[declaration,'static idList<trmCache_s*> traceModelCache;\nstatic idHashIndex traceModelHash;',
      ...cacheMethods.map(signature=>method(clip,signature)),
      ...['Shutdown','FreeTraceModels','RestoreTraceModels'].map(name=>method(clip,'void idClip::'+name+'(')),
      'void idClip::InitDefault() {\n'+init+'\n}',
      'void idClipModel::RestoreTraceReference(idRestoreGame* savefile) {\n'+reference+'\n}',
    ].join('\n');
    for(const negative of [false,true]) {
      // The negative changes only the actual SaveGame call back to the old
      // static entry point. All repaired ownership methods remain compiled.
      const production=common+'\nvoid idRestoreGame::RestoreObjects() {\n'+
        (negative?call.replace('gameLocal.clip.','idClipModel::'):call)+'\n}\n';
      fs.writeFileSync(path.join(directory,'d3-trace-cache-production.h'),production);
      for(const target of ['native','wasm']) {
        const binary=path.join(directory,target==='native'?'trace-native':'trace-wasm.cjs');
        const compiler=target==='native'?(process.env.CXX||'c++'):emxx;
        const flags=target==='native'?['-fsanitize=address,undefined','-fno-omit-frame-pointer','-fno-sanitize-recover=all']:
          ['-fexceptions','-sDISABLE_EXCEPTION_CATCHING=0','-sENVIRONMENT=node','-sEXIT_RUNTIME=1','-sASSERTIONS=2','-sSAFE_HEAP=1','-fsanitize=undefined','-fno-sanitize-recover=all'];
        const built=spawnSync(compiler,
          ['-std=c++17','-O1',...flags,'-I',directory,path.join(root,'tests/d3-trace-cache.cpp'),'-o',binary],
          {encoding:'utf8',timeout:120000});
        assert.equal(built.status,0,built.stdout+built.stderr);
        const environment={...process.env};
        if(target==='native' && environment.LD_PRELOAD) {
          // Retain inherited hooks and put ASan first, as its runtime requires.
          const library=execFileSync(compiler,['-print-file-name=libasan.so'],{encoding:'utf8'}).trim();
          assert.ok(path.isAbsolute(library) && fs.existsSync(library));
          environment.LD_PRELOAD=library+':'+environment.LD_PRELOAD;
        }
        const run=spawnSync(target==='native'?binary:process.execPath,target==='native'?[]:[binary],{encoding:'utf8',timeout:30000,env:environment});
        assert.equal(run.status,negative?1:0,run.stdout+run.stderr);
        assert.equal(run.stderr,'','no sanitizer/runtime diagnostics');
        const cases=run.stdout.trim().split('\n').map(line=>JSON.parse(line));
        assert.equal(cases.length,11);
        const failures=cases.filter(row=>!row.passed);
        assert.deepEqual(failures.map(row=>row.case),negative?cases.slice(0,9).map(row=>row.case):[]);
        results.push({variant,target,negative,clipSHA256:digest(clip),saveSHA256:digest(save),productionSHA256:digest(production),cases});
        console.log(JSON.stringify({variant,target,negative,cases:cases.length,expectedFailures:failures.length}));
      }
    }
  }
  const proof={scope:'Exact base/RoE cache, LoadModel, clip cleanup/restore methods and extracted Init/entity-reference/SaveGame-call blocks compiled on host with address/undefined sanitizers and Emscripten with SAFE_HEAP. Nine typed-record save scenarios each repeat three loads; fresh shutdown and original warning guard also checked. Old SaveGame entry point is the negative control. Existing cache serialization methods remain byte-identical to pinned upstream source. Dependencies model save records and ownership, not collision math, binary save compatibility or full gameplay.',results,passed:true};
  if(process.env.D3_TRACE_PROOF) fs.writeFileSync(process.env.D3_TRACE_PROOF,JSON.stringify(proof,null,2)+'\n');
} finally { fs.rmSync(directory,{recursive:true,force:true}); }
