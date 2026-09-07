// Candidate-only SDK repair. Scope CPU immediate vertices independently of the
// application's saved VBO binding, then restore it even if submission throws.
import assert from 'node:assert/strict';
export function repairImmediateBuffer(source) {
  const expression=/var _emscripten_glEnd = \(\) => \{([\s\S]*?)\n    \};\n  _emscripten_glEnd\.sig/;
  const matches=[...source.matchAll(new RegExp(expression.source,'g'))];
  assert.equal(matches.length,1,'exactly one linked SDK glEnd seam');
  assert.ok(!source.includes('q4ImmediateSavedArrayBuffer'),'do not apply twice');
  return source.replace(expression,(_match,body)=>`var _emscripten_glEnd = () => {
      // OpenQ4: glBegin/glEnd vertices always live in the SDK CPU stream.
      const q4ImmediateSavedArrayBuffer = GLctx.currentArrayBufferBinding;
      GLctx.currentArrayBufferBinding = 0;
      GLImmediate.lastArrayBuffer = null;
      try {${body}
      } finally {
        GLctx.currentArrayBufferBinding = q4ImmediateSavedArrayBuffer;
        GLctx.bindBuffer(GLctx.ARRAY_BUFFER, GL.buffers[q4ImmediateSavedArrayBuffer] || null);
        // The bound application VBO is not the prepared temporary stream.
        GLImmediate.lastArrayBuffer = null;
        GLImmediate.lastStride = -1;
      }
    };
  _emscripten_glEnd.sig`);
}
