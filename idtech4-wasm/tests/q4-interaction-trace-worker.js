// Test-only wrapper. Copy the error tracer to /q4-gl-trace-worker.js and mount
// this file as /q4-worker.js in an isolated candidate. Never stage this worker.
// Samples actual submitted material interactions without replacing shaders,
// depth functions, uniforms, or textures. Occlusion queries distinguish rejected
// fragments from accepted-but-dark fragments; neither alone proves gameplay.
'use strict';
const q4InteractionGetContext = OffscreenCanvas.prototype.getContext;
OffscreenCanvas.prototype.getContext = function (...args) {
  const gl = q4InteractionGetContext.apply(this, args);
  if (!gl || args[0] !== 'webgl2' || gl.q4InteractionTraceInstalled) return gl;
  gl.q4InteractionTraceInstalled = true;
  const originals = {};
  for (const name of ['linkProgram', 'drawElements', 'getParameter', 'getUniform',
    'getUniformLocation', 'getVertexAttrib', 'getVertexAttribOffset', 'bindBuffer',
    'getBufferSubData', 'getBufferParameter', 'activeTexture', 'getTexParameter',
    'getQuery', 'createQuery', 'beginQuery', 'endQuery', 'getQueryParameter', 'deleteQuery']) {
    originals[name] = gl[name].bind(gl);
  }
  const programs = new WeakMap(), signatures = new Set(), pending = [];
  let drawCount = 0, serial = 0;
  const report = value => self.postMessage({type:'log', text:'[q4-interaction-trace] '+JSON.stringify(value)});
  const scalarOrArray = value => ArrayBuffer.isView(value) ? Array.from(value) : value;
  const uniformNames = ['uModelViewMatrix', 'uProjectionMatrix', 'uLocalLightOrigin',
    'uLocalViewOrigin', 'uLightProjectionS', 'uLightProjectionT', 'uLightProjectionQ',
    'uLightFalloffS', 'uBumpMatrixS', 'uBumpMatrixT', 'uDiffuseMatrixS',
    'uDiffuseMatrixT', 'uSpecularMatrixS', 'uSpecularMatrixT', 'uVertexColorParams',
    'uDiffuseColor', 'uSpecularColor', 'uBumpMap', 'uLightFalloffMap',
    'uLightProjectionMap', 'uDiffuseMap', 'uSpecularMap', 'uAmbientLight', 'uAmbientNormalMap',
    'uStockInteraction', 'uMaterialNormalScale', 'uMaterialSpecularBoost', 'uMaterialFresnel',
    'uCelParams', 'uFlatDiffuseParams'];
  gl.linkProgram = function (program) {
    const result = originals.linkProgram(program);
    if (gl.getProgramParameter(program, gl.LINK_STATUS) &&
      originals.getUniformLocation(program, 'uBumpMap') !== null &&
      originals.getUniformLocation(program, 'uVertexColorParams') !== null) {
      programs.set(program, Object.fromEntries(uniformNames.map(name =>
        [name, originals.getUniformLocation(program, name)])));
    }
    return result;
  };
  function drainQueries() {
    for (let i = pending.length - 1; i >= 0; i--) {
      const item = pending[i];
      if (!originals.getQueryParameter(item.query, gl.QUERY_RESULT_AVAILABLE)) continue;
      report({kind:'occlusion', id:item.id,
        anySamplesPassed:originals.getQueryParameter(item.query, gl.QUERY_RESULT)});
      originals.deleteQuery(item.query); pending.splice(i, 1);
    }
  }
  function geometry(type, offset) {
    const indexBuffer = originals.getParameter(gl.ELEMENT_ARRAY_BUFFER_BINDING);
    if (!indexBuffer) return {unavailable:'no index buffer'};
    const IndexArray = type === gl.UNSIGNED_INT ? Uint32Array : type === gl.UNSIGNED_SHORT ? Uint16Array : Uint8Array;
    const indices = new IndexArray(3);
    const indexBytes = originals.getBufferParameter(gl.ELEMENT_ARRAY_BUFFER, gl.BUFFER_SIZE);
    if (offset + indices.byteLength > indexBytes) return {unavailable:'short index buffer'};
    originals.getBufferSubData(gl.ELEMENT_ARRAY_BUFFER, offset, indices);
    const previousArray = originals.getParameter(gl.ARRAY_BUFFER_BINDING), attributes = [];
    try {
      for (const index of [0,2,8,9,10,11]) {
        const enabled = originals.getVertexAttrib(index, gl.VERTEX_ATTRIB_ARRAY_ENABLED);
        const buffer = originals.getVertexAttrib(index, gl.VERTEX_ATTRIB_ARRAY_BUFFER_BINDING);
        const size = originals.getVertexAttrib(index, gl.VERTEX_ATTRIB_ARRAY_SIZE);
        const attributeType = originals.getVertexAttrib(index, gl.VERTEX_ATTRIB_ARRAY_TYPE);
        const stride = originals.getVertexAttrib(index, gl.VERTEX_ATTRIB_ARRAY_STRIDE);
        const attributeOffset = originals.getVertexAttribOffset(index, gl.VERTEX_ATTRIB_ARRAY_POINTER);
        const values = [];
        if (enabled && buffer && [gl.FLOAT, gl.UNSIGNED_BYTE].includes(attributeType)) {
          originals.bindBuffer(gl.ARRAY_BUFFER, buffer);
          const bytes = originals.getBufferParameter(gl.ARRAY_BUFFER, gl.BUFFER_SIZE);
          const Values = attributeType === gl.FLOAT ? Float32Array : Uint8Array;
          for (const vertex of indices) {
            const start = attributeOffset + vertex * (stride || size * Values.BYTES_PER_ELEMENT);
            const data = new Values(size);
            if (start + data.byteLength <= bytes) {
              originals.getBufferSubData(gl.ARRAY_BUFFER, start, data); values.push(Array.from(data));
            } else values.push({outOfBounds:true, start, bytes});
          }
        }
        attributes.push({index, enabled, size, type:attributeType, stride, offset:attributeOffset,
          normalized:originals.getVertexAttrib(index, gl.VERTEX_ATTRIB_ARRAY_NORMALIZED), values});
      }
    } finally { originals.bindBuffer(gl.ARRAY_BUFFER, previousArray); }
    return {indices:Array.from(indices), attributes};
  }
  gl.drawElements = function (mode, count, type, offset) {
    if (++drawCount % 128 === 0) drainQueries();
    const program = originals.getParameter(gl.CURRENT_PROGRAM), locations = program && programs.get(program);
    if (!locations || signatures.size >= 32 || count < 3) return originals.drawElements(mode, count, type, offset);
    const uniforms = Object.fromEntries(Object.entries(locations).filter(([,location]) => location !== null)
      .map(([name,location]) => [name,scalarOrArray(originals.getUniform(program,location))]));
    const signature = JSON.stringify([count, uniforms.uModelViewMatrix, uniforms.uLocalLightOrigin, uniforms.uDiffuseColor]);
    if (signatures.has(signature)) return originals.drawElements(mode, count, type, offset);
    signatures.add(signature);
    const id = ++serial, textures = [], activeTexture = originals.getParameter(gl.ACTIVE_TEXTURE);
    try {
      for (let unit = 0; unit < (uniforms.uAmbientNormalMap === undefined ? 5 : 6); unit++) {
        originals.activeTexture(gl.TEXTURE0 + unit);
        const target = unit === 5 ? gl.TEXTURE_CUBE_MAP : gl.TEXTURE_2D;
        const bound = originals.getParameter(unit === 5 ? gl.TEXTURE_BINDING_CUBE_MAP : gl.TEXTURE_BINDING_2D) !== null;
        textures.push({unit, target, bound, ...(bound ? {
          wrapS:originals.getTexParameter(target, gl.TEXTURE_WRAP_S),
          wrapT:originals.getTexParameter(target, gl.TEXTURE_WRAP_T),
          minFilter:originals.getTexParameter(target, gl.TEXTURE_MIN_FILTER),
          maxLevel:originals.getTexParameter(target, gl.TEXTURE_MAX_LEVEL)
        } : {})});
      }
    } finally { originals.activeTexture(activeTexture); }
    const state = Object.fromEntries(['DEPTH_TEST','DEPTH_FUNC','DEPTH_RANGE','DEPTH_WRITEMASK',
      'STENCIL_TEST','STENCIL_FUNC','STENCIL_REF','STENCIL_VALUE_MASK','CULL_FACE','CULL_FACE_MODE',
      'SCISSOR_TEST','SCISSOR_BOX','VIEWPORT','COLOR_WRITEMASK','BLEND','BLEND_SRC_RGB','BLEND_DST_RGB']
      .map(name => [name,scalarOrArray(originals.getParameter(gl[name]))]));
    report({kind:'draw', id, mode, count, type, offset, uniforms, state, textures, geometry:geometry(type, offset)});
    const query = originals.getQuery(gl.ANY_SAMPLES_PASSED, gl.CURRENT_QUERY) ? null : originals.createQuery();
    if (query) originals.beginQuery(gl.ANY_SAMPLES_PASSED, query);
    const result = originals.drawElements(mode, count, type, offset);
    if (query) { originals.endQuery(gl.ANY_SAMPLES_PASSED); pending.push({id,query}); }
    return result;
  };
  setInterval(drainQueries, 1000);
  report({kind:'installed', scope:'read-only material state/geometry sampling plus occlusion queries, no shader/state substitutions'});
  return gl;
};
importScripts('/q4-gl-trace-worker.js');
