#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {repairImmediateBuffer} from '../tests/q4-immediate-buffer-transform.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const file=process.argv[2]||path.join(root,'.work/openq4/build/web/openQ4-client_wasm32.js');
const original=fs.readFileSync(file,'utf8');
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
function run(source) {
  const attributes=new Map(),draws=[];
  const temp={data:new Float32Array(16384)},appA={data:new Float32Array(544).fill(123)},appB={data:new Float32Array(960).fill(456)};
  let arrayBuffer=null,elementBuffer=null,throwOnDraw=false;
  const gl={FLOAT:5126,ARRAY_BUFFER:34962,ELEMENT_ARRAY_BUFFER:34963,TRIANGLES:4,UNSIGNED_SHORT:5123,
    MAX_TEXTURE_IMAGE_UNITS:34930,MAX_COMBINED_TEXTURE_IMAGE_UNITS:35661,MAX_VERTEX_ATTRIBS:34921,VERTEX_SHADER:35633,FRAGMENT_SHADER:35632,
    currentArrayBufferBinding:0,currentElementArrayBufferBinding:0,
    getParameter:n=>[34930,34921,35661].includes(n)?8:0,
    getExtension:()=>null,
    bindBuffer(target,b){if(target===34962)arrayBuffer=b;else if(target===34963)elementBuffer=b;},
    createShader:type=>({type}),shaderSource(s,text){s.source=text;},compileShader(){},
    getShaderParameter:(s,n)=>n===0x8b4f?s.type:true,
    createProgram:()=>({}),attachShader(){},bindAttribLocation(){},linkProgram(){},
    getProgramParameter:(_p,n)=>n===35714?true:0,
    getAttribLocation:(_p,n)=>n==='a_position'?0:n==='a_color'?2:-1,
    getUniformLocation:()=>null,useProgram(){},uniform1i(){},uniformMatrix4fv(){},vertexAttrib4fv(){},
    enableVertexAttribArray(){},disableVertexAttribArray(){},
    vertexAttribPointer(index,size,type,normalized,stride,offset){attributes.set(index,{buffer:arrayBuffer,size,type,normalized,stride,offset});},
    drawElements(mode,count,type,offset){
      if(throwOnDraw)throw Error('test draw failure');
      const a=attributes.get(0),values=[];
      for(let i=0;i<4;i++)values.push(Array.from(a.buffer.data.subarray((a.offset+i*a.stride)/4,(a.offset+i*a.stride)/4+a.size)));
      draws.push({mode,count,type,offset,values,temp:a.buffer===temp,logicalBinding:gl.currentArrayBufferBinding,elementPreserved:elementBuffer===quad});
    },drawArrays(){throw Error('fixture expects the real GL_QUADS indexed conversion');}
  };
  const quad={},element={};
  const GL={currProgram:0,buffers:{1:appA,2:appB,3:element},MAX_TEMP_BUFFER_SIZE:65536,
    byteSizeByTypeRoot:5120,byteSizeByType:[1,1,2,2,4,4,4],currentContext:{tempQuadIndexBuffer:quad},
    getTempVertexBuffer:()=>temp,generateTempBuffers(){}};
  const sandbox={GL,GLctx:gl,GLEmulation:{MAX_CLIP_PLANES:0,MAX_LIGHTS:0},Browser:{useWebGL:true},
    assert,err(){},warnOnce:s=>{throw Error(s);},abort:s=>{throw Error(s);},ptrToString:String,
    webglBufferSubData(target,offset,length,start,data){assert.equal(target,34962);arrayBuffer.data.set(data.subarray(start,start+length),offset/4);}};
  const start=source.indexOf('var GLImmediate = {'),end=source.indexOf('var GLImmediateSetup =',start);
  assert.ok(start>=0&&end>start);
  vm.createContext(sandbox);vm.runInContext(source.slice(start,end),sandbox);
  for(const name of ['Begin','End','Vertex2f']) {
    const match=source.match(new RegExp(`var _emscripten_gl${name} = [\\s\\S]*?\\n    \\};\\n  _emscripten_gl${name}\\.sig[^\\n]*`));
    assert.ok(match,name);vm.runInContext(match[0],sandbox);
  }
  const immediate=sandbox.GLImmediate;
  immediate.TexEnvJIT=immediate.spawnTexEnvJIT();
  immediate.MapTreeLib=immediate.spawnMapTreeLib();immediate.init();
  const expected=[[0,0,0,1],[0,1,0,1],[1,1,0,1],[1,0,0,1]],cases=[];
  for(const binding of [0,1,1,2,0,2]) {
    gl.currentArrayBufferBinding=binding;arrayBuffer=GL.buffers[binding]||null;
    gl.currentElementArrayBufferBinding=3;elementBuffer=element;
    immediate.enabledClientAttributes[0]=true;
    immediate.setClientAttribute(0,3,5126,64,0);
    const savedAttributes=immediate.clientAttributes,savedEnabled=immediate.enabledClientAttributes;
    sandbox._emscripten_glBegin(7);
    for(const p of expected)sandbox._emscripten_glVertex2f(p[0],p[1]);
    sandbox._emscripten_glEnd();
    const draw=draws.at(-1),restored=gl.currentArrayBufferBinding===binding&&arrayBuffer===(GL.buffers[binding]||null);
    const attributesRestored=immediate.clientAttributes===savedAttributes&&immediate.enabledClientAttributes===savedEnabled&&immediate.clientAttributes[0].bufferBinding===binding;
    const elementsRestored=gl.currentElementArrayBufferBinding===3&&elementBuffer===element;
    let returnedVBOPointers=true;
    if(binding) {
      immediate.prepareClientAttributes(4,false);immediate.getRenderer().prepare();
      const a=attributes.get(0);
      returnedVBOPointers=a.buffer===GL.buffers[binding]&&a.stride===64&&a.size===3&&a.offset===0&&arrayBuffer===GL.buffers[binding];
    }
    cases.push({binding,draw,restored,attributesRestored,elementsRestored,returnedVBOPointers,passed:draw.temp&&JSON.stringify(draw.values)===JSON.stringify(expected)&&restored&&attributesRestored&&elementsRestored&&returnedVBOPointers});
  }
  // A throwing submission may abort the engine, but must not leak the binding.
  gl.currentArrayBufferBinding=1;arrayBuffer=appA;throwOnDraw=true;
  sandbox._emscripten_glBegin(7);for(const p of expected)sandbox._emscripten_glVertex2f(p[0],p[1]);
  assert.throws(()=>sandbox._emscripten_glEnd(),/test draw failure/);
  const throwRestored=gl.currentArrayBufferBinding===1&&arrayBuffer===appA;
  return {cases,throwRestored};
}
const legacy=run(original),candidate=run(repairImmediateBuffer(original));
assert.deepEqual(legacy.cases.filter(c=>!c.draw.temp).map(c=>c.binding),[1,1,2,2],'the retained SDK must reproduce the bound-VBO failure');
assert.ok(candidate.cases.every(c=>c.passed),'every repaired CPU stream and application binding must be correct');
assert.equal(candidate.throwRestored,true);
const result={scope:'Actual linked SDK Begin/Vertex/End, layout, renderer and flush executed against a recording GPU-buffer sink; not browser pixels.',inputSHA256:hash(original),transformSHA256:hash(fs.readFileSync(path.join(root,'tests/q4-immediate-buffer-transform.mjs'))),legacy,candidate};
if(process.env.Q4_IMMEDIATE_PROOF)fs.writeFileSync(process.env.Q4_IMMEDIATE_PROOF,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log('Six actual SDK transitions: four old bound-VBO failures reproduced; all six candidate streams/bindings and thrown-draw binding restoration pass.');
