'use strict';
const fs = require('fs');
const p = process.argv[2] || require('path').join(__dirname, '..', 'web', 'client', 'etjs.js');
let s = fs.readFileSync(p, 'utf8');
const repls = [
  ['function _glActiveTextureARB(...args){abort("missing function: glActiveTextureARB")}',
   'function _glActiveTextureARB(...args){return _emscripten_glActiveTexture(...args)}'],
  ['function _glClientActiveTextureARB(...args){abort("missing function: glClientActiveTextureARB")}',
   'function _glClientActiveTextureARB(...args){return 0}'],
  ['function _glCallList(...args){abort("missing function: glCallList")}',
   'function _glCallList(...args){return 0}']
];
repls.forEach(([a, b]) => { if (s.includes(a)) s = s.replace(a, b); });
fs.writeFileSync(p, s);
s = fs.readFileSync(p, 'utf8');
s = s.replace('var _emscripten_glDrawBuffer=()=>{abort("glDrawBuffer: TODO")}',
              'var _emscripten_glDrawBuffer=()=>{/* WebGL single draw buffer */}');
s = s.replace(
  'var contextAttributes={antialias:false,alpha:false,majorVersion:typeof WebGL2RenderingContext!="undefined"?2:1}',
  'var contextAttributes={antialias:false,alpha:false,preserveDrawingBuffer:true,majorVersion:typeof WebGL2RenderingContext!="undefined"?2:1}'
);
s = s.replace(
  'var contextAttributes={antialias:false,alpha:false,majorVersion:2}',
  'var contextAttributes={antialias:false,alpha:false,preserveDrawingBuffer:true,majorVersion:2}'
);
s = s.replace(
  'var ctx=webGLContextAttributes.majorVersion>1?canvas.getContext("webgl2",webGLContextAttributes):canvas.getContext("webgl",webGLContextAttributes);if(!ctx)return 0;',
  'webGLContextAttributes.preserveDrawingBuffer=true;var ctx=(typeof Module!="undefined"&&Module.preinitializedWebGLContext)||null;if(!ctx){ctx=webGLContextAttributes.majorVersion>1?canvas.getContext("webgl2",webGLContextAttributes):canvas.getContext("webgl",webGLContextAttributes)}if(!ctx){ctx=canvas.getContext("webgl",webGLContextAttributes)||canvas.getContext("webgl2",webGLContextAttributes)}if(!ctx)return 0;'
);
s = s.replace(
  'var ctx=canvas.getContext("webgl2",webGLContextAttributes);if(!ctx)return 0;',
  'webGLContextAttributes.preserveDrawingBuffer=true;var ctx=(typeof Module!="undefined"&&Module.preinitializedWebGLContext)||canvas.getContext("webgl2",webGLContextAttributes)||canvas.getContext("webgl",webGLContextAttributes);if(!ctx)return 0;'
);
s = s.replace(
  'expandFileStorage(node,newCapacity){var prevCapacity=node.contents.length;if(prevCapacity>=newCapacity)return;var CAPACITY_DOUBLING_MAX=1024*1024;newCapacity=Math.max(newCapacity,prevCapacity*(prevCapacity<CAPACITY_DOUBLING_MAX?2:1.125)>>>0);if(prevCapacity)newCapacity=Math.max(newCapacity,256);var oldContents=MEMFS.getFileDataAsTypedArray(node);node.contents=new Uint8Array(newCapacity);node.contents.set(oldContents)}',
  'expandFileStorage(node,newCapacity){var prevCapacity=node.contents?node.contents.length:0;if(prevCapacity>=newCapacity)return;var CAPACITY_DOUBLING_MAX=1024*1024;newCapacity=Math.max(newCapacity,prevCapacity*(prevCapacity<CAPACITY_DOUBLING_MAX?2:1.125)>>>0);if(prevCapacity)newCapacity=Math.max(newCapacity,256);if(newCapacity>64*1024*1024){err("ETJS MEMFS expand name="+(node&&node.name)+" prev="+prevCapacity+" new="+newCapacity)}if(newCapacity>384*1024*1024){err("ETJS MEMFS expand blocked name="+(node&&node.name));throw new Error("ETJS MEMFS expand too large")}var oldContents=MEMFS.getFileDataAsTypedArray(node);node.contents=new Uint8Array(newCapacity);node.contents.set(oldContents)}'
);
fs.writeFileSync(p, s);
