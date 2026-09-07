#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = path.resolve(process.argv[2] || path.join(root, 'build/site'));
const js = fs.readFileSync(path.join(directory, 'openQ4-client_wasm32.js'), 'utf8');
const wasm = fs.readFileSync(path.join(directory, 'openQ4-client_wasm32.wasm'));
const expectedMismatch = process.env.Q4_POSITION_EXPECT_MISMATCH === '1';
const transformedForTest = process.env.Q4_POSITION_TRANSFORM === '1';
const borderShaderPrototype = process.env.Q4_BORDER_SHADER_TRANSFORM === '1';
const borderIntegrated = js.includes('q4Border:');
assert.ok(!(borderIntegrated && borderShaderPrototype), 'integrated artifacts must not receive a second test-only shader conversion');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'q4-position-'));

// Read the actual linked shader constants, not a second implementation of the
// material shader or the prepared source checkout.
function linkedShader(prefix) {
  const start = wasm.indexOf(prefix);
  assert.ok(start >= 0, 'actual Wasm shader constant must exist');
  const end = wasm.indexOf(0, start);
  assert.ok(end > start);
  return wasm.subarray(start, end).toString('utf8');
}
let materialVertex = linkedShader('#version 300 es\nprecision highp float;\nlayout(location=0) in vec3 a_position;');
const materialFragment = linkedShader('#version 300 es\nprecision highp float;\nuniform sampler2D uBumpMap;');
if (transformedForTest) {
  const previous = /gl_Position\s*=\s*uProjectionMatrix\*uModelViewMatrix\*(p|position);/;
  assert.ok(previous.test(materialVertex));
  materialVertex = materialVertex.replace(previous,
    'vec4 ecPosition=uModelViewMatrix*$1;gl_Position=uProjectionMatrix*ecPosition;');
}
try {
  const shaders = [];
  const gl = {
    POINTS:0, VERTEX_SHADER:0x8b31, FRAGMENT_SHADER:0x8b30,
    MAX_VERTEX_ATTRIBS:0x8869, CURRENT_PROGRAM:0x8b8d,
    createShader(type) { const shader = {type}; shaders.push(shader); return shader; },
    shaderSource(shader, source) { shader.source = source; }, compileShader() {},
    createProgram:() => ({}), attachShader() {}, bindAttribLocation() {}, linkProgram() {},
    getShaderParameter:(shader, name) => name === 0x8b4f ? shader.type : true,
    getProgramParameter:(_program, name) => name === 0x8b82 ? true : 0,
    getParameter:name => [0x8869, 0x8b4d].includes(name) ? 16 : null,
    getAttribLocation:(_program, name) => name === 'a_position' ? 0 : name === 'a_color' ? 2 : -1,
    getUniformLocation:() => null, useProgram() {}, uniform1i() {}, vertexAttrib4fv() {}
  };
  const sandbox = {
    GL:{currProgram:0}, GLctx:gl, GLEmulation:{MAX_CLIP_PLANES:0,MAX_LIGHTS:0},
    assert, abort(message) { throw Error(message); }, err:console.error,
    warnOnce(message) { throw Error(message); }, ptrToString:String
  };
  const start = js.indexOf('var GLImmediate = {'), end = js.indexOf('GLImmediate.matrixLib =', start);
  assert.ok(start >= 0 && end > start);
  vm.runInNewContext(js.slice(start, end), sandbox);
  const immediate = sandbox.GLImmediate;
  immediate.MAX_TEXTURES = 1; immediate.mode = 4;
  immediate.TexEnvJIT = immediate.spawnTexEnvJIT();
  immediate.TexEnvJIT.init(null, 1);
  immediate.createRenderer();
  assert.equal(shaders.length, 2);
  let sources = [shaders.find(s=>s.type===0x8b31).source, shaders.find(s=>s.type===0x8b30).source,
    materialVertex, materialFragment];
  if (borderIntegrated) {
    sources = sources.map((source,index) => {
      if (index < 2) return source; // The actual generator already submitted these.
      const shader = {type:index % 2 ? 0x8b30 : 0x8b31};
      immediate.q4Border.get(gl).shaderSource(shader,source);
      return shader.source;
    });
  }
  if (borderShaderPrototype) {
    const borderDirectory=path.join(process.env.IDTECH4_WORK_ROOT||path.join(root,'.work'),'openq4/tools/build');
    const {transformBorderShader} = await import(pathToFileURL(path.join(borderDirectory,'emscripten_border_shader.mjs')));
    const helper = fs.readFileSync(path.join(borderDirectory,'emscripten_border_sampler.glsl'),'utf8');
    sources = sources.map((source,index)=>transformBorderShader(source,index % 2 ? 'fragment' : 'vertex',helper).source);
  }
  if (process.env.Q4_POSITION_EXPORT) {
    fs.writeFileSync(process.env.Q4_POSITION_EXPORT, JSON.stringify({
      wasmSha256:crypto.createHash('sha256').update(wasm).digest('hex'),
      jsSha256:crypto.createHash('sha256').update(js).digest('hex'),
      depthVertex:sources[0],depthFragment:sources[1],materialVertex:sources[2],materialFragment:sources[3]
    },null,2));
  }
  const files = sources.map((source, index) => {
    const file = path.join(temporary, `${index}.glsl`);
    fs.writeFileSync(file, source); return file;
  });
  let capturedProof;
  if (process.env.Q4_POSITION_CAPTURE) {
    capturedProof = JSON.parse(fs.readFileSync(process.env.Q4_POSITION_CAPTURE, 'utf8'));
    const draws = capturedProof.interactionTrace.filter(item => item.kind === 'draw');
    assert.ok(draws.length > 0 && draws.length <= 128);
    const [,,width,height] = draws[0].state.VIEWPORT;
    const capture = Buffer.alloc(12 + draws.length * 176);
    capture.writeUInt32LE(draws.length,0); capture.writeUInt32LE(width,4); capture.writeUInt32LE(height,8);
    let offset = 12;
    for (const draw of draws) {
      const xyz = draw.geometry.attributes.find(item => item.index === 0).values.flat();
      assert.equal(xyz.length,9);
      const values = [...draw.uniforms.uModelViewMatrix, ...draw.uniforms.uProjectionMatrix,
        ...xyz, ...draw.state.DEPTH_RANGE];
      assert.equal(values.length,43); assert.ok(values.every(Number.isFinite));
      capture.writeUInt32LE(draw.id,offset); offset += 4;
      for (const value of values) { capture.writeFloatLE(value,offset); offset += 4; }
    }
    const captureFile = path.join(temporary,'capture.bin');
    fs.writeFileSync(captureFile,capture); files.push(captureFile);
  }
  const binary = path.join(temporary, 'depth-equality');
  const compiled = spawnSync(process.env.CC || 'cc', ['-std=c11','-Wall','-Wextra','-Werror',
    path.join(root, 'tests/glsl-es-depth-equality.c'),'-o',binary,'-lEGL','-lGLESv2'], {encoding:'utf8'});
  assert.equal(compiled.status, 0, compiled.stdout + compiled.stderr);
  const rendered = spawnSync(binary, files, {encoding:'utf8',env:{...process.env,EGL_PLATFORM:'surfaceless'}});
  assert.equal(rendered.status, 0, rendered.stdout + rendered.stderr);
  const result = JSON.parse(rendered.stdout);
  const proof = {scope:capturedProof
    ? 'Actual packaged legacy and linked material shaders in a real EGL/GLES depth buffer; synthetic controls plus captured campaign geometry, not full campaign acceptance'
    : 'Actual packaged legacy and linked material shaders rendered through a real EGL/GLES depth buffer; synthetic world coordinates, not Chrome acceptance',
    wasmSha256:crypto.createHash('sha256').update(wasm).digest('hex'),
    jsSha256:crypto.createHash('sha256').update(js).digest('hex'),expectedMismatch,transformedForTest,borderShaderPrototype,borderIntegrated,
    capturedGeometrySource:process.env.Q4_POSITION_CAPTURE || null,
    captureScope:capturedProof ? 'First actual triangle/matrices/depth range per sampled draw; neutral test lighting, no campaign occluders/stencil/scissor/cull' : null,
    ...result};
  if (process.env.Q4_POSITION_PROOF) fs.writeFileSync(process.env.Q4_POSITION_PROOF,JSON.stringify(proof,null,2)+'\n');
  console.log(JSON.stringify(proof,null,2));
  assert.equal(result.depthBits, 24);
  assert.ok(result.cases.every(test => test.available > 500), 'every case must independently draw visible lit geometry');
  assert.ok(result.cases.every(test => test.negativeControl === 0), 'perturbed depth must reject every sample');
  if (capturedProof) {
    assert.ok(result.capturedCases.some(test => test.available > 0), 'captured geometry must produce independently visible samples');
    assert.ok(result.capturedCases.every(test => test.negativeControl === 0), 'captured perturbed depth must reject samples');
  }
  const mismatches = [...result.cases, ...result.capturedCases].filter(test => test.accepted !== test.available);
  if (expectedMismatch) assert.ok(mismatches.length > 0, 'requested EQUAL-depth mismatch was not reproduced');
  else assert.equal(mismatches.length, 0, JSON.stringify(mismatches));
} finally {
  fs.rmSync(temporary, {recursive:true,force:true});
}
