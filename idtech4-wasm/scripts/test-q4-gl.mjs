#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const checkout = path.join(process.env.IDTECH4_WORK_ROOT || path.join(root, '.work'), 'openq4');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'q4-gl-'));
try {
  const output = path.join(temporary, 'gl.cjs');
  const capsSource = fs.readFileSync(path.join(checkout, 'src/renderer/RendererCaps.cpp'), 'utf8');
  const initSource = fs.readFileSync(path.join(checkout, 'src/renderer/RenderSystem_init.cpp'), 'utf8');
  const platformSource = fs.readFileSync(path.join(checkout, 'src/sys/emscripten/emscripten_sdl3.cpp'), 'utf8');
  const sdlSource = fs.readFileSync(path.join(checkout, 'src/sys/sdl3/sdl3_backend.cpp'), 'utf8');
  function extractFunction(source, name) {
    const match = source.match(new RegExp(`^(?:extern "C" EMSCRIPTEN_KEEPALIVE )?(?:static )?(?:void|bool) ${name}\\([^]*?^}`, 'm'));
    assert.ok(match, `missing production function ${name}`);
    return match[0];
  }
  // Compile production capability/startup functions, not a second implementation
  // of their policy. The fixture substitutes only the surrounding engine state.
  fs.writeFileSync(path.join(temporary, 'q4-gl-production.h'), [
    extractFunction(capsSource, 'GLCapabilityProbe_QueryInt'),
    extractFunction(capsSource, 'GLCapabilityProbe_Build'),
    extractFunction(initSource, 'R_CheckGLSLProgramExtensions'),
    extractFunction(initSource, 'R_HasGLSLProgramEntryPoints'),
    extractFunction(initSource, 'R_CanUseGLSLPrograms'),
    extractFunction(sdlSource, 'Sys_SDL_IsGameWindowFocused'),
    extractFunction(platformSource, 'Q4WASM_BrowserFocus'),
    extractFunction(sdlSource, 'SDL3_IsMouseCaptured'),
    extractFunction(platformSource, 'Q4WASM_BrowserCapture')
  ].join('\n'));
  const glewInclude = path.join(checkout, 'subprojects/glew/include');
  const glewObject = path.join(temporary, 'glew.o');
  const glewResult = spawnSync(process.env.EMCC || 'emcc', [
    '-O1', '-fPIC', '-DGLEW_NO_GLU', '-DOPENQ4_GLEW_SDL3_LOADER', '-I', glewInclude,
    '-c', path.join(checkout, 'subprojects/glew/src/glew.c'), '-o', glewObject
  ], { encoding: 'utf8' });
  assert.equal(glewResult.status, 0, glewResult.stdout + glewResult.stderr);
  const result = spawnSync(process.env.EMXX || 'em++', [
    '-std=c++17', '-O1', '-fPIC', '-sASSERTIONS=1', '-sENVIRONMENT=node', '-sMAIN_MODULE=1',
    '-sLEGACY_GL_EMULATION=1', '-sMIN_WEBGL_VERSION=2', '-sMAX_WEBGL_VERSION=2',
    '-sEXPORTED_FUNCTIONS=_Q4GLProbe,_Q4GLCapabilitiesProbe,_Q4GLCanUseProbe,_Q4GLIndexedProbe,_Q4GLFocusProbe,_Q4GLVertexCacheProbe,_Q4GLSplitBufferProbe,_Q4GLBorderProbe,_Q4GLNormalMatrixProbe',
    '-DGLEW_NO_GLU', '-I', glewInclude, '-I', temporary,
    '-I', path.join(checkout, 'src/renderer'), '-I', path.join(checkout, 'src/sys/emscripten'),
    path.join(checkout, 'src/sys/emscripten/webgl_compat.cpp'),
    '--post-js', path.join(checkout, 'tools/build/emscripten_gl_dynamic_link_fix.js'),
    '--js-transform', `node "${path.join(checkout, 'tools/build/emscripten_legacy_gl_transform.mjs')}"`,
    path.join(root, 'tests/q4-gl.cpp'), glewObject, '--no-entry', '-o', output
  ], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const limits = new Map([[0x8b4d, 16], [0x8872, 16], [0x8869, 16], [0x0D33, 4096], [0x8824, 4], [0x8CDF, 4]]);
  const drawBuffers = [];
  const indexedDraws = [], indexUploads = [];
  const attributes = new Map(), cacheDraws = [], splitDraws = [];
  let arrayBuffer = null, pointerCalls = 0, recordingCache = false, recordingSplit = false;
  let activeProgram = null, metadataUploads = 0, recordingBorder = false;
  const borderDraws = [], submittedShaders = [];
  const normalMatrices=[];
  const reflectedBorder = [
    {name:'q4ProbeTexture',type:0x8b5e,size:1},
    {name:'q4bsInfo_q4ProbeTexture',type:0x8b52,size:1},
    {name:'q4bsColor_q4ProbeTexture',type:0x8b52,size:1}
  ];
  function recordBorder() {
    if (recordingBorder) borderDraws.push({
      info:activeProgram.values.get('q4bsInfo_q4ProbeTexture'),
      color:activeProgram.values.get('q4bsColor_q4ProbeTexture'), metadataUploads});
  }
  const context = {
    FLOAT: 0x1406, MAX_TEXTURE_IMAGE_UNITS: 0x8872,
    MAX_VERTEX_ATTRIBS: 0x8869, VERTEX_SHADER: 0x8b31, FRAGMENT_SHADER: 0x8b30,
    ARRAY_BUFFER: 0x8892, ELEMENT_ARRAY_BUFFER: 0x8893,
    getSupportedExtensions: () => [], getExtension: () => null,
    getParameter: name => limits.get(name) ?? 0, createBuffer: () => ({}),
    bindBuffer(target, buffer) { if (target === 0x8892) arrayBuffer = buffer; }, bufferData() {},
    createShader: type => ({type}), shaderSource(shader, source) { shader.source = source; submittedShaders.push({type:shader.type, source}); }, compileShader() {}, deleteShader() {},
    getShaderParameter: (shader, name) => name === 0x8b4f ? shader.type : true,
    // This sink tests vertex/index bindings; shader compilation has a separate GPU fixture.
    getProgramParameter: (program, name) => name === 0x8b82 ? true : name === 0x8b86 && program.borderFixture ? 3 : 0,
    getActiveUniform: (_program, index) => reflectedBorder[index],
    createProgram: () => ({values:new Map(),locations:new Map()}),
    attachShader(program,shader) {
      if (shader.source.includes('q4ProbeTexture')) program.borderFixture=true;
      if (shader.source.includes('u_normalMatrix')) program.normalFixture=true;
    },
    bindAttribLocation() {}, linkProgram() {}, deleteProgram() {},
    getAttribLocation: (_program, name) => name === 'a_position' ? 0 : name === 'a_normal' ? 1 : name === 'a_color' ? 2 : name === 'a_texCoord0' ? 3 : -1,
    getUniformLocation(program, name) {
      if (program.normalFixture && name==='u_normalMatrix') return {program,name};
      if (!program.borderFixture || !reflectedBorder.some(uniform=>uniform.name===name)) return null;
      if (!program.locations.has(name)) program.locations.set(name,{program,name});
      return program.locations.get(name);
    },
    getUniform: (program, location) => program.values.get(location.name) ?? 0,
    useProgram(program) { activeProgram=program; },
    uniform1i(location,value) { if (location) location.program.values.set(location.name,value); },
    uniform1iv(location,values,offset=0) { if (location) location.program.values.set(location.name,values[offset]); },
    uniform4fv(location,values) { ++metadataUploads; location.program.values.set(location.name,Array.from(values)); },
    uniformMatrix4fv() {},
    uniformMatrix3fv(location,transpose,values) {
      if (!location?.program.normalFixture) return;
      assert.equal(transpose,false);normalMatrices.push(Array.from(values));
    },
    createTexture:()=>({}), deleteTexture() {}, activeTexture() {}, bindTexture() {},
    vertexAttrib4fv() {}, vertexAttrib4f() {}, enableVertexAttribArray() {}, disableVertexAttribArray() {},
    vertexAttribPointer(index, size, type, normalized, stride, offset) {
      ++pointerCalls;
      attributes.set(index, {buffer: arrayBuffer?.name || 0, size, type, normalized, stride, offset});
    },
    drawBuffers: values => drawBuffers.push(Array.from(values)),
    drawElements: (...values) => {
      recordBorder();
      indexedDraws.push(values);
      if (recordingCache) cacheDraws.push({label: module.cacheLabel, expected: {...module.cacheExpected},
        position: {...attributes.get(0)}, texture: {...attributes.get(3)}, pointerCalls});
      if (recordingSplit) splitDraws.push({label: module.splitLabel, expected: {...module.splitExpected},
        position: {...attributes.get(0)}, texture: {...attributes.get(3)}, currentBuffer: arrayBuffer?.name || 0});
    },
    drawArrays() {
      recordBorder();
      if (recordingSplit) splitDraws.push({label: module.splitLabel, expected: {...module.splitExpected},
        position: {...attributes.get(0)}, texture: {...attributes.get(3)}, currentBuffer: arrayBuffer?.name || 0});
    },
    bufferSubData(target, _offset, bytes, start = 0, length = bytes.length) {
      if (target === 0x8893) indexUploads.push(Array.from(bytes.subarray(start, start + length)));
    },
    getError: () => 0
  };
  const canvas = { getContext: () => context, addEventListener() {}, removeEventListener() {} };
  // Match the engine's non-modularized MAIN_MODULE startup and its post-JS
  // dynamic-link fix; MODULARIZE changes the order of post-JS vs instantiation.
  const module = { canvas, noInitialRun: true };
  await new Promise((resolve, reject) => {
    module.onRuntimeInitialized = resolve;
    module.onAbort = reject;
    vm.runInNewContext(fs.readFileSync(output, 'utf8'), {
      Module: module, require: createRequire(output), process, Buffer, console,
      __dirname: temporary, __filename: output, TextDecoder, TextEncoder,
      setTimeout, clearTimeout, performance
    }, { filename: output });
  });
  assert.equal(module._Q4GLProbe(), 1);
  assert.equal(module._Q4GLFocusProbe(), 1);
  assert.deepEqual(Array.from(module.collected.color), [0.25, 0.5, 0.75, 1]);
  assert.equal(module.collected.matrixCount, 18);
  assert.deepEqual(drawBuffers, [[0x405], [0], [0x8CE0], [0x405]]);
  assert.deepEqual(Array.from(module.collected.vertices), [0.25, 0.75, 0.5, 0.125, 10, 20, 0, 1,
    0.75, 0.25, 0.125, 0.5, 30, 40, 0, 1]);
  assert.equal(module.collected.texture0.size, 2);
  assert.equal(module.collected.texture1.size, 2);
  assert.equal(module.collected.texture0.pointer, 0);
  assert.equal(module.collected.texture1.pointer, 8);
  assert.equal(module.collected.position.pointer, 16);
  assert.equal(module._Q4GLIndexedProbe(), 1);
  assert.deepEqual(indexedDraws, [[4, 3, 0x1405, 0], [4, 3, 0x1405, 16],
    [4, 3, 0x1403, 0], [4, 3, 0x1401, 0]]);
  assert.deepEqual(indexUploads, [[0, 0, 1, 0, 112, 17, 1, 0, 3, 0, 0, 0],
    [2, 0, 1, 0, 0, 0], [0, 2, 1]]);
  assert.equal(module.drawRanges[0].first, 3);
  assert.equal(module.drawRanges[0].last, 70001);
  recordingCache = true;
  assert.equal(module._Q4GLVertexCacheProbe(), 1);
  recordingCache = false;
  for (const row of cacheDraws) {
    row.passed = row.position.buffer === row.expected.buffer && row.position.offset === row.expected.offset &&
      row.position.size === row.expected.size && row.position.type === row.expected.type &&
      row.position.stride === 32 && row.texture.offset === row.expected.textureOffset &&
      row.texture.buffer === row.expected.buffer;
    if (row.expected.buffer === 0) {
      // CPU streams use SDK-owned temporary VBOs, which do not have GL names.
      row.passed = row.passed && row.position.buffer === 0;
    }
    console.log(`vertex-cache ${row.label}: ${row.passed ? 'PASS' : 'FAIL'} ${JSON.stringify(row)}`);
  }
  const cacheProof = {scope: 'Native Wasm calls through the actual SDK renderer and production indexed-draw bridge; WebGL submission sink records attribute bindings, not GPU pixels.',
    transformSHA256: crypto.createHash('sha256').update(fs.readFileSync(path.join(checkout, 'tools/build/emscripten_legacy_gl_transform.mjs'))).digest('hex'),
    rows: cacheDraws, unchangedStateReusesPointers: cacheDraws[0].pointerCalls === cacheDraws[1].pointerCalls};
  if (process.env.Q4_GL_PROOF) fs.writeFileSync(process.env.Q4_GL_PROOF, JSON.stringify(cacheProof, null, 2) + '\n');
  assert.equal(cacheDraws.length, 10);
  assert.ok(cacheDraws.every(row => row.passed), 'legacy attribute changes must reach vertexAttribPointer even with unchanged renderer/matrices/stride');
  assert.ok(cacheProof.unchangedStateReusesPointers, 'unchanged-state fast path remains enabled');
  recordingSplit = true;
  assert.equal(module._Q4GLSplitBufferProbe(), 1);
  recordingSplit = false;
  for (const row of splitDraws) {
    row.passed = row.position.buffer === row.expected.positionBuffer &&
      row.texture.buffer === row.expected.textureBuffer &&
      row.position.stride === row.expected.positionStride &&
      row.texture.stride === row.expected.textureStride &&
      row.position.offset === 0 && row.texture.offset === 0 &&
      row.currentBuffer === row.expected.currentBuffer;
    console.log(`split-buffer ${row.label}: ${row.passed ? 'PASS' : 'FAIL'} ${JSON.stringify(row)}`);
  }
  const splitProof = {scope: 'Native Wasm array-pointer calls through the actual SDK renderer and production draw bridge; per-attribute VBO binding/stride semantics, not GPU pixels or proof of the campaign sky cause.',
    transformSHA256: cacheProof.transformSHA256, rows: splitDraws};
  if (process.env.Q4_GL_SPLIT_PROOF) fs.writeFileSync(process.env.Q4_GL_SPLIT_PROOF, JSON.stringify(splitProof, null, 2) + '\n');
  assert.equal(splitDraws.length, 7);
  assert.ok(splitDraws.every(row => row.passed), 'array pointers must retain their own VBO and stride independently of subsequent GL_ARRAY_BUFFER bindings');
  recordingBorder=true;
  assert.equal(module._Q4GLBorderProbe(),1);
  recordingBorder=false;
  assert.deepEqual(borderDraws.map(row=>[row.info,row.color]),[
    [[1,2,3,16],[0,0,0,1]], [[0,0,0,1],[0,0,0,0]], [[1,2,3,16],[0,0,0,1]],
    [[1,1,0,1],[0,0,0,0]], [[1,1,0,1],[0,0,0,0]], [[0,0,0,1],[0,0,0,0]]
  ]);
  assert.equal(borderDraws[3].metadataUploads,borderDraws[4].metadataUploads,'unchanged native indexed draw must reuse sampler uniforms');
  const borderFragment=submittedShaders.find(shader=>shader.type===0x8b30 && shader.source.includes('q4ProbeTexture'));
  assert.match(borderFragment.source,/q4bsSample\(q4ProbeTexture/,'native shader source must reach the production converter');
  const borderProof={scope:'Native GL calls through real GLEW/SDK program, shader, uniform, texture, DrawArrays and indexed bridge paths; final recording sink, not GPU pixels.',
    transformSHA256:cacheProof.transformSHA256, rows:borderDraws,
    fragmentSHA256:crypto.createHash('sha256').update(borderFragment.source).digest('hex')};
  if (process.env.Q4_GL_BORDER_PROOF) fs.writeFileSync(process.env.Q4_GL_BORDER_PROOF,JSON.stringify(borderProof,null,2)+'\n');
  console.log('border native API: six shader/uniform/binding/draw/lifetime cases passed');
  assert.equal(module._Q4GLNormalMatrixProbe(),1);
  assert.deepEqual(normalMatrices,[[0.5,0,0,0,0.25,0,0,0,0.125],[0.25,0,0,0,0.125,0,0,0,0.0625]]);
  const normalShader=submittedShaders.find(shader=>shader.type===0x8b31 && shader.source.includes('u_normalMatrix'));
  assert.doesNotMatch(normalShader.source,/a_normalMatrix/);
  const normalProof={scope:'Actual SDK legacy normal-matrix conversion and inverse-transpose uploads under nonuniform scaling, with fixed-function lighting disabled and no model-view uniform location; recording GL sink.',
    transformSHA256:cacheProof.transformSHA256,matrices:normalMatrices,vertexSHA256:crypto.createHash('sha256').update(normalShader.source).digest('hex')};
  if(process.env.Q4_GL_NORMAL_PROOF)fs.writeFileSync(process.env.Q4_GL_NORMAL_PROOF,JSON.stringify(normalProof,null,2)+'\n');
  console.log('normal matrix native API: both inverse-transpose updates passed');
  assert.equal(module._Q4GLCapabilitiesProbe(), 1);
  assert.equal(module._Q4GLCanUseProbe(), 1);
  limits.set(0x8872, 4);
  assert.equal(module._Q4GLCanUseProbe(), 0, 'reject insufficient texture inputs');
  limits.set(0x8872, 16);
  limits.set(0x8869, 11);
  assert.equal(module._Q4GLCanUseProbe(), 0, 'reject insufficient vertex inputs');
  limits.set(0x8869, 16);
  assert.equal(module._Q4GLCanUseProbe(), 1);
  console.log('Quake 4 GL compatibility: production worker context initialization, draw buffers, full-width CPU/GPU indices, actual SDK vertex-cache invalidation, real GLEW/SDK lookup, colour/matrices, two-unit vertex stream, ES capabilities and fail-closed GLSL gates passed');
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
