#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = path.resolve(process.argv[2] || path.join(root, 'build/site'));
const wasm = fs.readFileSync(path.join(directory, 'openQ4-client_wasm32.wasm'));
const js = fs.readFileSync(path.join(directory, 'openQ4-client_wasm32.js'),'utf8');
const borderIntegrated = js.includes('q4Border:');
const pak = path.join(directory, 'baseoq4/pak0.pk4');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'q4-lighting-'));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function linkedShader(prefix) {
  const start = wasm.indexOf(prefix), end = wasm.indexOf(0, start);
  assert.ok(start >= 0 && end > start, 'actual linked shader constant must exist');
  return wasm.subarray(start, end).toString('utf8');
}
function reference(extension) {
  const result = spawnSync('unzip', ['-p', pak, `glprogs/material_interaction.${extension}`], {encoding:'utf8'});
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.startsWith('#version 110\n'));
  return result.stdout;
}
try {
  let actualVertex = linkedShader('#version 300 es\nprecision highp float;\nlayout(location=0) in vec3 a_position;');
  let actualFragment = linkedShader('#version 300 es\nprecision highp float;\nuniform sampler2D uBumpMap;');
  const borderShaderPrototype = process.env.Q4_BORDER_SHADER_TRANSFORM === '1';
  assert.ok(!(borderIntegrated && borderShaderPrototype), 'integrated artifacts must not receive a second test-only shader conversion');
  if (borderIntegrated) {
    const gl = {getParameter:() => 16, getShaderParameter:shader => shader.type,
      shaderSource(shader,source) { shader.source=source; }};
    const sandbox = {GLctx:gl};
    const start=js.indexOf('var GLImmediate = {'),end=js.indexOf('GLImmediate.matrixLib =',start);
    assert.ok(start>=0 && end>start);
    vm.runInNewContext(js.slice(start,end),sandbox);
    [actualVertex,actualFragment]=[actualVertex,actualFragment].map((source,index) => {
      const shader={type:index?0x8b30:0x8b31};
      sandbox.GLImmediate.q4Border.get(gl).shaderSource(shader,source);
      return shader.source;
    });
  }
  if (borderShaderPrototype) {
    const borderDirectory=path.join(process.env.IDTECH4_WORK_ROOT||path.join(root,'.work'),'openq4/tools/build');
    const {transformBorderShader} = await import(pathToFileURL(path.join(borderDirectory,'emscripten_border_shader.mjs')));
    const helper = fs.readFileSync(path.join(borderDirectory,'emscripten_border_sampler.glsl'),'utf8');
    actualVertex = transformBorderShader(actualVertex,'vertex',helper).source;
    actualFragment = transformBorderShader(actualFragment,'fragment',helper).source;
  }
  const originalVertex = reference('vs'), originalFragment = reference('fs');
  // Only GLSL dialect/interface changes to the shipped reference. Lighting
  // equations, branches, constants and texture lookups are not reconstructed.
  let referenceVertex = originalVertex.replace('#version 110', '#version 300 es\nprecision highp float;\nlayout(location=0) in vec3 a_position; layout(location=2) in vec4 a_color;\nuniform mat4 uModelViewMatrix; uniform mat4 uProjectionMatrix;');
  for (const [name, type, location] of [['attr_TexCoord0','vec2',8], ['attr_Tangent','vec3',9], ['attr_Bitangent','vec3',10], ['attr_Normal','vec3',11]]) {
    referenceVertex = referenceVertex.replace(`attribute ${type} ${name};`, `layout(location=${location}) in ${type} ${name};`);
  }
  referenceVertex = referenceVertex.replace(/\bvarying\b/g, 'out').replace('gl_Vertex', 'vec4(a_position,1.0)')
    .replace('gl_Color', 'a_color').replace('ftransform()', 'uProjectionMatrix*uModelViewMatrix*vec4(a_position,1.0)');
  const referenceFragment = originalFragment.replace('#version 110', '#version 300 es\nprecision highp float;\nout vec4 fragColor;')
    .replace(/\bvarying\b/g, 'in').replace(/\btexture2DProj\b/g, 'textureProj')
    .replace(/\btexture2D\b|\btextureCube\b/g, 'texture').replace(/\bgl_FragColor\b/g, 'fragColor');
  const files = [actualVertex, actualFragment, referenceVertex, referenceFragment].map((source, index) => {
    const filename = path.join(temporary, `${index}.glsl`);
    fs.writeFileSync(filename, source); return filename;
  });
  const binary = path.join(temporary, 'lighting');
  const compiled = spawnSync(process.env.CC || 'cc', ['-std=c11','-Wall','-Wextra','-Werror',
    path.join(root, 'tests/glsl-es-lighting.c'), '-o', binary, '-lEGL','-lGLESv2'], {encoding:'utf8'});
  assert.equal(compiled.status, 0, compiled.stdout + compiled.stderr);
  const rendered = spawnSync(binary, files, {encoding:'utf8', env:{...process.env,EGL_PLATFORM:'surfaceless'}});
  assert.equal(rendered.status, 0, rendered.stdout + rendered.stderr);
  const result = {scope:'Actual linked browser vertex/fragment shaders versus the shipped material shader with syntax-only GLSL ES conversion; real GPU pixel comparisons, not campaign acceptance.',
    wasmSHA256:hash(wasm), jsSHA256:hash(js), borderShaderPrototype, borderIntegrated,
    referenceVertexSHA256:hash(originalVertex), referenceFragmentSHA256:hash(originalFragment),
    ...JSON.parse(rendered.stdout)};
  const mismatches = result.cases.filter(row => row.maximumChannelDifference > 1);
  result.mismatches = mismatches.length;
  if (process.env.Q4_LIGHTING_PROOF) fs.writeFileSync(process.env.Q4_LIGHTING_PROOF, JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({driver:result.driver, cases:result.cases.length, mismatches:result.mismatches,
    examples:mismatches.slice(0,8)},null,2));
  assert.equal(result.cases.length,128);
  assert.ok(result.cases.some(row=>row.referencePeak > 32), 'reference must render visible lighting');
  assert.equal(mismatches.length,0,'browser lighting must preserve the shipped shader equations');
} finally {
  fs.rmSync(temporary,{recursive:true,force:true});
}
