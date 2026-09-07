#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync, execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const checkout = process.env.PREY_TRACE_SOURCE || path.join(root, '.work/prey-d3wasm');
const legacy = process.argv.includes('--legacy');
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const clip = fs.readFileSync(path.join(checkout, 'neo/game/physics/Clip.cpp'), 'utf8');
const header = fs.readFileSync(path.join(checkout, 'neo/game/physics/Clip.h'), 'utf8');
const save = fs.readFileSync(path.join(checkout, 'neo/game/gamesys/SaveGame.cpp'), 'utf8');
const upstream = execFileSync('git', ['-C', checkout, 'show', 'HEAD:neo/game/physics/Clip.cpp'], {encoding:'utf8'});
function method(source, signature) {
  const start = source.indexOf(signature);
  assert.ok(start >= 0, signature);
  let depth = 0;
  for (let i = source.indexOf('{', start); i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  assert.fail('Unclosed method: ' + signature);
}
const methods = ['void idClipModel::ClearTraceModelCache(', 'int idClipModel::AllocTraceModel(',
  'void idClipModel::FreeTraceModel(', 'idTraceModel *idClipModel::GetCachedTraceModel(',
  'int idClipModel::GetTraceModelHashKey(', 'void idClipModel::SaveTraceModels(',
  'void idClipModel::RestoreTraceModels(', 'void idClipModel::LoadModel( const idTraceModel &trm )'];
for (const signature of methods) assert.equal(method(clip, signature), method(upstream, signature), 'unchanged cache/serialization: ' + signature);
const init = method(clip, 'void idClip::Init(').match(/\tdefaultClipModel\.LoadModel\([^\n]+/)[0];
const reference = method(clip, 'void idClipModel::Restore(').match(/\tsavefile->ReadInt\( traceModelIndex \);\n\tif \( traceModelIndex >= 0 \) \{\n\t\ttraceModelCache\[traceModelIndex\]->refCount\+\+;\n\t\}/)[0];
const restoreObjects = method(save, 'void idRestoreGame::RestoreObjects(');
const call = legacy ? '\tidClipModel::RestoreTraceModels( this );' : '\tgameLocal.clip.RestoreTraceModels( this );';
assert.equal(restoreObjects.split(call).length, 2, 'one actual production restore call');
assert.ok(restoreObjects.indexOf(call) < restoreObjects.indexOf('CallRestore_r('));
if (!legacy) {
  assert.match(header, /void\s+RestoreTraceModels\( idRestoreGame \*savefile \);/);
  assert.match(header, /void\s+FreeTraceModels\( void \);/);
}
const common = [clip.match(/typedef struct trmCache_s \{[\s\S]+?\} trmCache_t;/)[0],
  'static idList<trmCache_s*> traceModelCache;\nstatic idHashIndex traceModelHash;',
  ...methods.map(signature => method(clip, signature)),
  ...['Shutdown', ...(!legacy ? ['FreeTraceModels', 'RestoreTraceModels'] : [])].map(name => method(clip, 'void idClip::' + name + '(')),
  'void idClip::InitDefault() {\n' + init + '\n}',
  'void idClipModel::RestoreTraceReference(idRestoreGame* savefile) {\n' + reference + '\n}'
].join('\n');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'prey-trace-cache-'));
const results = [];
try {
  for (const negative of legacy ? [true] : [false, true]) {
    const production = common + '\nvoid idRestoreGame::RestoreObjects() {\n' +
      (negative ? call.replace('gameLocal.clip.', 'idClipModel::') : call) + '\n}\n';
    // Reuse only the ownership/typed-record dependencies and scenarios, with
    // exact Prey method bodies. No Doom 3 production method is substituted.
    fs.writeFileSync(path.join(temporary, 'd3-trace-cache-production.h'), production);
    for (const target of ['native', 'wasm']) {
      const binary = path.join(temporary, target === 'native' ? 'trace-native' : 'trace-wasm.cjs');
      const compiler = target === 'native' ? (process.env.CXX || 'c++') :
        (process.env.EMXX || path.join(root, '.work/host-tools/emxx-6'));
      const flags = target === 'native' ? ['-fsanitize=address,undefined', '-fno-omit-frame-pointer', '-fno-sanitize-recover=all'] :
        ['-fexceptions', '-sDISABLE_EXCEPTION_CATCHING=0', '-sENVIRONMENT=node', '-sEXIT_RUNTIME=1',
          '-sASSERTIONS=2', '-sSAFE_HEAP=1', '-fsanitize=undefined', '-fno-sanitize-recover=all'];
      const built = spawnSync(compiler, ['-std=c++17', '-O1', ...flags, '-I', temporary,
        path.join(root, 'tests/d3-trace-cache.cpp'), '-o', binary], {encoding:'utf8', timeout:120000});
      assert.equal(built.status, 0, built.stdout + built.stderr);
      const environment = {...process.env};
      if (target === 'native' && environment.LD_PRELOAD) {
        const library = execFileSync(compiler, ['-print-file-name=libasan.so'], {encoding:'utf8'}).trim();
        assert.ok(path.isAbsolute(library) && fs.existsSync(library));
        environment.LD_PRELOAD = library + ':' + environment.LD_PRELOAD;
      }
      const run = spawnSync(target === 'native' ? binary : process.execPath,
        target === 'native' ? [] : [binary], {encoding:'utf8', timeout:30000, env:environment});
      assert.equal(run.status, negative ? 1 : 0, run.stdout + run.stderr);
      assert.equal(run.stderr, '', 'no sanitizer/runtime diagnostics');
      const cases = run.stdout.trim().split('\n').map(line => JSON.parse(line));
      assert.equal(cases.length, 11);
      const failures = cases.filter(row => !row.passed);
      assert.deepEqual(failures.map(row => row.case), negative ? cases.slice(0, 9).map(row => row.case) : []);
      results.push({target, negative, productionSHA256:digest(production), cases});
      console.log(JSON.stringify({target, negative, cases:cases.length, expectedFailures:failures.length}));
    }
  }
  const proof = {
    scope:'Actual Prey cache/LoadModel/Shutdown/ownership methods and extracted Init/entity-reference/SaveGame call compiled with host ASan/UBSan and Wasm SAFE_HEAP/UBSan. Shared fixture models typed records and reference ownership, not Human Head collision math or disk save compatibility. Nine scenarios repeat three loads; fresh shutdown and original warning guard also tested. Original cache serialization is byte-identical to pinned Prey upstream.',
    legacy, clipSHA256:digest(clip), headerSHA256:digest(header), saveSHA256:digest(save),
    fixtureSHA256:digest(fs.readFileSync(path.join(root, 'tests/d3-trace-cache.cpp'))), results
  };
  if (process.env.PREY_TRACE_PROOF) fs.writeFileSync(process.env.PREY_TRACE_PROOF, JSON.stringify(proof, null, 2) + '\n', {flag:'wx'});
} finally {
  fs.rmSync(temporary, {recursive:true, force:true});
}
