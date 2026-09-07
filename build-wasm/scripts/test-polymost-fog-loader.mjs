#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, '.work/source/source/glad/src/glad.c'), 'utf8');
const guard = /#ifdef __EMSCRIPTEN__\n\tglad_glFogf = browser_glFogf;[\s\S]*?\n#endif/;
assert.match(source, guard);
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'polymost-fog-'));
try {
  for (const negative of [false, true]) {
    const file = path.join(temporary, 'glad.cpp'), output = path.join(temporary, 'fog.cjs');
    fs.writeFileSync(file, negative ? source.replace(guard, '') : source);
    const build = spawnSync(process.env.EMXX || path.resolve(root, '../idtech4-wasm/.work/host-tools/emxx-6'),
      ['-O1', '-std=c++17', '-I', path.join(root, '.work/source/source/glad/include'),
        file, path.join(root, 'tests/polymost-fog-loader.cpp'),
        '-sLEGACY_GL_EMULATION=1', '-sMIN_WEBGL_VERSION=2', '-sMAX_WEBGL_VERSION=2',
        '-sENVIRONMENT=node', '-sEXIT_RUNTIME=1', '-sASSERTIONS=1', '-sSAFE_HEAP=1',
        '-fsanitize=undefined', '-fno-sanitize-recover=all', '-o', output],
      {encoding:'utf8', timeout:120000});
    assert.equal(build.status, 0, build.stdout + build.stderr);
    const result = spawnSync(process.execPath, [output], {encoding:'utf8', timeout:30000});
    assert.equal(result.status, negative ? 1 : 0, result.stdout + result.stderr);
    console.log(JSON.stringify({negative, output:JSON.parse(result.stdout.trim()), log:result.stderr.trim()}));
  }
} finally { fs.rmSync(temporary, {recursive:true, force:true}); }
