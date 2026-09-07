#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const borderDirectory=path.join(process.env.IDTECH4_WORK_ROOT||path.join(root,'.work'),'openq4/tools/build');
const {transformBorderShader}=await import(pathToFileURL(path.join(borderDirectory,'emscripten_border_shader.mjs')));
const directory = path.resolve(process.argv[2] || path.join(root, 'build/site'));
const helper = fs.readFileSync(path.join(borderDirectory,'emscripten_border_sampler.glsl'), 'utf8');
const wasm = fs.readFileSync(path.join(directory, 'openQ4-client_wasm32.wasm'));
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
function linkedShader(prefix) {
  const start = wasm.indexOf(prefix), end = wasm.indexOf(0, start);
  assert.ok(start >= 0 && end > start, 'actual linked shader must exist');
  return wasm.subarray(start, end).toString('utf8');
}
const materialVertex = linkedShader('#version 300 es\nprecision highp float;\nlayout(location=0) in vec3 a_position;');
const materialFragment = linkedShader('#version 300 es\nprecision highp float;\nuniform sampler2D uBumpMap;');
const vertex = 'attribute vec4 a_position; varying vec2 uv; void main() { gl_Position=a_position; uv=a_position.xy; }';
const cases = [
  {name:'linked-material-program', vertex:materialVertex, fragment:materialFragment, samplers:5, calls:5},
  {name:'legacy-matrix-and-cube', vertex,
    fragment:'precision mediump float; varying vec2 uv; uniform mat4 matrix; uniform sampler2D image; uniform samplerCube sky; void main(){gl_FragColor=texture2D(image,(matrix*vec4(uv,0.,1.)).xy)+textureCube(sky,vec3(uv,1.));}', samplers:1, calls:1},
  {name:'nested-two-textures', vertex,
    fragment:'precision highp float; varying vec2 uv; uniform sampler2D first, second; void main(){gl_FragColor=texture2D(first,texture2D(second,uv).xy);}', samplers:2, calls:2},
  {name:'constant-index-sampler-array', vertex,
    fragment:'#define COUNT 2\nprecision highp float; varying vec2 uv; uniform sampler2D image[COUNT]; void main(){gl_FragColor=texture2D(image[1],uv);}', samplers:1, calls:1},
  {name:'continued-array-size-macro', vertex,
    fragment:'#define COUNT (1 + \\\n1)\nprecision highp float; varying vec2 uv; uniform sampler2D image[COUNT]; void main(){gl_FragColor=texture2D(image[1],uv);}', samplers:1, calls:1},
  {name:'projected-three-and-four-coordinates', vertex,
    fragment:'precision highp float; varying vec2 uv; uniform sampler2D image; void main(){gl_FragColor=texture2DProj(image,vec3(uv,2.))+texture2DProj(image,vec4(uv,0.,2.));}', samplers:1, calls:2},
  {name:'explicit-lod-and-gradient', vertex,
    fragment:'#extension GL_EXT_shader_texture_lod : require\nprecision highp float; varying vec2 uv; uniform sampler2D image; void main(){gl_FragColor=texture2DLodEXT(image,uv,1.)+texture2DGradEXT(image,uv,vec2(.1,0.),vec2(0.,.1));}', samplers:1, calls:2},
  {name:'comments-are-not-sampler-calls', vertex,
    fragment:'precision highp float; varying vec2 uv; uniform sampler2D image; /* texture2D(unknown,uv); */ void main(){gl_FragColor=texture2D(image,uv);} // texture(unknown,uv)\n', samplers:1, calls:1},
  {name:'sampler-helper-forwarding', vertex,
    fragment:'precision highp float; varying vec2 uv; uniform sampler2D image, other; vec4 lookup(sampler2D image, vec2 p){return texture2D(image,p);} vec4 forward(sampler2D map, vec2 p){return lookup(map,p);} void main(){gl_FragColor=lookup(image,uv)+forward(other,uv);}',samplers:2,calls:1},
  {name:'cube-sampler-helper', vertex,
    fragment:'precision highp float; varying vec2 uv; uniform samplerCube sky; vec4 lookup(samplerCube map,vec3 p){return textureCube(map,p);} void main(){gl_FragColor=lookup(sky,vec3(uv,1.));}',samplers:0,calls:0},
  {name:'three-legacy-fragment-targets', vertex,
    fragment:'precision highp float; varying vec2 uv; uniform sampler2D image; void main(){vec4 c=texture2D(image,uv);gl_FragData[0]=c;gl_FragData[1]=c*2.;gl_FragData[2]=c*3.;}',samplers:1,calls:1},
  {name:'desktop-130-interface',vertex:'#version 130\nin vec4 a_position;out vec2 uv;void main(){gl_Position=a_position;uv=a_position.xy;}',
    fragment:'#version 130\nin vec2 uv;out vec4 color;uniform sampler2D image;void main(){color=texture(image,uv);}',samplers:1,calls:1},
];
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'q4-border-shaders-'));
try {
  const binary = path.join(temporary, 'link');
  const compile = spawnSync(process.env.CC || 'cc', ['-std=c11','-Wall','-Wextra','-Werror',
    path.join(root,'tests/glsl-es-link.c'),'-o',binary,'-lEGL','-lGLESv2'], {encoding:'utf8'});
  assert.equal(compile.status,0,compile.stdout+compile.stderr);
  const results = [];
  for (const test of cases) {
    const vs = transformBorderShader(test.vertex,'vertex',helper);
    const fsResult = transformBorderShader(test.fragment,'fragment',helper);
    assert.equal(fsResult.samplers.length,test.samplers,test.name);
    assert.equal(fsResult.wrappedCalls,test.calls,test.name);
    assert.throws(()=>transformBorderShader(fsResult.source,'fragment',helper),/already transformed|reserved/);
    const vpath=path.join(temporary,'vertex.glsl'), fpath=path.join(temporary,'fragment.glsl');
    fs.writeFileSync(vpath,vs.source); fs.writeFileSync(fpath,fsResult.source);
    const linked=spawnSync(binary,[vpath,fpath],{encoding:'utf8',env:{...process.env,EGL_PLATFORM:'surfaceless'}});
    assert.equal(linked.status,0,test.name+'\n'+linked.stdout+linked.stderr);
    results.push({name:test.name,samplers:test.samplers,calls:test.calls,linked:true,
      vertexSHA256:hash(vs.source),fragmentSHA256:hash(fsResult.source)});
  }
  const rejects = [
    ['macro texture call','#define LOOKUP(p) texture2D(image,p)\nuniform sampler2D image;',/preprocessor/],
    ['continued macro texture call','#define LOOKUP(p) \\\ntexture2D(image,p)\nuniform sampler2D image;',/preprocessor/],
    ['bias overload','uniform sampler2D image; void main(){vec4 v=texture2D(image,vec2(0),2.);}',/signature/],
    ['unresolved sampler','void main(){vec4 v=texture2D(parameter,vec2(0));}',/unresolved/],
    ['dynamic legacy MRT','uniform int target;void main(){gl_FragData[target]=vec4(1);}',/MRT/],
    ['unknown dialect','#version 450\nvoid main(){}',/dialect/]
  ];
  for (const [name,source,error] of rejects) assert.throws(()=>transformBorderShader(source,'fragment',helper),error,name);
  assert.throws(()=>transformBorderShader('uniform sampler2D image;void main(){}','vertex',helper),/vertex-stage/);
  const result={scope:'Border shader source-conversion component tests. Actual linked material shader plus targeted source cases compile/link on GLES; not draw-state or Chrome acceptance.',
    wasmSHA256:hash(wasm),helperSHA256:hash(helper),transformSHA256:hash(fs.readFileSync(path.join(borderDirectory,'emscripten_border_shader.mjs'))),
    linkedCases:results,failClosedCases:rejects.map(([name])=>name).concat('vertex texture stage')};
  if(process.env.Q4_BORDER_SHADER_PROOF) fs.writeFileSync(process.env.Q4_BORDER_SHADER_PROOF,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result,null,2));
} finally {
  fs.rmSync(temporary,{recursive:true,force:true});
}
