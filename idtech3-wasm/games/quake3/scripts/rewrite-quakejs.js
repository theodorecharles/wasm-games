#!/usr/bin/env node
'use strict';

const fs = require('node:fs');

const [sourcePath, outputPath] = process.argv.slice(2);
if (!sourcePath || !outputPath) throw new Error('usage: rewrite-quakejs.js SOURCE OUTPUT');

let source = fs.readFileSync(sourcePath, 'utf8');

const platformStart = source.indexOf('function _Sys_PlatformInit() {');
const platformEnd = source.indexOf('\n  function _Sys_Dirname', platformStart);
if (platformStart < 0 || platformEnd < 0) throw new Error('QuakeJS platform launcher seam changed.');
source = `${source.slice(0, platformStart)}function _Sys_PlatformInit() {}\n${source.slice(platformEnd)}`;

const sysStart = source.indexOf('var SYS={');
const cssStart = source.indexOf('css:"', sysStart);
const cssEnd = source.indexOf('",DoXHR:function', cssStart);
if (sysStart < 0 || cssStart < 0 || cssEnd < 0) throw new Error('QuakeJS embedded launcher style seam changed.');
source = `${source.slice(0, cssStart)}css:""${source.slice(cssEnd + 1)}`;

const legacyMouse = `      ['mousedown', 'mouseup', 'mousemove', 'DOMMouseScroll', 'mousewheel', 'mouseout'].forEach(function(event) {\n        Module['canvas'].addEventListener(event, SDL.receiveEvent, true);\n      });\n  `;
if (!source.includes(legacyMouse)) throw new Error('QuakeJS mouse listener seam changed.');
source = source.replace(legacyMouse, '      // Mouse input is injected by the canonical framework adapter.\n  ');

// The pinned QuakeJS artifact was compiled from desktop GL code which sets
// GL_TEXTURE_BORDER_COLOR (0x1004) for its already-clamped fog texture. WebGL
// does not expose that pname, so reject just that redundant call at the
// generated binding. The committed native patch carries the equivalent guard
// for source rebuilds.
const textureParameter = `  function _glTexParameterfv(target, pname, params) {\n      var param = HEAPF32[((params)>>2)];\n      GLctx.texParameterf(target, pname, param);\n    }`;
const webGlTextureParameter = `  function _glTexParameterfv(target, pname, params) {\n      if (pname === 0x1004) return; // GL_TEXTURE_BORDER_COLOR is not a WebGL pname.\n      var param = HEAPF32[((params)>>2)];\n      GLctx.texParameterf(target, pname, param);\n    }`;
if (!source.includes(textureParameter)) throw new Error('QuakeJS texture parameter seam changed.');
source = source.replace(textureParameter, webGlTextureParameter);

// Keep the pinned desktop-GL emulation on its documented safe path. This is
// intentionally conservative for the old QuakeJS artifact even though its
// remaining Radeon/WebGL presentation artifact also reproduces upstream.
const unsafeRendererCache = `            var canSkip = this == lastRenderer &&
                          arrayBuffer == GLImmediate.lastArrayBuffer &&
                          (GL.currProgram || this.program) == GLImmediate.lastProgram &&
                          GLImmediate.stride == GLImmediate.lastStride &&
                          !GLImmediate.matricesModified;`;
if (!source.includes(unsafeRendererCache)) throw new Error('QuakeJS unsafe renderer cache seam changed.');
source = source.replace(unsafeRendererCache, '            var canSkip = false; // GL_UNSAFE_OPTS=0 compatibility.');
source = source.replace(
  "        Module.printErr('WARNING: using emscripten GL emulation unsafe opts. If weirdness happens, try -s GL_UNSAFE_OPTS=0');\n",
  ''
);

const contextAttributes = `        var webGLContextAttributes = {
          antialias: ((SDL.glAttributes[13 /*SDL_GL_MULTISAMPLEBUFFERS*/] != 0) && (SDL.glAttributes[14 /*SDL_GL_MULTISAMPLESAMPLES*/] > 1)),
          depth: (SDL.glAttributes[6 /*SDL_GL_DEPTH_SIZE*/] > 0),
          stencil: (SDL.glAttributes[7 /*SDL_GL_STENCIL_SIZE*/] > 0)
        };`;
const preservedContextAttributes = `        var webGLContextAttributes = {
          antialias: ((SDL.glAttributes[13 /*SDL_GL_MULTISAMPLEBUFFERS*/] != 0) && (SDL.glAttributes[14 /*SDL_GL_MULTISAMPLESAMPLES*/] > 1)),
          depth: (SDL.glAttributes[6 /*SDL_GL_DEPTH_SIZE*/] > 0),
          stencil: (SDL.glAttributes[7 /*SDL_GL_STENCIL_SIZE*/] > 0),
          preserveDrawingBuffer: true
        };`;
