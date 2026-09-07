#!/usr/bin/env node
// Actual diagnostic body; this checks binding-slot order, not gameplay input.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, '.work/source/source/blood/src/blood.cpp'), 'utf8');
const begin = source.indexOf('extern "C" EMSCRIPTEN_KEEPALIVE int NBlood_WasmControlsMask(');
assert(begin >= 0);
const body = source.slice(begin, source.indexOf('\n}', begin) + 2);
assert(body.includes('KeyboardKeys[function][1] == scan'));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blood-controls-mask-'));
const records = [];
try {
  fs.copyFileSync(path.join(root, '.work/source/source/blood/src/function.h'), path.join(dir, 'function.h'));
  for (const target of ['native', 'wasm']) for (const negative of [false, true]) {
    const fragment = negative ? body.replace(' || KeyboardKeys[function][1] == scan', '') : body;
    fs.writeFileSync(path.join(dir, 'mask.cpp'), `
#include <cstdio>
#include <cstring>
#include "function.h"
#define EMSCRIPTEN_KEEPALIVE
unsigned char KeyboardKeys[NUMGAMEFUNCTIONS][2];
int gMouseAim;
enum { sc_W = 0x11, sc_S = 0x1f, sc_A = 0x1e, sc_D = 0x20 };
${fragment}
int main() {
  const int functions[] = { gamefunc_Move_Forward, gamefunc_Move_Backward, gamefunc_Strafe_Left, gamefunc_Strafe_Right };
  const int scans[] = { sc_W, sc_S, sc_A, sc_D };
  int checks = 0;
  // Every present/absent combination, independently in either slot, with
  // mouselook enabled/disabled; unused slots must never count as bindings.
  for (int present = 0; present < 16; ++present)
  for (int slots = 0; slots < 16; ++slots)
  for (int aim = 0; aim < 2; ++aim) {
    memset(KeyboardKeys, 0xff, sizeof(KeyboardKeys));
    for (int i = 0; i < 4; ++i)
      if (present & (1 << i)) KeyboardKeys[functions[i]][(slots >> i) & 1] = scans[i];
    gMouseAim = aim;
    if (NBlood_WasmControlsMask() != (present | (aim << 4))) {
      fprintf(stderr, "binding-slot mask mismatch: present=%d slots=%d aim=%d\\n", present, slots, aim);
      return 1;
    }
    ++checks;
  }
  printf("{\\"checks\\":%d}\\n", checks);
}
`);
    const output = path.join(dir, target === 'native' ? 'mask-native' : 'mask.cjs');
    const compiler = target === 'native' ? (process.env.CXX || 'g++') :
      (process.env.EMXX || path.resolve(root, '../idtech4-wasm/.work/host-tools/emxx-6'));
    const flags = ['-std=c++17', '-O1', '-fsanitize=undefined', '-fno-sanitize-recover=all'];
    if (target === 'wasm') flags.push('-sSAFE_HEAP=1', '-sASSERTIONS=1', '-sENVIRONMENT=node', '-sEXIT_RUNTIME=1');
    const build = spawnSync(compiler, [...flags, path.join(dir, 'mask.cpp'), '-o', output], { encoding: 'utf8', timeout: 120000 });
    assert.equal(build.status, 0, String(build.error || '') + build.stdout + build.stderr);
    const run = spawnSync(target === 'native' ? output : process.execPath, target === 'native' ? [] : [output],
      { encoding: 'utf8', timeout: 30000 });
    assert.equal(run.status, negative ? 1 : 0, run.stdout + run.stderr);
    if (negative) assert.match(run.stderr, /binding-slot mask mismatch/);
    else assert.equal(JSON.parse(run.stdout).checks, 512);
    records.push({ target, negative, output: run.stdout.trim(), log: run.stderr.trim() });
  }
  const result = { observedAt: new Date().toISOString(),
    scope: 'Native Blood control diagnostic with primary/secondary permutations; not actual key delivery',
    sourceHash: createHash('sha256').update(body).digest('hex'), records };
  if (process.env.BLOOD_CONTROLS_PROOF) fs.writeFileSync(process.env.BLOOD_CONTROLS_PROOF,
    JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify(result, null, 2));
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
