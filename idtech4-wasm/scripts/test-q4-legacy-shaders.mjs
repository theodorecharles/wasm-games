#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const checkout = path.join(process.env.IDTECH4_WORK_ROOT || path.join(root, '.work'), 'openq4');
const directory = path.resolve(process.argv[2] || path.join(checkout, 'build/web'));
const original = fs.readFileSync(path.join(directory, 'openQ4-client_wasm32.js'), 'utf8');
const { transformLegacyGL } = await import(pathToFileURL(path.join(checkout, 'tools/build/emscripten_legacy_gl_transform.mjs')));
const baseline = process.env.Q4_LEGACY_SHADER_BASELINE === '1';
const borderPrototype = process.env.Q4_BORDER_SHADER_TRANSFORM === '1';
const {transformBorderShader} = borderPrototype ? await import(pathToFileURL(path.join(checkout,'tools/build/emscripten_border_shader.mjs'))) : {};
const borderHelper = borderPrototype ? fs.readFileSync(path.join(checkout,'tools/build/emscripten_border_sampler.glsl'), 'utf8') : '';
const source = process.env.Q4_LEGACY_SHADER_TRANSFORM === '1' ? transformLegacyGL(original) : original;
const borderIntegrated = source.includes('q4Border:');
assert.ok(!(borderIntegrated && borderPrototype), 'integrated artifacts must not receive a second test-only shader conversion');
if (process.env.Q4_LEGACY_SHADER_TRANSFORM === '1') {
  assert.throws(() => transformLegacyGL(source), /expected one SDK seam/);
  assert.throws(() => transformLegacyGL(original.replace('var texLoadLines', 'var changedTexLoadLines')), /expected one SDK seam/);
  assert.throws(() => transformLegacyGL(original + original), /expected one SDK seam/);
}

