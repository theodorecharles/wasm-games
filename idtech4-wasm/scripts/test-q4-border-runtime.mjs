#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const borderDirectory=path.join(process.env.IDTECH4_WORK_ROOT||path.join(root,'.work'),'openq4/tools/build');
const {createBorderRuntime}=await import(pathToFileURL(path.join(borderDirectory,'emscripten_border_runtime.mjs')));
const {transformBorderShader}=await import(pathToFileURL(path.join(borderDirectory,'emscripten_border_shader.mjs')));
const helper=fs.readFileSync(path.join(borderDirectory,'emscripten_border_sampler.glsl'),'utf8');
const counts={query:0,upload:0,draw:0};
let current=null,activeUnit=0;
const bound=new Array(8).fill(null),targets=new WeakMap();
const gl={
  getParameter(name){++counts.query;assert.equal(name,0x8b4d);return 8;},
  getProgramParameter(program,name){++counts.query;return name===0x8b82 ? program.linked : program.uniforms.length;},
  getActiveUniform(program,index){++counts.query;return program.uniforms[index];},
  getShaderParameter(shader,name){assert.equal(name,0x8b4f);return shader.type;},
  shaderSource(shader,source){shader.source=source;},
  linkProgram(program){program.linked=!program.failLink;if(program.linked){program.values.clear();++program.generation;}},
  useProgram(program){if(!program||program.linked&&(!program.deleted||program===current))current=program;},
  deleteProgram(program){if(program)program.deleted=true;},
  getUniformLocation(program,name){
    ++counts.query;
    if(name.startsWith('q4bs')&&!program.converted)return null;
    return {program,name,generation:program.generation};
  },
  getUniform(program,location){++counts.query;assert.equal(program,location.program);return program.values.get(location.name)??0;},
  uniform1i(location,value){if(location&&location.program===current&&location.generation===current.generation)current.values.set(location.name,value);},
  uniform1iv(location,data,offset=0,length=data.length-offset){
    if(!location||location.program!==current||location.generation!==current.generation)return;
    const base=location.name.replace(/\[\d+\]$/,''),start=Number(location.name.match(/\[(\d+)\]$/)?.[1]||0);
    for(let i=0;i<length;++i)current.values.set(`${base}[${start+i}]`,data[offset+i]);
  },
  uniform4fv(location,value){assert.equal(location.program,current);assert.equal(location.generation,current.generation);current.values.set(location.name,Array.from(value));++counts.upload;},
  activeTexture(unit){if(unit>=0x84c0&&unit<0x84c8)activeUnit=unit-0x84c0;},
  bindTexture(target,texture){
    if(texture?.deleted)return;
    if(texture&&targets.has(texture)&&targets.get(texture)!==target)return;
    if(texture)targets.set(texture,target);
    if(target===0x0de1)bound[activeUnit]=texture||null;
  },
  deleteTexture(texture){if(texture)texture.deleted=true;for(let i=0;i<bound.length;++i)if(bound[i]===texture)bound[i]=null;},
  bindSampler(){},deleteSampler(){},
  drawElements(){++counts.draw;},drawArrays(){++counts.draw;},
  drawElementsInstanced(){++counts.draw;},drawArraysInstanced(){++counts.draw;}
};
const runtime=createBorderRuntime(gl,transformBorderShader,helper), results=[];
const program=(name,converted=true,arraySize=1)=>({name,converted,linked:false,deleted:false,generation:0,values:new Map(),
  uniforms:[{name:arraySize===1?'image':'image[0]',size:arraySize,type:0x8b5e}]});
