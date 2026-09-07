#!/usr/bin/env node
// Exact renderer initialization method with GL call recorders, not a GL context.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {execFileSync, spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, '.work/source/source/build/src/polymost.cpp'), 'utf8');
const begin = source.indexOf('void polymost_initdrawpoly(void)');
const end = source.indexOf('\n}', begin);
assert.ok(begin >= 0 && end > begin);
const method = source.slice(begin, end + 2);
assert.match(method, /if \(glinfo.sync\)\n\s+for/);
const old = method.replace(/    if \(glinfo.sync\)\n        for \(int i=0; i<ARRAY_SSIZE\(drawpolyVertsSync\); i\+\+\)\n            if \(glIsSync\(drawpolyVertsSync\[i\]\)\)\n                glDeleteSync\(drawpolyVertsSync\[i\]\);/,
    '    for (int i=0; i<ARRAY_SSIZE(drawpolyVertsSync); i++)\n        if (glIsSync(drawpolyVertsSync[i]))\n            glDeleteSync(drawpolyVertsSync[i]);');
assert.notEqual(old, method);
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'polymost-stream-'));
const results = [];
try {
  for (const negative of [false, true]) {
    const production = negative ? old : method;
    fs.writeFileSync(path.join(temporary, 'polymost-stream-production.h'), production);
    for (const target of ['native', 'wasm']) {
      const compiler = target === 'native' ? (process.env.CXX || 'c++') :
        (process.env.EMXX || path.resolve(root, '../idtech4-wasm/.work/host-tools/emxx-6'));
      const output = path.join(temporary, target === 'native' ? 'test-native' : 'test-wasm.cjs');
      const flags = target === 'native' ? ['-fsanitize=address,undefined', '-fno-sanitize-recover=all'] :
        ['-sENVIRONMENT=node', '-sEXIT_RUNTIME=1', '-sSAFE_HEAP=1', '-fsanitize=undefined', '-fno-sanitize-recover=all'];
      const build = spawnSync(compiler, ['-std=c++17', '-O1', ...flags, '-I', temporary,
        path.join(root, 'tests/polymost-stream-reset.cpp'), '-o', output], {encoding:'utf8', timeout:120000});
      assert.equal(build.status, 0, build.stdout + build.stderr);
      const env = {...process.env};
      if (target === 'native' && env.LD_PRELOAD) {
        const asan = execFileSync(compiler, ['-print-file-name=libasan.so'], {encoding:'utf8'}).trim();
        assert.ok(path.isAbsolute(asan) && fs.existsSync(asan));
        env.LD_PRELOAD = asan + ':' + env.LD_PRELOAD;
      }
      const run = spawnSync(target === 'native' ? output : process.execPath,
        target === 'native' ? [] : [output], {encoding:'utf8', timeout:30000, env});
      assert.equal(run.status, negative ? 1 : 0, run.stdout + run.stderr);
      assert.equal(run.stderr, '');
      const cases = run.stdout.trim().split('\n').map(line => JSON.parse(line));
      assert.equal(cases.length, 16);
      assert.deepEqual(cases.filter(row => !row.passed).map(row => row.case), negative ? [0,1,2,3,4,5,6,7] : []);
      results.push({target, negative, productionSHA256:hash(production), cases});
      console.log(JSON.stringify({target, negative, cases:16, expectedFailures:negative ? 8 : 0}));
    }
  }
  if (process.env.POLYMOST_STREAM_PROOF) fs.writeFileSync(process.env.POLYMOST_STREAM_PROOF,
    JSON.stringify({scope:'Exact polymost_initdrawpoly method under native ASan/UBSan and Wasm SAFE_HEAP/UBSan; GL recorders test capability-guarded sync cleanup, stream/persistent allocation, existing buffer disposal and reset state. Not real driver rendering or browser acceptance.',
      sourceSHA256:hash(source), fixtureSHA256:hash(fs.readFileSync(path.join(root, 'tests/polymost-stream-reset.cpp'))), results}, null, 2) + '\n', {flag:'wx'});
} finally { fs.rmSync(temporary, {recursive:true, force:true}); }
