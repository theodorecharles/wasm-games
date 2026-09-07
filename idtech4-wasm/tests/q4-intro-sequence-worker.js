// Test-only v2: trace the remainder of a frame after the first unique decal.
// No rendering state is substituted. Temporary query bindings are restored.
'use strict';
const introPost = self.postMessage.bind(self);
let introNext = null, introRemaining = 0, introSequence = 0;
self.postMessage = function(message, ...rest) {
  if (message?.type === 'log' && message.text?.startsWith('[q4-intro-decal] material=')) {
    introNext = message.text;
    introRemaining = 200;
  }
  return introPost(message, ...rest);
};
const introGetContext = OffscreenCanvas.prototype.getContext;
OffscreenCanvas.prototype.getContext = function(...args) {
  const gl = introGetContext.apply(this,args);
  if (!gl || args[0] !== 'webgl2' || gl.introDrawTrace) return gl;
  gl.introDrawTrace = true;
  const get = gl.getParameter.bind(gl), bind = gl.bindBuffer.bind(gl);
  const read = gl.getBufferSubData.bind(gl), size = gl.getBufferParameter.bind(gl);
  const attr = gl.getVertexAttrib.bind(gl), pointer = gl.getVertexAttribOffset.bind(gl);
  const getError = gl.getError.bind(gl), pending = new Set();
  gl.getError = () => { if (!pending.size) return getError(); const e=pending.values().next().value; pending.delete(e); return e; };
  const programs = new WeakMap(); let programCount = 0;
  const clear = gl.clear.bind(gl);
  gl.clear = function(...args) {
    if (introRemaining && (args[0] & gl.COLOR_BUFFER_BIT)) {
      introPost({type:'log',text:'[q4-intro-sequence-end] color clear after '+introSequence+' draws'});
      introRemaining=0; introNext=null;
    }
    return clear(...args);
  };
  const plain = x => ArrayBuffer.isView(x) ? Array.from(x) : x;
  function errors() { const list=[]; for (let i=0;i<16;i++) {const e=getError();if(!e)break;list.push(e);pending.add(e);}return list; }
  function pixels() {
    const v=get(gl.VIEWPORT), out=[];
    for (const [x,y] of [[.1,.1],[.5,.5],[.9,.1],[.1,.9],[.9,.9]]) {
      const px=Math.floor(v[0]+x*v[2]),py=Math.floor(v[1]+y*v[3]),rgba=new Uint8Array(4);
      gl.readPixels(px,py,1,1,gl.RGBA,gl.UNSIGNED_BYTE,rgba);
      out.push({x:px,y:py,rgba:Array.from(rgba)});
    }
    return out;
  }
  for (const method of ['drawElements','drawArrays']) {
    const draw=gl[method].bind(gl);
    gl[method]=function(...args) {
      if (!introRemaining) return draw(...args);
      const label=introNext; introNext=null; introRemaining--; introSequence++;
      const result={sequence:introSequence,label,method,args,preexistingErrors:errors(),state:{},attributes:[],uniforms:{}};
      for (const name of ['BLEND','BLEND_SRC_RGB','BLEND_DST_RGB','BLEND_SRC_ALPHA','BLEND_DST_ALPHA','BLEND_EQUATION_RGB','POLYGON_OFFSET_FILL','POLYGON_OFFSET_FACTOR','POLYGON_OFFSET_UNITS','DEPTH_TEST','DEPTH_FUNC','DEPTH_WRITEMASK','DEPTH_RANGE','COLOR_WRITEMASK','CULL_FACE','CULL_FACE_MODE','FRONT_FACE','SCISSOR_TEST','SCISSOR_BOX','VIEWPORT']) result.state[name]=plain(get(gl[name]));
      result.state.defaultDrawFramebuffer=get(gl.DRAW_FRAMEBUFFER_BINDING)===null;
      result.state.defaultReadFramebuffer=get(gl.READ_FRAMEBUFFER_BINDING)===null;
      const program=get(gl.CURRENT_PROGRAM);
      if (!programs.has(program)) {
        programs.set(program,++programCount);
        result.shaders=gl.getAttachedShaders(program).map(shader=>({type:gl.getShaderParameter(shader,gl.SHADER_TYPE),source:gl.getShaderSource(shader)}));
      }
      result.program=programs.get(program);
      for (let i=0;i<gl.getProgramParameter(program,gl.ACTIVE_UNIFORMS);i++) {
        const u=gl.getActiveUniform(program,i);result.uniforms[u.name]=plain(gl.getUniform(program,gl.getUniformLocation(program,u.name)));
      }
      let indices;
      if(method==='drawArrays') indices=[args[1],args[1]+1,args[1]+2];
      else {
        const Index=args[2]===gl.UNSIGNED_INT?Uint32Array:args[2]===gl.UNSIGNED_SHORT?Uint16Array:Uint8Array;
        const data=new Index(Math.min(3,args[1]));
        if(args[3]+data.byteLength<=size(gl.ELEMENT_ARRAY_BUFFER,gl.BUFFER_SIZE)) read(gl.ELEMENT_ARRAY_BUFFER,args[3],data);
        indices=Array.from(data);
      }
      result.indices=indices;
      const previous=get(gl.ARRAY_BUFFER_BINDING);
      try {
        for(let i=0;i<gl.getProgramParameter(program,gl.ACTIVE_ATTRIBUTES);i++) {
          const info=gl.getActiveAttrib(program,i),location=gl.getAttribLocation(program,info.name);
          const a={name:info.name,location,enabled:attr(location,gl.VERTEX_ATTRIB_ARRAY_ENABLED),type:attr(location,gl.VERTEX_ATTRIB_ARRAY_TYPE),size:attr(location,gl.VERTEX_ATTRIB_ARRAY_SIZE),stride:attr(location,gl.VERTEX_ATTRIB_ARRAY_STRIDE),offset:pointer(location,gl.VERTEX_ATTRIB_ARRAY_POINTER),values:[]};
          const buffer=attr(location,gl.VERTEX_ATTRIB_ARRAY_BUFFER_BINDING);
          if(a.enabled&&buffer&&a.type===gl.FLOAT) {
            bind(gl.ARRAY_BUFFER,buffer);const bytes=size(gl.ARRAY_BUFFER,gl.BUFFER_SIZE);a.bufferBytes=bytes;
            for(const index of indices) {const data=new Float32Array(a.size),offset=a.offset+index*(a.stride||a.size*4);if(offset+data.byteLength<=bytes){read(gl.ARRAY_BUFFER,offset,data);a.values.push(Array.from(data));}}
          } else a.current=plain(attr(location,gl.CURRENT_VERTEX_ATTRIB));
          result.attributes.push(a);
        }
      } finally {bind(gl.ARRAY_BUFFER,previous);}
      result.before=pixels();result.queryErrors=errors();
      const value=draw(...args);
      result.drawErrors=errors();result.after=pixels();result.afterQueryErrors=errors();
      introPost({type:'log',text:'[q4-intro-sequence] '+JSON.stringify(result)});
      return value;
    };
  }
  return gl;
};
importScripts('/q4-worker-native.js');
