#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let library;
vm.runInNewContext(fs.readFileSync(path.join(root, 'web/polymost-glsl.js'), 'utf8'), {addToLibrary: value => library = value});
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'polymost-glsl-'));
try {
  const run = (command, args) => spawnSync(command, args, {encoding:'utf8', timeout:60000});
  const executable = path.join(temporary, 'compiler');
  const build = run('c++', ['-std=c++17', '-O2', path.join(root, 'tests/polymost-glsl.cpp'), '-lEGL', '-lGLESv2', '-o', executable]);
  assert.equal(build.status, 0, build.stdout + build.stderr);
  const vertex = fs.readFileSync(path.join(root, '.work/source/source/build/src/polymost1Vert.glsl'), 'utf8');
  const fragment = fs.readFileSync(path.join(root, '.work/source/source/build/src/polymost1Frag.glsl'), 'utf8');
  for (const extended of [false, true]) {
    const frag = extended ? fragment : fragment.replace(' #define POLYMOST1_EXTENDED', '//define POLYMOST1_EXTENDED');
    for (const negative of [false, true]) {
      const vertFile = path.join(temporary, 'shader.vert'), fragFile = path.join(temporary, 'shader.frag');
      fs.writeFileSync(vertFile, negative ? vertex : library.$BuildPolymostGLSL(vertex, true));
      fs.writeFileSync(fragFile, negative ? frag : library.$BuildPolymostGLSL(frag, false));
      const result = run(executable, [vertFile, fragFile]);
      assert.equal(result.status, negative ? 1 : 0, result.stdout + result.stderr);
      console.log(JSON.stringify({extended, negative, output:result.stdout.trim(), log:result.stderr.trim()}));
    }
  }
} finally { fs.rmSync(temporary, {recursive:true, force:true}); }