// Execute the exact packaged SDK generator, not a handwritten shader surrogate.
// Only the GL submission sink is mocked to collect source. Compile/link is done
// below by a real EGL/GLES driver, without claiming browser drawing acceptance.
const start = source.indexOf('var GLImmediate = {');
const end = source.indexOf('GLImmediate.matrixLib =', start);
assert.ok(start >= 0 && end > start, 'expected packaged legacy GL generator');
const generator = source.slice(start, end);
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'q4-legacy-shaders-'));
const results = [];
try {
  const probe = path.join(temporary, 'glsl-es-link');
  const cc = spawnSync(process.env.CC || 'cc', ['-std=c11', '-Wall', '-Wextra', '-Werror',
    path.join(root, 'tests/glsl-es-link.c'), '-o', probe, '-lEGL', '-lGLESv2'], { encoding: 'utf8' });
  assert.equal(cc.status, 0, cc.stdout + cc.stderr);

  const cases = [];
  for (const matrix of [false, true]) {
    for (const target of ['2d', 'cube', 'cube-and-2d']) {
      for (const mode of ['modulate', 'combine-inverse', 'combine-interpolate', 'combine-two-units']) {
        cases.push({ matrix, target, mode });
      }
    }
  }
  for (const test of cases) {
    const label = `${test.target}-${test.mode}-matrix-${test.matrix}`;
    const shaders = [];
    const gl = {
      POINTS: 0, VERTEX_SHADER: 0x8b31, FRAGMENT_SHADER: 0x8b30,
      MAX_VERTEX_ATTRIBS: 0x8869, CURRENT_PROGRAM: 0x8b8d,
      createShader(type) { const shader = { type }; shaders.push(shader); return shader; },
      shaderSource(shader, text) { shader.source = borderPrototype
        ? transformBorderShader(text, shader.type === 0x8b31 ? 'vertex' : 'fragment', borderHelper).source : text; }, compileShader() {},
      createProgram: () => ({}), attachShader() {}, bindAttribLocation() {}, linkProgram() {},
      getShaderParameter: (shader, name) => name === 0x8b4f ? shader.type : true,
      getProgramParameter: (_program, name) => name === 0x8b82 ? true : 0,
      getParameter: name => [0x8869, 0x8b4d].includes(name) ? 16 : null,
      getAttribLocation: (_program, name) => name === 'a_position' ? 0 : name === 'a_color' ? 2 : -1,
      getUniformLocation: () => null, useProgram() {}, uniform1i() {}, vertexAttrib4fv() {}
    };
    const sandbox = {
      GL: { currProgram: 0 }, GLctx: gl,
      GLEmulation: { MAX_CLIP_PLANES: 0, MAX_LIGHTS: 0 },
      assert, abort(message) { throw new Error(message); }, err: console.error,
      warnOnce(message) { throw new Error(message); }, ptrToString: value => String(value)
    };
    vm.runInNewContext(generator, sandbox);
    const immediate = sandbox.GLImmediate;
    immediate.MAX_TEXTURES = 2;
    immediate.mode = 4;
    immediate.useTextureMatrix = test.matrix;
    immediate.TexEnvJIT = immediate.spawnTexEnvJIT();
    const jit = immediate.TexEnvJIT;
    jit.init(null, 2);
    const units = test.mode === 'combine-two-units' ? 2 : 1;
    for (let unit = 0; unit < units; ++unit) {
      jit.hook_activeTexture(0x84c0 + unit);
      if (test.target !== 'cube') jit.hook_enable(0x0de1);
      if (test.target !== '2d') jit.hook_enable(0x8513);
      immediate.enabledClientAttributes[immediate.TEXTURE0 + unit] = 1;
      if (test.mode.startsWith('combine')) {
        jit.hook_texEnvi(0x2300, 0x2200, 0x8570); // COMBINE
        jit.hook_texEnvi(0x2300, 0x8591, 0x0301); // inverse previous RGB
        if (test.mode === 'combine-interpolate') {
          jit.hook_texEnvi(0x2300, 0x8571, 0x8575);
          jit.hook_texEnvi(0x2300, 0x8572, 0x8575);
          jit.hook_texEnvi(0x2300, 0x8592, 0x0300); // RGB third operand differs from alpha
        }
      }
    }
    immediate.createRenderer();
    assert.equal(shaders.length, 2);
    const vertex = shaders.find(shader => shader.type === 0x8b31).source;
    const fragment = shaders.find(shader => shader.type === 0x8b30).source;
    const vertexFile = path.join(temporary, `${label}.vert`);
    const fragmentFile = path.join(temporary, `${label}.frag`);
    fs.writeFileSync(vertexFile, vertex);
    fs.writeFileSync(fragmentFile, fragment);
    const linked = spawnSync(probe, [vertexFile, fragmentFile], {
      encoding: 'utf8', env: { ...process.env, EGL_PLATFORM: 'surfaceless' }
    });
    const expectedFailure = baseline && (test.target !== '2d' || test.mode === 'combine-interpolate' || (test.matrix && test.mode !== 'modulate'));
    if (expectedFailure) {
      assert.equal(linked.status, 8, `${label}: expected shader compilation failure, got ${linked.stdout}${linked.stderr}`);
      assert.match(linked.stderr, /fragment shader compile failed/);
    } else {
      assert.equal(linked.status, 0, `${label}: ${linked.stdout}${linked.stderr}\n${fragment}`);
      assert.match(linked.stdout, /OpenGL ES 3/);
      const sampler = test.target === '2d' ? 'sampler2D' : 'samplerCube';
      assert.match(fragment, new RegExp(`uniform ${sampler} u_texUnit0;`));
      if (!baseline) {
        const coords = test.target === '2d' ? 'xy' : 'xyz';
        assert.ok(fragment.includes(test.matrix ? `(u_textureMatrix0 * v_texCoord0).${coords}` : `v_texCoord0.${coords}`));
      }
    }
    results.push({ label, linked: linked.status === 0, expectedFailure });
  }
  const proof = {
    scope: 'Exact generated engine shader source compiled/linked with real surfaceless EGL/GLES; no browser rendering acceptance',
    originalJsSha256: crypto.createHash('sha256').update(original).digest('hex'),
    transformedForTest: source !== original, borderShaderPrototype: borderPrototype, borderIntegrated, baseline, results
  };
  if (process.env.Q4_LEGACY_SHADER_PROOF) fs.writeFileSync(process.env.Q4_LEGACY_SHADER_PROOF, JSON.stringify(proof,null,2)+'\n');
  console.log(JSON.stringify(proof, null, 2));
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
