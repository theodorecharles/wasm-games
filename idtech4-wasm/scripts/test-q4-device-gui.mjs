#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const checkout = path.join(process.env.IDTECH4_WORK_ROOT || path.join(root, '.work'), 'openq4');
const site = path.resolve(process.argv[2] || path.join(root, 'build/site'));
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'q4-device-gui-'));
try {
  const output = path.join(temporary, 'probe.wasm');
  const compile = spawnSync(process.env.EMXX || 'em++', [
    '-std=c++20', '-O1', '-fPIC', '-fexceptions', '-fno-strict-aliasing', '-sSIDE_MODULE=1',
    '-D__DOOM_DLL__', '-DUSE_OPENAL', '-DGLEW_NO_GLU', '-DID_GL_HARDLINK', '-DUSE_SDL3=1',
    '-sUSE_SDL=3', '-sUSE_WEBGL2=1',
    '-I', path.join(checkout, 'src'),
    '-I', process.env.Q4WASM_WEB_BUILD_DIR || path.join(checkout, 'build/web-meson-6.0.6'),
    '-I', path.join(checkout, '.tmp/gamelibs_stage/src/game'),
    '-I', path.join(checkout, 'subprojects/glew/include'),
    '-I', path.join(checkout, 'subprojects/openal-soft-prebuilt/include'),
    path.join(root, 'tests/q4-device-gui.cpp'), '-o', output
  ], { encoding: 'utf8' });
  assert.equal(compile.status, 0, compile.stdout + compile.stderr);
  const test = spawnSync(process.execPath, [path.join(root, 'scripts/test-q4-device-artifact.mjs'), site], {
    encoding: 'utf8', env: { ...process.env, Q4_DEVICE_GUI_PROBE: output }
  });
  process.stdout.write(test.stdout);
  process.stderr.write(test.stderr);
  assert.equal(test.status, 0, 'actual native device/GUI and requested exception/input probes must pass');
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
