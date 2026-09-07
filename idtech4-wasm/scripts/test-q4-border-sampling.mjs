#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import {spawnSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const work = process.env.IDTECH4_WORK_ROOT || path.join(root, '.work');
const borderDirectory=path.join(work,'openq4/tools/build');
const {transformBorderShader}=await import(pathToFileURL(path.join(borderDirectory,'emscripten_border_shader.mjs')));
const source = fs.readFileSync(path.join(work, 'openq4/src/renderer/OpenGL/gl_Image.cpp'), 'utf8');
// Fail closed if the engine no longer requests the two border colors used by
// this reference matrix. These source seams are not a claim of engine replay.
assert.match(source, /case TR_CLAMP_TO_ZERO: \{\s+float color\[4\] = \{ 0\.0f, 0\.0f, 0\.0f, 1\.0f \}/);
assert.match(source, /case TR_CLAMP_TO_ZERO_ALPHA: \{\s+float color\[4\] = \{ 0\.0f, 0\.0f, 0\.0f, 0\.0f \}/);
const fixture = path.join(root, 'tests/gl-border-sampling.c');
const helper = path.join(borderDirectory,'emscripten_border_sampler.glsl');
const packageDirectory = path.resolve(process.env.Q4_BORDER_PACKAGE || path.join(work,'openq4/build/web'));
const packagedJs = fs.readFileSync(path.join(packageDirectory,'openQ4-client_wasm32.js'),'utf8');
const packagedShaderRouting = packagedJs.includes('q4Border:');
// The GLES pass exercises real texture-call conversion and active per-sampler
// metadata, not direct calls to the sampler helper. UV locations match the
// independent desktop fixture; sample dispatch remains ordinary GLSL builtins.
const samplingFragment = `#version 300 es
precision highp float;
uniform sampler2D image;
uniform vec2 levelSize;
uniform float lod;
uniform int gradientMode;
uniform vec4 gradients;
out vec4 color;
float axis(int i, float size) {
    if (i == 0) return -1.0;
    if (i == 1) return -0.5 / size;
    if (i == 2) return 0.0;
    if (i == 3) return 0.25 / size;
    if (i == 4) return 0.5 / size;
    if (i == 5) return 0.5;
    if (i == 6) return 1.0 - 0.25 / size;
    if (i == 7) return 1.0;
    if (i == 8) return 1.0 + 0.25 / size;
    if (i == 9) return 1.0 + 0.5 / size;
    return 2.0;
}
vec4 sampleIndirect(sampler2D map, vec2 uv) { return texture(map, uv); }
vec4 forwardSample(sampler2D map, vec2 uv) { return sampleIndirect(map, uv); }
void main() {
    vec2 uv = vec2(axis(int(gl_FragCoord.x),levelSize.x),axis(int(gl_FragCoord.y),levelSize.y));
    if (gradientMode == 3) color = textureProj(image,vec4(uv,0.0,0.75+gl_FragCoord.x*0.04));
    else if (gradientMode == 2) color = forwardSample(image,uv);
    else if (gradientMode == 1) color = textureGrad(image,uv,gradients.xy,gradients.zw);
    else color = textureLod(image,uv,lod);
}
`;
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'q4-border-sampling-'));
try {
  const binary = path.join(temporary, 'sampling');
  const compile = spawnSync(process.env.CC || 'cc', ['-std=c11', '-Wall', '-Wextra', '-Werror',
    fixture, '-o', binary, '-lEGL', '-lGL', '-lm'], {encoding:'utf8', timeout:60000});
  assert.equal(compile.status, 0, compile.stdout + compile.stderr);
  const anisotropy = Number(process.env.Q4_BORDER_ANISOTROPY || '1');
  assert.ok(Number.isInteger(anisotropy) && anisotropy >= 1 && anisotropy <= 16);
  const transformed = transformBorderShader(samplingFragment,'fragment',fs.readFileSync(helper,'utf8'));
  assert.equal(transformed.wrappedCalls,4);
  if (packagedShaderRouting) {
    const gl={getParameter:()=>16,getShaderParameter:shader=>shader.type,
      shaderSource(shader,source){shader.source=source;}};
    const sandbox={GLctx:gl};
    const start=packagedJs.indexOf('var GLImmediate = {'),end=packagedJs.indexOf('GLImmediate.matrixLib =',start);
    assert.ok(start>=0 && end>start);
    vm.runInNewContext(packagedJs.slice(start,end),sandbox);
    const shader={type:0x8b30};
    sandbox.GLImmediate.q4Border.get(gl).shaderSource(shader,samplingFragment);
    assert.equal(shader.source,transformed.source,'packaged shader route must match the current source components');
    transformed.source=shader.source;
  }
  const fragmentPath=path.join(temporary,'converted-fragment.glsl');
  fs.writeFileSync(fragmentPath,transformed.source);
  const run = spawnSync(binary, [helper, String(anisotropy), fragmentPath], {encoding:'utf8', timeout:60000,
    env:{...process.env, EGL_PLATFORM:'surfaceless'}, maxBuffer:8 * 1024 * 1024});
  assert.equal(run.status, 0, run.stdout + run.stderr);
  const result = {
    scope:'Desktop GL border filtering and a documented multi-tap anisotropic kernel versus the renderer sampler components, repeated in GLES 3. Packaged shader conversion is checked when integrated; fixture UVs/metadata are synthetic. Not campaign or Chrome acceptance.',
    packagedShaderRouting,
    packagedJsSHA256:crypto.createHash('sha256').update(packagedJs).digest('hex'),
    reference:'https://registry.khronos.org/OpenGL/specs/gl/glspec46.core.pdf',
    anisotropicReference:'https://registry.khronos.org/OpenGL/extensions/EXT/EXT_texture_filter_anisotropic.txt',
    fixtureSHA256:crypto.createHash('sha256').update(fs.readFileSync(fixture)).digest('hex'),
    prototypeSHA256:crypto.createHash('sha256').update(fs.readFileSync(helper)).digest('hex'),
    transformSHA256:crypto.createHash('sha256').update(fs.readFileSync(path.join(borderDirectory,'emscripten_border_shader.mjs'))).digest('hex'),
    convertedFragmentSHA256:crypto.createHash('sha256').update(transformed.source).digest('hex'),
    glesPath:'transformed texture/textureProj/textureLod/textureGrad calls with active per-sampler metadata; implicit sampling forwards metadata through two sampler-parameter helper functions',
    imageSourceSHA256:crypto.createHash('sha256').update(source).digest('hex'),
    samplingModes:{0:'explicit LOD',1:'explicit textureGrad footprint',2:'implicit derivatives',3:'projected implicit derivatives'},
    gradientFootprintsTexels:[[1,0,0,1],[2,0,0,2],[2,2,-2,2],[1,4,-4,1],[8,0,0,0.5],[0,0,0,0]],
    esCaseMapping:'caseIndex indexes cases filtered to method anisotropic-sampling-prototype, retaining their order',
    limits:['RGBA8 sampling only; actual engine sampler/image/API coverage is in separate fixtures; campaign image-quality/performance checks remain open',
      'anisotropic kernels are implementation dependent; same-footprint native border taps are the correctness oracle, with vendor hardware differences retained',
      'repeat models a newly allocated texture after rejected wrap requests; it does not replay a Chrome context'],
    ...JSON.parse(run.stdout)
  };
  assert.equal(result.cases.length, 640);
  result.summary = {};
  for (const method of ['rejected-wrap-default-repeat', 'edge-substitution', 'hard-outside-cutoff']) {
    const rows = result.cases.filter(row => row.method === method);
    const differences = rows.filter(row => row.differentChannels > 0);
    result.summary[method] = {cases:rows.length, mismatches:differences.length,
      maximumChannelDifference:Math.max(...rows.map(row => row.maximumChannelDifference))};
    assert.equal(rows.length, 128);
    assert.ok(differences.length > 0, `${method} must not pass as a faithful border implementation`);
    assert.ok(differences.some(row => row.filter === 'trilinear' && row.lod > 0), 'mip coverage must catch invalid substitutes');
  }
  const prototype = result.cases.filter(row => row.method === 'isotropic-sampling-prototype');
  result.summary['isotropic-sampling-prototype'] = {cases:prototype.length,
    mismatches:prototype.filter(row => row.differentChannels > 0).length,
    maximumChannelDifference:Math.max(...prototype.map(row => row.maximumChannelDifference))};
  assert.equal(prototype.length, 128);
  assert.deepEqual([...new Set(prototype.map(row => row.gradientMode))].sort(), [0,1,2,3]);
  assert.deepEqual([...new Set(prototype.map(row => row.size.join('x')))].sort(), ['16x4','1x8','7x5','8x8']);
  assert.deepEqual([...new Set(prototype.map(row => row.borderAlpha))].sort(), [0,1]);
  assert.equal(result.esCases.length, 128);
  assert.deepEqual(result.esCases.map(row => row.caseIndex), Array.from({length:128}, (_,i) => i));
  assert.match(result.esVersion, /OpenGL ES 3/);
  // Keep native-vendor disagreement visible. The anisotropic acceptance oracle
  // is native CLAMP_TO_BORDER at the documented kernel's same sample positions;
  // the extension explicitly does not prescribe a universal vendor kernel.
  const anisotropic = result.cases.filter(row => row.method === 'anisotropic-sampling-prototype');
  assert.equal(anisotropic.length, 128);
  for (const [label, rows] of [['anisotropic-sampling-prototype', anisotropic], ['gles-anisotropic-sampling-prototype', result.esCases]]) {
    result.summary[label] = {cases:rows.length,
      nativeKernelMismatches:rows.filter(row => row.kernelDifferentChannels > 0).length,
      nativeKernelMaximumChannelDifference:Math.max(...rows.map(row => row.kernelMaximumChannelDifference)),
      vendorMismatches:rows.filter(row => row.differentChannels > 0).length,
      vendorMaximumChannelDifference:Math.max(...rows.map(row => row.maximumChannelDifference))};
  }
  assert.ok(result.cases.some(row => row.referenceCenter.some(value => value > 64)), 'reference must contain visible texels');
  if (process.env.Q4_BORDER_PROOF) fs.writeFileSync(process.env.Q4_BORDER_PROOF, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({driver:result.driver, anisotropy:result.anisotropy, samplesPerCase:result.samplesPerCase, ...result.summary}, null, 2));
  if (anisotropy === 1) assert.equal(result.summary['isotropic-sampling-prototype'].mismatches, 0);
  else assert.ok(prototype.some(row => row.kernelDifferentChannels > 0), 'isotropic-only control must fail anisotropic footprints');
  assert.equal(result.summary['anisotropic-sampling-prototype'].nativeKernelMismatches, 0, 'same-footprint native border filtering must be preserved');
  assert.equal(result.summary['gles-anisotropic-sampling-prototype'].nativeKernelMismatches, 0, 'GLES must preserve same-footprint desktop border pixels');
} finally {
  fs.rmSync(temporary, {recursive:true, force:true});
}
