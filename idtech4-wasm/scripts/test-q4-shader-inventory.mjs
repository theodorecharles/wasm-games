#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const directory=path.resolve(process.argv[2] || path.join(root,'build/site'));
const checkout=path.join(process.env.IDTECH4_WORK_ROOT || path.join(root,'.work'),'openq4');
const js=fs.readFileSync(path.join(directory,'openQ4-client_wasm32.js'),'utf8');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const sourceComponents=process.env.Q4_INVENTORY_SOURCE_COMPONENTS==='1';
const {repairLegacyNormalMatrix}=await import(pathToFileURL(path.join(checkout,'tools/build/emscripten_legacy_gl_transform.mjs')));
const sdkSource=sourceComponents ? repairLegacyNormalMatrix(js) : js;
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'q4-shader-inventory-'));
const run=(command,args,options={})=>spawnSync(command,args,{encoding:'utf8',maxBuffer:8*1024*1024,...options});
try {
  const gl={VERTEX_SHADER:0x8b31,FRAGMENT_SHADER:0x8b30,getParameter:()=>16,
    getShaderParameter:shader=>shader.type,shaderSource(shader,source){shader.source=source;}};
  const sandbox={GLctx:gl,GL:{shaders:[],shaderInfos:[],getSource:(_shader,_count,source)=>source},
    _glShaderSource:()=>{},_emscripten_glShaderSource:()=>{}};
  const start=js.indexOf('var GLImmediate = {'),end=js.indexOf('GLImmediate.matrixLib =',start);
  assert.ok(start>=0 && end>start);
  vm.runInNewContext(js.slice(start,end),sandbox);
  sandbox.GLImmediate.MAX_TEXTURES=8;
  if(sourceComponents){
    const {createBorderRuntime}=await import(pathToFileURL(path.join(checkout,'tools/build/emscripten_border_runtime.mjs')));
    const {transformBorderShader}=await import(pathToFileURL(path.join(checkout,'tools/build/emscripten_border_shader.mjs')));
    const runtime=createBorderRuntime(gl,transformBorderShader,fs.readFileSync(path.join(checkout,'tools/build/emscripten_border_sampler.glsl'),'utf8'));
    sandbox.GLImmediate.q4Border={get:()=>runtime};
  }
  // Run the actual SDK compatibility preprocessor before the border boundary.
  // Only source retrieval and final GL submission are replaced by recording sinks.
  const preStart=sdkSource.indexOf('function ensurePrecision(source) {');
  const preEnd=sdkSource.indexOf('var orig_glCompileShader =',preStart);
  assert.ok(preStart>=0 && preEnd>preStart);
  vm.runInNewContext(sdkSource.slice(preStart,preEnd),sandbox);
  function convert(source,type){
    const shader={type:type==='vertex'?0x8b31:0x8b30};
    sandbox.GL.shaders[1]=shader;sandbox.GL.shaderInfos[1]={type:shader.type,ftransform:false};
    sandbox._glShaderSource(1,1,source,0);return shader.source;
  }
  const binary=path.join(temporary,'link');
  const compiled=run(process.env.CC||'cc',['-std=c11','-Wall','-Wextra','-Werror',path.join(root,'tests/glsl-es-link.c'),'-o',binary,'-lEGL','-lGLESv2']);
  assert.equal(compiled.status,0,compiled.stdout+compiled.stderr);
  const pak=path.join(directory,'baseoq4/pak0.pk4');
  const listed=run('unzip',['-Z1',pak]);assert.equal(listed.status,0,listed.stderr);
  const paths=listed.stdout.split('\n').filter(file=>file.startsWith('glprogs/') && /\.(vs|fs)$/.test(file));
  assert.equal(paths.length,66,'shipped shader inventory changed; review new coverage');
  const sources=new Map(paths.map(file=>{const result=run('unzip',['-p',pak,file]);assert.equal(result.status,0,result.stderr);return[file,result.stdout];}));
  const results=[];
  for(const file of paths.filter(file=>file.endsWith('.vs'))){
    const vertex=sources.get(file),fragment=sources.get(file.replace(/\.vs$/,'.fs'));
    assert.ok(fragment,'missing paired fragment');
    const row={program:file.replace(/\.vs$/,''),vertexSHA256:hash(vertex),fragmentSHA256:hash(fragment)};
    try{
      const vs=convert(vertex,'vertex'),frag=convert(fragment,'fragment');
      row.convertedVertexSHA256=hash(vs);row.convertedFragmentSHA256=hash(frag);
      const vpath=path.join(temporary,'vertex.glsl'),fpath=path.join(temporary,'fragment.glsl');
      fs.writeFileSync(vpath,vs);fs.writeFileSync(fpath,frag);
      const linked=run(binary,[vpath,fpath],{env:{...process.env,EGL_PLATFORM:'surfaceless'},timeout:120000});
      row.linked=linked.status===0;
      if(!row.linked)row.error=[linked.error?.message,linked.signal,linked.stdout,linked.stderr].filter(Boolean).join('\n');
    }catch(error){row.linked=false;row.error=error.message;}
    results.push(row);
  }
  const proof={scope:'All 33 shipped GLSL pairs through the actual packaged SDK source preprocessing and border submission boundary, compiled/linked on real EGL/GLES. No campaign draw or performance acceptance.',
    jsSHA256:hash(js),pakSHA256:hash(fs.readFileSync(pak)),sourceComponents,results};
  if(process.env.Q4_SHADER_INVENTORY_PROOF)fs.writeFileSync(process.env.Q4_SHADER_INVENTORY_PROOF,JSON.stringify(proof,null,2)+'\n');
  const failures=results.filter(row=>!row.linked);
  console.log(JSON.stringify({cases:results.length,passed:results.length-failures.length,sourceComponents,failures},null,2));
  assert.equal(failures.length,0,'all shipped shader pairs must compile/link');
}finally{fs.rmSync(temporary,{recursive:true,force:true});}