const a=program('a'), b=program('b');
const textureA={name:1},textureB={name:2},textureC={name:3};
const opaque=[0,0,0,1],clear=[0,0,0,0];
function check(name,run){run();results.push({name,passed:true});}
const draw=()=>runtime.drawElements(4,3,0x1405,0);
check('first draw resolves metadata and preserves border alpha',()=>{
  runtime.linkProgram(a);runtime.useProgram(a);runtime.bindTexture(0x0de1,textureA);
  runtime.setTextureSampler(textureA,[1,2,3,8],opaque);draw();
  assert.deepEqual(a.values.get('q4bsInfo_image'),[1,2,3,8]);assert.deepEqual(a.values.get('q4bsColor_image'),opaque);
});
check('unchanged draw has no extra GL queries or uploads',()=>{
  const before={...counts};draw();assert.equal(counts.query,before.query);assert.equal(counts.upload,before.upload);assert.equal(counts.draw,before.draw+1);
});
check('binding a different texture updates sampler parameters',()=>{
  runtime.setTextureSampler(textureB,[1,1,0,1],clear);runtime.bindTexture(0x0de1,textureB);draw();
  assert.deepEqual(a.values.get('q4bsInfo_image'),[1,1,0,1]);assert.deepEqual(a.values.get('q4bsColor_image'),clear);
});
check('equal metadata on another texture reuses uniforms',()=>{
  runtime.setTextureSampler(textureC,[1,1,0,1],clear);runtime.bindTexture(0x0de1,textureC);
  const before=counts.upload;draw();assert.equal(counts.upload,before);
});
check('bound texture changes refresh only changed uniforms',()=>{
  runtime.setTextureSampler(textureC,[1,0,0,1],clear);const before=counts.upload;draw();
  assert.equal(counts.upload,before+1);assert.deepEqual(a.values.get('q4bsInfo_image'),[1,0,0,1]);
});
check('unrelated texture unit does not upload or query uniforms',()=>{
  runtime.activeTexture(0x84c3);runtime.bindTexture(0x0de1,textureA);
  const before={...counts};draw();assert.equal(counts.upload,before.upload);assert.equal(counts.query,before.query);
});
check('sampler uniform reassignment changes the consumed unit',()=>{
  const loc=runtime.getUniformLocation(a,'image');runtime.uniform1i(loc,3);draw();assert.deepEqual(a.values.get('q4bsInfo_image'),[1,2,3,8]);
});
check('metadata arrays are copied and cannot mutate cached uniforms',()=>{
  const info=[1,1,0,1],color=[0,0,0,1];runtime.setTextureSampler(textureA,info,color);info[0]=0;color[3]=0;draw();
  assert.deepEqual(a.values.get('q4bsInfo_image'),[1,1,0,1]);assert.deepEqual(a.values.get('q4bsColor_image'),opaque);
});
check('unbind clears previously enabled border handling',()=>{
  runtime.bindTexture(0x0de1,null);draw();assert.equal(a.values.get('q4bsInfo_image')[0],0);
});
check('texture deletion clears every tracked unit',()=>{
  runtime.bindTexture(0x0de1,textureA);runtime.activeTexture(0x84c0);runtime.bindTexture(0x0de1,textureA);
  runtime.deleteTexture(textureA);draw();assert.equal(a.values.get('q4bsInfo_image')[0],0);
  runtime.uniform1i(runtime.getUniformLocation(a,'image'),0);draw();assert.equal(a.values.get('q4bsInfo_image')[0],0);
});
check('reused numeric texture name does not inherit old metadata',()=>{
  runtime.bindTexture(0x0de1,{name:1});draw();assert.equal(a.values.get('q4bsInfo_image')[0],0);
});
check('deleted texture object cannot replace a valid binding',()=>{
  runtime.bindTexture(0x0de1,textureC);runtime.bindTexture(0x0de1,textureA);draw();
  assert.deepEqual(a.values.get('q4bsInfo_image'),[1,0,0,1]);
  assert.throws(()=>runtime.setTextureSampler(textureA,[1,2,3,8],opaque),/invalid texture/);
  runtime.bindTexture(0x0de1,null);draw();
});
check('switching programs preserves each program cache',()=>{
  runtime.linkProgram(b);runtime.useProgram(b);draw();runtime.useProgram(a);
  const before={...counts};draw();assert.equal(counts.query,before.query);assert.equal(counts.upload,before.upload);
});
check('successful relink resets locations, units and uploads',()=>{
  runtime.bindTexture(0x0de1,textureC);runtime.linkProgram(a);const before=counts.upload;draw();
  assert.equal(counts.upload,before+2);assert.deepEqual(a.values.get('q4bsInfo_image'),[1,0,0,1]);
});
check('uniform arrays use the SDK ranged uniform1iv inputs',()=>{
  const p=program('array',true,2);runtime.linkProgram(p);runtime.useProgram(p);
  runtime.activeTexture(0x84c1);runtime.bindTexture(0x0de1,textureB);runtime.activeTexture(0x84c2);runtime.bindTexture(0x0de1,textureC);
  runtime.uniform1iv(runtime.getUniformLocation(p,'image[0]'),new Int32Array([99,1,2,99]),1,2);draw();
  assert.deepEqual(p.values.get('q4bsInfo_image[0]'),[1,1,0,1]);assert.deepEqual(p.values.get('q4bsInfo_image[1]'),[1,0,0,1]);
});
check('cube bindings do not replace the 2D binding',()=>{
  runtime.useProgram(a);runtime.activeTexture(0x84c0);runtime.bindTexture(0x8513,{name:11});draw();assert.deepEqual(a.values.get('q4bsInfo_image'),[1,0,0,1]);
});
check('invalid active-unit and target rebinding leave tracked state intact',()=>{
  const cube={name:12};runtime.bindTexture(0x8513,cube);runtime.activeTexture(0x84ff);runtime.bindTexture(0x0de1,cube);draw();
  assert.deepEqual(a.values.get('q4bsInfo_image'),[1,0,0,1]);
});
check('unconverted sampler with a border texture fails closed',()=>{
  const p=program('unconverted',false);runtime.linkProgram(p);runtime.useProgram(p);const before=counts.draw;
  assert.throws(draw,/no converted sampler/);assert.equal(counts.draw,before);
  runtime.bindTexture(0x0de1,null);draw();
});
check('sampler-object overrides do not silently ignore border state',()=>{
  runtime.useProgram(a);runtime.bindTexture(0x0de1,textureB);runtime.bindSampler(0,{});
  assert.throws(draw,/sampler-object/);runtime.bindSampler(0,null);draw();
});
check('deleting a sampler object removes its override',()=>{
  const sampler={};runtime.bindSampler(0,sampler);assert.throws(draw,/sampler-object/);
  runtime.deleteSampler(sampler);draw();runtime.bindSampler(0,sampler);draw();
});
check('failed link stops metadata drawing without submitting a draw',()=>{
  const p=program('failed');runtime.linkProgram(p);runtime.useProgram(p);p.failLink=true;runtime.linkProgram(p);
  const before=counts.draw;assert.throws(draw,/unlinked/);assert.equal(counts.draw,before);runtime.useProgram(a);
});
check('deleted current program retains its executable until unbound',()=>{
  runtime.deleteProgram(a);draw();runtime.useProgram(b);draw();runtime.useProgram(a);draw();assert.equal(current,b);
});
check('instanced and non-indexed draws prepare the same state',()=>{
  const before=counts.draw;runtime.drawArrays(4,0,3);runtime.drawArraysInstanced(4,0,3,2);runtime.drawElementsInstanced(4,3,0x1405,0,2);assert.equal(counts.draw,before+3);
});
check('shader conversion is wired without mutating the context method',()=>{
  const shader={type:0x8b30},original=gl.shaderSource;
  runtime.shaderSource(shader,'precision highp float;uniform sampler2D image;void main(){gl_FragColor=texture2D(image,vec2(.5));}');
  assert.match(shader.source,/q4bsSample\(image/);assert.equal(gl.shaderSource,original);
});
check('invalid metadata is rejected before changing valid state',()=>{
  assert.throws(()=>runtime.setTextureSampler(textureB,[1,2,-1,8],opaque),/invalid texture/);
  assert.throws(()=>runtime.setTextureSampler(textureB,[1,2,3,17],opaque),/invalid texture/);
});
check('new-context reset drops old texture and program metadata',()=>{
  runtime.reset();gl.activeTexture(0x84c0);bound.fill(null);current=null;
  runtime.useProgram(b);runtime.bindTexture(0x0de1,textureB);draw();assert.equal(b.values.get('q4bsInfo_image')[0],0);
});
const proof={scope:'Renderer JavaScript texture/program state and forwarding component tests against a recording GL sink; no GPU or Chrome acceptance.',
  runtimeSHA256:crypto.createHash('sha256').update(fs.readFileSync(path.join(borderDirectory,'emscripten_border_runtime.mjs'))).digest('hex'),results};
if(process.env.Q4_BORDER_RUNTIME_PROOF)fs.writeFileSync(process.env.Q4_BORDER_RUNTIME_PROOF,JSON.stringify(proof,null,2)+'\n');
console.log(JSON.stringify({cases:results.length,passed:results.every(row=>row.passed),queries:counts.query,uploads:counts.upload,draws:counts.draw},null,2));