if (!source.includes(contextAttributes)) throw new Error('QuakeJS WebGL context seam changed.');
source = source.replace(contextAttributes, preservedContextAttributes);

// The old QuakeJS runtime links IDBFS for its native fs_homepath startup but
// does not publish it through the modern FS.filesystems registry. Expose that
// already-linked backend so wasm-game-framework can restore saves/configs
// before native main without carrying an engine-specific persistence path.
const fsRegistryAnchor = "        FS.nameTable = new Array(4096);\n  \n        FS.mount(MEMFS, {}, '/');";
const fsRegistryWithBackends = "        FS.nameTable = new Array(4096);\n        FS.filesystems = { MEMFS: MEMFS, IDBFS: IDBFS };\n  \n        FS.mount(MEMFS, {}, '/');";
if (!source.includes(fsRegistryAnchor)) throw new Error('QuakeJS filesystem registry seam changed.');
source = source.replace(fsRegistryAnchor, fsRegistryWithBackends);

// ioquake3's glIndex_t is uint32 and it calls glDrawElements with
// GL_UNSIGNED_INT. This old Emscripten GLImmediate bridge ignores that type,
// reads the client array as uint16, and uploads only half its bytes. Q3's
// tessellator stays below 65,536 vertices, so convert its uint32 client index
// stream to the bridge's WebGL1 uint16 element buffer before drawing.
const indexFlushCall = '          GLImmediate.flush(count, 0, indices);';
if (!source.includes(indexFlushCall)) throw new Error('QuakeJS element flush seam changed.');
source = source.replace(indexFlushCall, '          GLImmediate.flush(count, 0, indices, type);');

const flushSignature = '      },flush:function flush(numProvidedIndexes, startIndex, ptr) {';
if (!source.includes(flushSignature)) throw new Error('QuakeJS GLImmediate flush signature seam changed.');
source = source.replace(flushSignature, '      },flush:function flush(numProvidedIndexes, startIndex, ptr, indexType) {');

const indexRead = `              var currIndex = HEAPU16[(((ptr)+(i*2))>>1)];`;
const typedIndexRead = `              var currIndex = indexType === 0x1405 /* GL_UNSIGNED_INT */
                ? HEAPU32[(((ptr)+(i*4))>>2)]
                : HEAPU16[(((ptr)+(i*2))>>1)];`;
if (!source.includes(indexRead)) throw new Error('QuakeJS client index read seam changed.');
source = source.replace(indexRead, typedIndexRead);

const indexUpload = `            var indexBuffer = GL.getTempIndexBuffer(numProvidedIndexes << 1);
            GLctx.bindBuffer(GLctx.ELEMENT_ARRAY_BUFFER, indexBuffer);
            GLctx.bufferSubData(GLctx.ELEMENT_ARRAY_BUFFER, 0, HEAPU16.subarray((ptr)>>1,(ptr + (numProvidedIndexes << 1))>>1));
            ptr = 0;
            emulatedElementArrayBuffer = true;`;
const typedIndexUpload = `            var indexBuffer = GL.getTempIndexBuffer(numProvidedIndexes << 1);
            GLctx.bindBuffer(GLctx.ELEMENT_ARRAY_BUFFER, indexBuffer);
            if (indexType === 0x1405 /* GL_UNSIGNED_INT */) {
              for (var i = 0; i < numProvidedIndexes; i++) {
                GLImmediate.indexData[i] = HEAPU32[(((ptr)+(i*4))>>2)];
              }
              GLctx.bufferSubData(GLctx.ELEMENT_ARRAY_BUFFER, 0, GLImmediate.indexData.subarray(0, numProvidedIndexes));
            } else {
              GLctx.bufferSubData(GLctx.ELEMENT_ARRAY_BUFFER, 0, HEAPU16.subarray((ptr)>>1,(ptr + (numProvidedIndexes << 1))>>1));
            }
            ptr = 0;
            emulatedElementArrayBuffer = true;`;
if (!source.includes(indexUpload)) throw new Error('QuakeJS client index upload seam changed.');
source = source.replace(indexUpload, typedIndexUpload);

if (source.includes('eula-frame-inner') || source.includes("id = 'dialog'")) {
  throw new Error('Legacy QuakeJS launcher markup remains in the deployable engine.');
}

fs.writeFileSync(outputPath, source);
