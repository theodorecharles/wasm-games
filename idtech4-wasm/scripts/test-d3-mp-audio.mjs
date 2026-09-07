#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const checkout = path.resolve(process.env.D3_AUDIO_SOURCE || path.join(root, '.work/d3wasm'));
const common = fs.readFileSync(path.join(checkout, 'neo/framework/Common.cpp'), 'utf8');
const session = fs.readFileSync(path.join(checkout, 'neo/framework/Session.cpp'), 'utf8');
function slice(source, start, end) {
  const begin = source.indexOf(start), finish = source.indexOf(end, begin + start.length);
  assert.ok(begin >= 0 && finish > begin, 'source extraction: ' + start);
  return source.slice(begin, finish);
}
const frame = slice(common, 'void idCommonLocal::Frame(void) {', '\n/*\n=================\nidCommonLocal::GUIFrame');
const inlineMix = slice(session, '\tif ( com_asyncSound.GetInteger() == 0 ) {', '\n\n  // Editors');
const asyncMix = slice(common, '  switch ( com_asyncSound.GetInteger()) {', '\n\n  // we update com_ticNumber');
const repair = '    // Network play skips Session::Frame and its inline sound update. Keep\n' +
  '    // the default mixer running here; async modes already mix in Async().\n' +
  '    if ( com_asyncSound.GetInteger() == 0 ) {\n' +
  '      soundSystem->AsyncUpdate( Sys_Milliseconds() );\n    }\n\n';
assert.equal(frame.split(repair).length, 2, 'one explicit MP inline-mixer repair');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'd3-mp-audio-'));
const activeCompiler = spawnSync('em++', ['--version'], {encoding:'utf8'});
const emxx = process.env.EMXX || (/\b6\.0\.6\b/.test(activeCompiler.stdout || '') ? 'em++' :
  path.join(root, '.work/host-tools/emxx-6'));
const results = [];
try {
  for (const negative of [false, true]) {
    const production = (negative ? frame.replace(repair, '') : frame) +
      '\nstatic void inlineSessionMix() {\n' + inlineMix + '\n}\n' +
      'static void asyncTimerMix() { struct { int milliseconds; } current{Sys_Milliseconds()}; auto* stat = &current;\n' + asyncMix + '\n}\n';
    fs.writeFileSync(path.join(directory, 'd3-mp-audio-production.h'), production);
    for (const target of ['native', 'wasm']) {
      const compiler = target === 'native' ? (process.env.CXX || 'c++') : emxx;
      const binary = path.join(directory, target === 'native' ? 'audio-native' : 'audio-wasm.cjs');
      const flags = target === 'native' ? ['-D__EMSCRIPTEN__'] :
        ['-fexceptions', '-sDISABLE_EXCEPTION_CATCHING=0', '-sENVIRONMENT=node', '-sEXIT_RUNTIME=1', '-sASSERTIONS=2', '-sSAFE_HEAP=1'];
      const built = spawnSync(compiler, ['-std=c++17', '-O1', '-DNOMT', ...flags,
        '-I', directory, path.join(root, 'tests/d3-mp-audio.cpp'), '-o', binary], {encoding:'utf8', timeout:120000});
      assert.equal(built.status, 0, built.stdout + built.stderr);
      const run = spawnSync(target === 'native' ? binary : process.execPath,
        target === 'native' ? [] : [binary], {encoding:'utf8', timeout:30000});
      assert.equal(run.status, negative ? 1 : 0, run.stdout + run.stderr);
      const cases = run.stdout.trim().split('\n').map(line => JSON.parse(line));
      assert.equal(cases.length, 20);
      const failures = cases.filter(row => !row.passed);
      assert.deepEqual(failures.map(row => [row.mode, row.case]), negative ?
        [[0, 'join'], [0, 'multiplayer'], [0, 'rejoin']] : []);
      results.push({target, negative, productionSHA256:crypto.createHash('sha256').update(production).digest('hex'), cases});
      console.log(JSON.stringify({target, negative, cases:cases.length, expectedFailures:failures.length}));
    }
  }
  const proof = {scope:'Exact Common::Frame and existing Session inline/async timer mixer blocks compiled on host and Emscripten 6.0.6. Tracing dependencies verify calls/order across all four mixer modes and connection transitions. Negative control removes only the MP repair. Not full sound hardware, native gameplay or listening acceptance.', results, passed:true};
  if (process.env.D3_AUDIO_PROOF) fs.writeFileSync(process.env.D3_AUDIO_PROOF, JSON.stringify(proof, null, 2) + '\n');
} finally { fs.rmSync(directory, {recursive:true, force:true}); }
