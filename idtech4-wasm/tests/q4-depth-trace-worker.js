// Test-only companion to q4-interaction-trace-worker.js. Mount this as the
// isolated worker and expose both companion tracers under their own filenames.
// Capture the *actual* legacy depth program's matrices, not presumed copies of
// the material program's matrices. No production render state is substituted.
'use strict';
const q4DepthGetContext = OffscreenCanvas.prototype.getContext;
OffscreenCanvas.prototype.getContext = function (...args) {
  const gl = q4DepthGetContext.apply(this,args);
  if (!gl || args[0] !== 'webgl2' || gl.q4DepthTraceInstalled) return gl;
  gl.q4DepthTraceInstalled = true;
  const link = gl.linkProgram.bind(gl), draw = gl.drawElements.bind(gl);
  const get = gl.getParameter.bind(gl), getUniform = gl.getUniform.bind(gl);
  const bind = gl.bindBuffer.bind(gl), read = gl.getBufferSubData.bind(gl);
  const attribute = gl.getVertexAttrib.bind(gl), pointer = gl.getVertexAttribOffset.bind(gl);
  const bufferSize = gl.getBufferParameter.bind(gl);
  const programs = new WeakMap(), seen = new Set();
  gl.linkProgram = function(program) {
    const result = link(program);
    if (gl.getProgramParameter(program,gl.LINK_STATUS)) {
      const model = gl.getUniformLocation(program,'u_modelView'), projection = gl.getUniformLocation(program,'u_projection');
      if (model && projection) programs.set(program,{model,projection});
    }
    return result;
  };
  gl.drawElements = function(mode,count,type,offset) {
    const program = get(gl.CURRENT_PROGRAM), uniforms = program && programs.get(program);
    if (seen.size < 128 && uniforms && count >= 3 && get(gl.DEPTH_TEST) && get(gl.DEPTH_WRITEMASK)) {
      const vertexBuffer = attribute(0,gl.VERTEX_ATTRIB_ARRAY_BUFFER_BINDING);
      const elementBuffer = get(gl.ELEMENT_ARRAY_BUFFER_BINDING);
      if (vertexBuffer && elementBuffer && attribute(0,gl.VERTEX_ATTRIB_ARRAY_TYPE) === gl.FLOAT) {
        const IndexArray = type === gl.UNSIGNED_INT ? Uint32Array : type === gl.UNSIGNED_SHORT ? Uint16Array : Uint8Array;
        const indices = new IndexArray(3), values = [];
        if (offset + indices.byteLength <= bufferSize(gl.ELEMENT_ARRAY_BUFFER,gl.BUFFER_SIZE)) {
          read(gl.ELEMENT_ARRAY_BUFFER,offset,indices);
          const previous = get(gl.ARRAY_BUFFER_BINDING), size = attribute(0,gl.VERTEX_ATTRIB_ARRAY_SIZE);
          const stride = attribute(0,gl.VERTEX_ATTRIB_ARRAY_STRIDE) || size * 4;
          const start = pointer(0,gl.VERTEX_ATTRIB_ARRAY_POINTER);
          try {
            bind(gl.ARRAY_BUFFER,vertexBuffer);
            const bytes = bufferSize(gl.ARRAY_BUFFER,gl.BUFFER_SIZE);
            for (const index of indices) {
              const value = new Float32Array(size), position = start + index * stride;
              if (position + value.byteLength <= bytes) {read(gl.ARRAY_BUFFER,position,value);values.push(Array.from(value));}
            }
          } finally {bind(gl.ARRAY_BUFFER,previous);}
          const model = Array.from(getUniform(program,uniforms.model)), projection = Array.from(getUniform(program,uniforms.projection));
          const key = JSON.stringify([values,model,projection]);
          if (!seen.has(key)) {
            seen.add(key);
            const state = Object.fromEntries(['DEPTH_FUNC','DEPTH_RANGE','COLOR_WRITEMASK','VIEWPORT','SCISSOR_BOX','CULL_FACE_MODE']
              .map(name => {const value=get(gl[name]);return [name,ArrayBuffer.isView(value)?Array.from(value):value];}));
            self.postMessage({type:'log',text:'[q4-depth-trace] '+JSON.stringify({id:seen.size,count,type,indices:Array.from(indices),values,model,projection,state})});
          }
        }
      }
    }
    return draw(mode,count,type,offset);
  };
  return gl;
};
importScripts('/q4-interaction-trace-worker.js');
