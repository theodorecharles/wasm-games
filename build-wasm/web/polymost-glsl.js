// Polymost's desktop GLSL -> ESSL 3, using the fixed-function bridge's names.
// Scoped to the native Polymost compiler; no SDK or WebGL methods are replaced.
addToLibrary({
  $BuildPolymostGLSL: function(source, vertex) {
    source = source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '')
      .replace(/^\s*#version[^\n]*$/gm, '')
      .replace(/^\s*#extension\s+GL_ARB_shader_texture_lod[^\n]*$/gm, '')
      .replace(/^\s*#ifdef\s+GL_ARB_shader_texture_lod\s*$/gm, '#if 1');
    var declarations = new Set();
    function binding(pattern, name, declaration) {
      source = source.replace(pattern, function() {
        declarations.add(declaration);
        return name;
      });
    }
    var varying = vertex ? 'out' : 'in';
    binding(/\bgl_ModelViewProjectionMatrix\b/g, '(u_projection * u_modelView)',
      'uniform mat4 u_projection;\nuniform mat4 u_modelView;');
    // Avoid a duplicate declaration when both matrix forms occur.
    if (/\bgl_ModelViewMatrix\b/.test(source)) {
      source = source.replace(/\bgl_ModelViewMatrix\b/g, 'u_modelView');
      if (!declarations.has('uniform mat4 u_projection;\nuniform mat4 u_modelView;'))
        declarations.add('uniform mat4 u_modelView;');
    }
    binding(/\bgl_Vertex\b/g, 'a_position', 'in vec4 a_position;');
    binding(/\bgl_Color\b/g, 'a_color', 'in vec4 a_color;');
    for (var i = 0; i < 16; ++i) {
      binding(new RegExp('gl_TextureMatrix\\[' + i + '\\]', 'g'), 'u_textureMatrix' + i,
        'uniform mat4 u_textureMatrix' + i + ';');
      binding(new RegExp('\\bgl_MultiTexCoord' + i + '\\b', 'g'), 'a_texCoord' + i,
        'in vec4 a_texCoord' + i + ';');
      binding(new RegExp('gl_TexCoord\\[' + i + '\\]', 'g'), 'v_texCoord' + i,
        varying + ' vec4 v_texCoord' + i + ';');
    }
    binding(/\bgl_FogFragCoord\b/g, 'v_fogFragCoord', varying + ' float v_fogFragCoord;');
    for (var fog of [['end', 'End', 'float'], ['scale', 'Scale', 'float'], ['color', 'Color', 'vec4']])
      binding(new RegExp('\\bgl_Fog\\.' + fog[0] + '\\b', 'g'), 'u_fog' + fog[1],
        'uniform ' + fog[2] + ' u_fog' + fog[1] + ';');
    binding(/gl_FragData\[0\]/g, 'o_fragColor', 'out vec4 o_fragColor;');
    source = source.replace(/\bvarying\b/g, varying)
      .replace(/\btexture2DGradARB\b/g, 'textureGrad')
      .replace(/\btexture2D\b/g, 'texture');
    if (!vertex && declarations.has('out vec4 o_fragColor;')) {
      declarations.add('uniform int u_buildAlphaFunc;\nuniform float u_buildAlphaRef;');
      // Desktop alpha testing follows the fragment shader, before color/depth
      // writes. The SDK only generates that step for its own fixed shaders.
      source = source.replace(/\bvoid\s+main\s*\(\s*\)/, 'void buildPolymostMain()');
      source += '\nbool buildAlphaPass(float a) {\n' +
        '  if (u_buildAlphaFunc == 512) return false;\n' +
        '  if (u_buildAlphaFunc == 513) return a < u_buildAlphaRef;\n' +
        '  if (u_buildAlphaFunc == 514) return a == u_buildAlphaRef;\n' +
        '  if (u_buildAlphaFunc == 515) return a <= u_buildAlphaRef;\n' +
        '  if (u_buildAlphaFunc == 516) return a > u_buildAlphaRef;\n' +
        '  if (u_buildAlphaFunc == 517) return a != u_buildAlphaRef;\n' +
        '  if (u_buildAlphaFunc == 518) return a >= u_buildAlphaRef;\n' +
        '  return true;\n}\n' +
        'void main() { buildPolymostMain(); if (!buildAlphaPass(o_fragColor.a)) discard; }\n';
    }
    // ES defaults sampler2D to lowp independently of float precision. The
    // indexed renderer uses sampled red values as subsequent palette indices;
    // lowp quantization can select the adjacent entry (or lose transparency).
    return '#version 300 es\nprecision highp float;\nprecision highp int;\nprecision highp sampler2D;\n' +
      Array.from(declarations).join('\n') + '\n' + source;
  },
  build_webglShaderSource__deps: ['$GL', '$UTF8ToString', '$BuildPolymostGLSL'],
  build_webglShaderSource: function(shader, type, source, length) {
    var vertex = type === 0x8B31;
    GL.shaderInfos[shader].ftransform = vertex;
    GLctx.shaderSource(GL.shaders[shader], BuildPolymostGLSL(UTF8ToString(source, length), vertex));
  },
  $BuildPolymostAlphaState: { locations: null },
  build_webglSyncAlphaTest__deps: ['$GL', '$GLEmulation', '$BuildPolymostAlphaState'],
  build_webglSyncAlphaTest: function() {
    // Read the SDK's actual compatibility state; state-accounting resets in
    // native code must not invent a new GL state. Program objects also avoid
    // stale locations if an integer program handle is later reused.
    var program = GL.programs[GL.currProgram];
    if (!program) return;
    if (!BuildPolymostAlphaState.locations) BuildPolymostAlphaState.locations = new WeakMap();
    var state = BuildPolymostAlphaState.locations.get(program);
    if (!state) {
      state = { func: GLctx.getUniformLocation(program, 'u_buildAlphaFunc'),
        ref: GLctx.getUniformLocation(program, 'u_buildAlphaRef'), lastFunc: -1, lastRef: NaN };
      BuildPolymostAlphaState.locations.set(program, state);
    }
    var func = GLEmulation.alphaTestEnabled ? GLEmulation.alphaTestFunc : 0;
    var ref = Math.max(0, Math.min(1, GLEmulation.alphaTestRef));
    if (state.func !== null && state.lastFunc !== func) {
      GLctx.uniform1i(state.func, func); state.lastFunc = func;
    }
    if (state.ref !== null && state.lastRef !== ref) {
      GLctx.uniform1f(state.ref, ref); state.lastRef = ref;
    }
  }
});
