#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const work = process.env.IDTECH4_WORK_ROOT || path.join(repository, '.work');
const preyWork = process.env.IDTECH4_PREY_WORKTREE || path.join(work, 'prey-d3wasm');

const webgl2SourcePairs = [
  {
    label: 'Quake 4',
    source: path.join(work, 'openq4/src/renderer/draw_arb2.cpp'),
    vertex: 'q4wasmMaterialInteractionVertexShader',
    fragment: 'q4wasmMaterialInteractionFragmentShader'
  }
];

const gles100SourcePairs = [
  {
    label: 'Doom 3 / RoE',
    vertexSource: path.join(work, 'd3wasm/neo/renderer/glsl/interactionShaderVP.cpp'),
    fragmentSource: path.join(work, 'd3wasm/neo/renderer/glsl/interactionShaderFP.cpp'),
    vertex: 'interactionShaderVP',
    fragment: 'interactionShaderFP'
  },
  {
    label: 'Prey',
    vertexSource: path.join(preyWork, 'neo/renderer/glsl/interactionShaderVP.cpp'),
    fragmentSource: path.join(preyWork, 'neo/renderer/glsl/interactionShaderFP.cpp'),
    vertex: 'interactionShaderVP',
    fragment: 'interactionShaderFP'
  }
];

const wasmArtifacts = [
  { label: 'Doom 3', path: path.join(work, 'd3wasm/build-wasm/d3wasm.wasm'), version: '100', readiness: /Loading main interaction shader/ },
  { label: 'Resurrection of Evil', path: path.join(work, 'd3wasm/build-wasm-roe/d3wasm.wasm'), version: '100', readiness: /Loading main interaction shader/ },
  { label: 'Quake 4 SP/MP', path: path.join(work, 'openq4/build/web/openQ4-client_wasm32.wasm'), version: '300 es', readiness: /WebGL2 GLSL ES interaction program failed readiness validation/ },
  { label: 'Prey', path: path.join(preyWork, 'output/emscripten/prey06.wasm'), version: '100', readiness: /Loading main interaction shader/ }
];

function extractCString(source, symbol) {
  const escaped = symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const stringLiteral = `"(?:\\\\.|[^"\\\\])*"`;
  const gap = `(?:\\s|//[^\\n]*(?:\\n|$)|/\\*[\\s\\S]*?\\*/)*`;
  const declaration = source.match(new RegExp(
    `static\\s+const\\s+char\\s*\\*${escaped}\\s*=${gap}((?:${stringLiteral}${gap})+);`
  ));
  assert.ok(declaration, `missing shader source ${symbol}`);
  const literals = declaration[1].match(/"(?:\\.|[^"\\])*"/g) || [];
  assert.ok(literals.length > 0, `empty shader source ${symbol}`);
  return literals.map(literal => JSON.parse(literal)).join('');
}

function extractRawCString(source, symbol) {
  const escaped = symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const declaration = source.match(new RegExp(
    `const\\s+char\\s*\\*\\s*const\\s+${escaped}\\s*=\\s*R"\\(([\\s\\S]*?)\\)"\\s*;`
  ));
  assert.ok(declaration, `missing raw shader source ${symbol}`);
  return declaration[1].replace(/^\n/, '');
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

  for (const pair of webgl2SourcePairs) {
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

  for (const pair of gles100SourcePairs) {
    const vertex = extractRawCString(fs.readFileSync(pair.vertexSource, 'utf8'), pair.vertex);
    const fragment = extractRawCString(fs.readFileSync(pair.fragmentSource, 'utf8'), pair.fragment);
    assert.ok(vertex.startsWith('#version 100\n'));
    assert.ok(fragment.startsWith('#version 100\n'));
    assert.match(vertex, /attribute highp vec4 attr_Vertex;/);
    assert.match(vertex, /attribute lowp vec4 attr_Color;/);
    const vertexPath = path.join(temporary, `${pair.label.replace(/[^a-z0-9]+/gi, '-')}.vert`);
    const fragmentPath = path.join(temporary, `${pair.label.replace(/[^a-z0-9]+/gi, '-')}.frag`);
    fs.writeFileSync(vertexPath, vertex);
    fs.writeFileSync(fragmentPath, fragment);
    const result = run(probe, [vertexPath, fragmentPath], {
      env: { ...process.env, EGL_PLATFORM: 'surfaceless' }
    });
    assert.match(result, /OpenGL ES 3/);
    console.log(`${pair.label}: exact d3wasm GLSL ES 1.00 shaders ${result}`);
  }

  const requiredImports = [
    /glCreateShader/, /glShaderSource/, /glCompileShader/,
    /glCreateProgram/, /glLinkProgram/, /glUseProgram/, /glUniformMatrix4fv/
  ];
  for (const artifact of wasmArtifacts) {
    const bytes = fs.readFileSync(artifact.path);
    const module = new WebAssembly.Module(bytes);
    const imports = WebAssembly.Module.imports(module).map(value => value.name);
    for (const requirement of requiredImports) {
      assert.ok(imports.some(name => requirement.test(name)), `${artifact.label} is missing real shader API import ${requirement}`);
    }
    const text = bytes.toString('latin1');
    assert.ok(text.split(`#version ${artifact.version}`).length >= 3,
      `${artifact.label} does not embed both GLSL ES stages`);
    assert.match(text, artifact.readiness,
      `${artifact.label} does not embed its renderer readiness marker`);
    console.log(`${artifact.label}: Wasm embeds both stages and imports real shader compile/link/use APIs`);
  }
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}

console.log('id Tech 4 WebGL renderer source and artifact contracts passed');
