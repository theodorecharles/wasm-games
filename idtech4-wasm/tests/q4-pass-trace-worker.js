// Test-only GL pass isolation. Mount as the isolated q4-worker.js, expose the
// error tracer as /q4-gl-trace-worker.js and production wrapper as
// /q4-worker-native.js. Controls use a visible, same-origin diagnostic panel.
// Each material draw restores exactly the GL state it found. Never stage this.
'use strict';
const q4PassGetContext=OffscreenCanvas.prototype.getContext;
OffscreenCanvas.prototype.getContext=function(...args) {
  const gl=q4PassGetContext.apply(this,args);
  if (!gl || args[0]!=='webgl2' || gl.q4PassTraceInstalled) return gl;
  gl.q4PassTraceInstalled=true;
  const names=['linkProgram','drawElements','drawArrays','clear','getParameter','getUniformLocation','getUniform',
    'getVertexAttrib','getVertexAttribOffset','getBufferSubData','getBufferParameter','bindBuffer',
    'enable','disable','depthFunc','getQuery','createQuery','beginQuery','endQuery','getQueryParameter','deleteQuery'];
  const native=Object.fromEntries(names.map(name=>[name,gl[name].bind(gl)]));
  const get=native.getParameter, programs=new WeakMap(), ids=new WeakMap(), history=[], pending=[];
  const channel=new BroadcastChannel('q4-pass-diagnostic');
  let nextId=0, firstMaterial=false, mode='normal', modeDraws=0, serial=0;
  const id=value=>value ? (ids.has(value)?ids.get(value):(ids.set(value,++nextId),nextId)) : 0;
  const report=value=>self.postMessage({type:'log',text:'[q4-pass-trace] '+JSON.stringify(value)});
  const simple=value=>ArrayBuffer.isView(value)?Array.from(value):value;
  function state() {
    const result=Object.fromEntries(['DEPTH_TEST','DEPTH_FUNC','DEPTH_RANGE','DEPTH_WRITEMASK','DEPTH_CLEAR_VALUE','DEPTH_BITS',
      'STENCIL_TEST','STENCIL_FUNC','STENCIL_REF','STENCIL_VALUE_MASK','STENCIL_CLEAR_VALUE','STENCIL_BITS',
      'CULL_FACE','CULL_FACE_MODE','FRONT_FACE','SCISSOR_TEST','SCISSOR_BOX','VIEWPORT','COLOR_WRITEMASK']
      .map(name=>[name,simple(get(gl[name]))]));
    result.readFbo=id(get(gl.READ_FRAMEBUFFER_BINDING));result.drawFbo=id(get(gl.DRAW_FRAMEBUFFER_BINDING));
    return result;
  }
  function firstVertex(method,drawArgs) {
    let index=drawArgs[1];
    if (method==='drawElements') {
      if (!get(gl.ELEMENT_ARRAY_BUFFER_BINDING)) return null;
      const Type=drawArgs[2]===gl.UNSIGNED_INT?Uint32Array:drawArgs[2]===gl.UNSIGNED_SHORT?Uint16Array:Uint8Array;
      const value=new Type(1);
      if (drawArgs[3]+value.byteLength>native.getBufferParameter(gl.ELEMENT_ARRAY_BUFFER,gl.BUFFER_SIZE)) return null;
      native.getBufferSubData(gl.ELEMENT_ARRAY_BUFFER,drawArgs[3],value);index=value[0];
    }
    const buffer=native.getVertexAttrib(0,gl.VERTEX_ATTRIB_ARRAY_BUFFER_BINDING);
    if (!buffer || native.getVertexAttrib(0,gl.VERTEX_ATTRIB_ARRAY_TYPE)!==gl.FLOAT) return {buffer:id(buffer)};
    const size=native.getVertexAttrib(0,gl.VERTEX_ATTRIB_ARRAY_SIZE), stride=native.getVertexAttrib(0,gl.VERTEX_ATTRIB_ARRAY_STRIDE)||size*4;
    const offset=native.getVertexAttribOffset(0,gl.VERTEX_ATTRIB_ARRAY_POINTER), previous=get(gl.ARRAY_BUFFER_BINDING);
    const value=new Float32Array(size), start=offset+index*stride;
    try {
      native.bindBuffer(gl.ARRAY_BUFFER,buffer);
      if(start+value.byteLength>native.getBufferParameter(gl.ARRAY_BUFFER,gl.BUFFER_SIZE)) return {buffer:id(buffer),outOfBounds:true};
      native.getBufferSubData(gl.ARRAY_BUFFER,start,value);
    } finally {native.bindBuffer(gl.ARRAY_BUFFER,previous);}
    return {buffer:id(buffer),index,stride,offset,position:Array.from(value)};
  }
  gl.linkProgram=function(program) {
    const result=native.linkProgram(program);
    if(gl.getProgramParameter(program,gl.LINK_STATUS)) {
      const material=native.getUniformLocation(program,'uBumpMap')!==null && native.getUniformLocation(program,'uVertexColorParams')!==null;
      const model=native.getUniformLocation(program,material?'uModelViewMatrix':'u_modelView');
      const projection=native.getUniformLocation(program,material?'uProjectionMatrix':'u_projection');
      programs.set(program,{kind:material?'material':model&&projection?'legacy':'other',model,projection});
    }
    return result;
  };
  function remember(value) {history.push(value);if(history.length>256)history.shift();}
  gl.clear=function(mask) {
    if (!firstMaterial && mask & gl.DEPTH_BUFFER_BIT) remember({kind:'clear',mask,state:state()});
    return native.clear(mask);
  };
  function drain() {
    for(let i=pending.length-1;i>=0;i--) {
      const item=pending[i];if(!native.getQueryParameter(item.query,gl.QUERY_RESULT_AVAILABLE))continue;
      report({kind:'occlusion',id:item.id,mode:item.mode,anySamplesPassed:native.getQueryParameter(item.query,gl.QUERY_RESULT)});
      native.deleteQuery(item.query);pending.splice(i,1);
    }
  }
  for(const method of ['drawElements','drawArrays']) gl[method]=function(...drawArgs) {
    const program=get(gl.CURRENT_PROGRAM), info=program&&programs.get(program);
    const material=info?.kind==='material';
    if(!firstMaterial && !material && get(gl.DEPTH_TEST)) {
      remember({kind:'draw',method,args:drawArgs,program:id(program),programKind:info?.kind,
        state:state(),vertex:firstVertex(method,drawArgs),
        model:info?.model?Array.from(native.getUniform(program,info.model)):null,
        projection:info?.projection?Array.from(native.getUniform(program,info.projection)):null});
    }
    if(!material) return native[method](...drawArgs);
    if(!firstMaterial) {firstMaterial=true;report({kind:'preceding-depth-history',history});}
    const sample=modeDraws++<32, currentId=++serial;
    if(mode==='normal' && !sample) return native[method](...drawArgs);
    const before=sample?state():Object.fromEntries(['DEPTH_FUNC','STENCIL_TEST','CULL_FACE','SCISSOR_TEST'].map(name=>[name,get(gl[name])]));
    if(mode==='depth'||mode==='all') native.depthFunc(gl.ALWAYS);
    if(mode==='stencil'||mode==='all') native.disable(gl.STENCIL_TEST);
    if(mode==='cull'||mode==='all') native.disable(gl.CULL_FACE);
    if(mode==='scissor'||mode==='all') native.disable(gl.SCISSOR_TEST);
    if(sample)report({kind:'material-draw',id:currentId,mode,method,args:drawArgs,before,vertex:firstVertex(method,drawArgs)});
    const query=sample && !native.getQuery(gl.ANY_SAMPLES_PASSED,gl.CURRENT_QUERY)?native.createQuery():null;
    if(query)native.beginQuery(gl.ANY_SAMPLES_PASSED,query);
    try {return native[method](...drawArgs);}
    finally {
      if(query){native.endQuery(gl.ANY_SAMPLES_PASSED);pending.push({id:currentId,mode,query});}
      if(mode==='depth'||mode==='all')native.depthFunc(before.DEPTH_FUNC);
      for(const [key,cap] of [['stencil','STENCIL_TEST'],['cull','CULL_FACE'],['scissor','SCISSOR_TEST']]) {
        if(mode===key||mode==='all')native[before[cap]?'enable':'disable'](gl[cap]);
      }
    }
  };
  channel.addEventListener('message',event=>{
    if(event.data?.type!=='set-mode'||!['normal','depth','stencil','cull','scissor','all'].includes(event.data.mode))return;
    mode=event.data.mode;modeDraws=0;report({kind:'mode',mode});channel.postMessage({type:'mode-confirmed',mode});
  });
  setInterval(drain,500);
  report({kind:'installed',mode});return gl;
};
importScripts('/q4-gl-trace-worker.js');
