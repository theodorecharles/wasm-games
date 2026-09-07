#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const repository = path.resolve(__dirname, '..');
const source = path.join(process.env.DOSBOX_SOURCE_CHECKOUT || path.join(repository, '.work/source'), 'vendor/dosbox');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'dosbox-timing-'));
try {
  const implementation = fs.readFileSync(process.env.DOSBOX_TIMING_SOURCE || path.join(source, 'src/dosbox.cpp'), 'utf8');
  const governor = implementation.match(/^void increaseticks\(\) \{[^]*?^}/m);
  assert.ok(governor, 'missing production governor');
  fs.writeFileSync(path.join(temporary, 'governor-production.h'), governor[0]);
  const output = path.join(temporary, 'timing-probe');
  execFileSync(process.env.HOST_CXX || 'c++', [
    '-std=c++11', '-O2', '-D__EMSCRIPTEN__', '-I', path.join(source, 'include'), '-I', temporary,
    path.join(repository, 'scripts/fixtures/timing-probe.cpp'), '-o', output
  ], { stdio: 'inherit' });
  execFileSync(output, [], { stdio: 'inherit' });
  console.log('DOSBox production CPU governor: idle accounting, fractional time, browser timer delays and fixed cycles passed');
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
