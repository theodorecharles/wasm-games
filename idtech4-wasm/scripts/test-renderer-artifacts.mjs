#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const work = process.env.IDTECH4_WORK_ROOT || path.join(repository, '.work');

const sourcePairs = [
  {
    label: 'Doom 3 / RoE',
    source: path.join(work, 'dhewm3/neo/renderer/draw_arb2.cpp'),
    vertex: 'd3wasmInteractionVertexShader',
    fragment: 'd3wasmInteractionFragmentShader'
  },
  {
    label: 'Prey',
    source: path.join(work, 'prey2006/neo/renderer/draw_arb2.cpp'),
    vertex: 'preywasmInteractionVertexShader',
    fragment: 'preywasmInteractionFragmentShader'
  },
  {
    label: 'Quake 4',
    source: path.join(work, 'openq4/src/renderer/draw_arb2.cpp'),
    vertex: 'q4wasmMaterialInteractionVertexShader',
    fragment: 'q4wasmMaterialInteractionFragmentShader'
  }
];

const wasmArtifacts = [
  ['Doom 3', path.join(work, 'dhewm3/build/web/dhewm3-base.wasm')],
  ['Resurrection of Evil', path.join(work, 'dhewm3/build/web/dhewm3-roe.wasm')],
  ['Quake 4 SP/MP', path.join(work, 'openq4/build/web/openQ4-client_wasm32.wasm')],
  ['Prey', path.join(work, 'prey2006/output/emscripten/prey06.wasm')]
];

function extractCString(source, symbol) {
  const escaped = symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const stringLiteral = `"(?:\\\\.|[^"\\\\])*"`;
  const declaration = source.match(new RegExp(
    `static\\s+const\\s+char\\s*\\*${escaped}\\s*=((?:\\s*${stringLiteral})+);`
  ));
  assert.ok(declaration, `missing shader source ${symbol}`);
  const literals = declaration[1].match(/"(?:\\.|[^"\\])*"/g) || [];
  assert.ok(literals.length > 0, `empty shader source ${symbol}`);
  return literals.map(literal => JSON.parse(literal)).join('');
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options });
  if (result.status !== 0) {
    process.stderr.write(result.stdout || '');
    process.stderr.write(result.stderr || '');
    throw new Error(`${command} exited with status ${result.status}`);
  }
  return result.stdout.trim();
}

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'idtech4-glsl-'));
try {
  const probe = path.join(temporary, 'glsl-es-link');
  run(process.env.CC || 'cc', [
    '-std=c11', '-Wall', '-Wextra', '-Werror',
    path.join(repository, 'tests/glsl-es-link.c'), '-o', probe,
    '-lEGL', '-lGLESv2'
  ]);

  for (const pair of sourcePairs) {
    const source = fs.readFileSync(pair.source, 'utf8');
    const vertex = extractCString(source, pair.vertex);
    const fragment = extractCString(source, pair.fragment);
    assert.ok(vertex.startsWith('#version 300 es\n'));
    assert.ok(fragment.startsWith('#version 300 es\n'));
    assert.match(vertex, /layout\(location=0\) in vec3 a_position;/,
      `${pair.label} must expose the position name used by Emscripten client-array emulation`);
    assert.match(vertex, /layout\(location=2\) in vec4 a_color;/,
      `${pair.label} must expose the color name used by Emscripten client-array emulation`);
    const vertexPath = path.join(temporary, `${pair.vertex}.vert`);
    const fragmentPath = path.join(temporary, `${pair.fragment}.frag`);
    fs.writeFileSync(vertexPath, vertex);
    fs.writeFileSync(fragmentPath, fragment);
    const result = run(probe, [vertexPath, fragmentPath], {
      env: { ...process.env, EGL_PLATFORM: 'surfaceless' }
    });
    assert.match(result, /OpenGL ES 3/);
    console.log(`${pair.label}: exact embedded GLSL ES shaders ${result}`);
  }

  const requiredImports = [
    /glCreateShader/, /glShaderSource/, /glCompileShader/,
    /glCreateProgram/, /glLinkProgram/, /glUseProgram/, /glUniformMatrix4fv/
  ];
  for (const [label, artifact] of wasmArtifacts) {
    const bytes = fs.readFileSync(artifact);
    const module = new WebAssembly.Module(bytes);
    const imports = WebAssembly.Module.imports(module).map(value => value.name);
    for (const requirement of requiredImports) {
      assert.ok(imports.some(name => requirement.test(name)), `${label} is missing real shader API import ${requirement}`);
    }
    const text = bytes.toString('latin1');
    assert.ok(text.split('#version 300 es').length >= 3, `${label} does not embed both GLSL ES stages`);
    assert.match(text, /WebGL2 GLSL ES interaction program failed readiness validation/,
      `${label} must fail closed when the real shader program cannot link`);
    console.log(`${label}: Wasm embeds both stages and imports real shader compile/link/use APIs`);
  }
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}

console.log('id Tech 4 WebGL2 renderer source and artifact contracts passed');
