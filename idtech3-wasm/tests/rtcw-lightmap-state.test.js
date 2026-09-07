'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const cp = require('node:child_process');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'rtcw-lightmap-state-test-'));
const relative = 'MP/code/renderer/tr_es2.c';
// tr_es2.c is introduced by patch 0017. Reconstruct just that complete file
// from authored patches, so the unit suite needs no engine checkout or build.
const patches = fs.readdirSync(path.join(root, 'patches/rtcw')).sort();
function applyPatch(number) {
  const matches = patches.filter(name => name.startsWith(number + '-'));
  assert.equal(matches.length, 1);
  cp.execFileSync('git', ['apply', `--include=${relative}`, path.join(root, 'patches/rtcw', matches[0])], { cwd: scratch, stdio: 'pipe' });
}
applyPatch('0017'); applyPatch('0018');
const old = fs.readFileSync(path.join(scratch, relative), 'utf8');
applyPatch('0021');
const current = fs.readFileSync(path.join(scratch, relative), 'utf8');
if (process.argv[2]) assert.equal(fs.readFileSync(path.resolve(process.argv[2], relative), 'utf8'), current);
const prefix = fs.readFileSync(path.join(__dirname, 'fixtures/rtcw-lightmap-state-prefix.c'), 'utf8');
const main = fs.readFileSync(path.join(__dirname, 'fixtures/rtcw-lightmap-state-main.c'), 'utf8');
const environment = { ...process.env };
if (environment.LD_PRELOAD) {
  // Preserve session interposers while satisfying ASan's runtime ordering.
  const asan = cp.execFileSync('cc', ['-print-file-name=libasan.so'], { encoding: 'utf8' }).trim();
  assert.ok(path.isAbsolute(asan) && fs.existsSync(asan));
  environment.LD_PRELOAD = `${asan}:${environment.LD_PRELOAD}`;
}
function compile(name, text) {
  assert.ok(text.startsWith('#include "tr_local.h"'));
  const file = path.join(scratch, `${name}.c`), binary = path.join(scratch, name);
  fs.writeFileSync(file, prefix + '\n' + text.replace('#include "tr_local.h"', '') + '\n' + main);
  cp.execFileSync('cc', ['-std=c11', '-D__EMSCRIPTEN__', '-O1', '-g', '-fsanitize=undefined,address', '-fno-sanitize-recover=all', file, '-o', binary], { stdio: 'pipe' });
  return binary;
}
const repaired = JSON.parse(cp.execFileSync(compile('repaired', current), { encoding: 'utf8', env: environment }));
assert.equal(repaired.cases, 96); assert.equal(repaired.nativeDrawMask, 0);
const oldBinary = compile('old', old);
const baseline = JSON.parse(cp.execFileSync(oldBinary, ['observe'], { encoding: 'utf8', env: environment }));
assert.equal(baseline.cases, 96); assert.equal(baseline.nativeDrawMask, 15);
const rejected = cp.spawnSync(oldBinary, [], { encoding: 'utf8', env: environment });
assert.notEqual(rejected.status, 0); assert.match(rejected.stderr, /legacy arrays would hijack/);

// Execute the exact installed Emscripten draw wrapper. Nonzero legacy masks
// route through emulation; an isolated explicit draw must go straight to GL.
const wrapper = fs.readFileSync(path.join(__dirname, 'fixtures/rtcw-legacy-draw-wrapper.js'), 'utf8').trim();
const js = process.argv[3] ? fs.readFileSync(path.resolve(process.argv[3]), 'utf8') : wrapper;
const start = js.indexOf('var _emscripten_glDrawArrays =');
const next = js.indexOf('var _emscripten_glDrawArraysInstanced =', start);
const end = next < 0 ? js.length : next;
assert.ok(start >= 0 && end > start);
assert.equal(js.slice(start, end).trim(), wrapper);
for (let mask = 0; mask < 16; mask++) {
  let raw = 0, emulated = 0;
  const context = {
    GLctx: { currentArrayBufferBinding: 1, drawArrays(mode, first, count) { assert.deepEqual([mode, first, count], [4, 0, 6]); raw++; } },
    GLImmediate: { totalEnabledClientAttributes: mask.toString(2).replace(/0/g, '').length,
      prepareClientAttributes(count, beginEnd) { assert.equal(count, 6); assert.equal(beginEnd, false); },
      flush() { emulated++; } }
  };
  vm.runInNewContext(js.slice(start, end) + '\n_emscripten_glDrawArrays(4, 0, 6);', context);
  assert.equal(raw, mask === 0 ? 1 : 0); assert.equal(emulated, mask === 0 ? 0 : 1);
}
console.log(JSON.stringify({ repaired, baseline, oldRejected: true, emittedDrawRoutes: 16, scratch }, null, 2));
