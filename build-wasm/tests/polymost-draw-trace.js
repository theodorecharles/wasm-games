// Diagnostic build only. Observe driver errors and the first draw states.
// Consumes GL error flags, so this must not be used for gameplay acceptance.
Browser.moduleContextCreatedCallbacks.push(function() {
  var ctx = GLctx, draws = 0, worldDraws = 0, errors = 0;
  for (var method of ['drawArrays', 'drawElements', 'texImage2D', 'texSubImage2D',
    'vertexAttribPointer', 'bufferSubData', 'hint']) {
    (function(name, original) {
      ctx[name] = function() {
        var pending = ctx.getError();
        if (pending && errors++ < 32)
          Module.printErr('[GPU pending] ' + JSON.stringify({before:name, error:pending}));
        var result = original.apply(ctx, arguments);
        var error = ctx.getError();
        var isDraw = name === 'drawArrays' || name === 'drawElements';
        if (error && errors++ < 32)
          Module.printErr('[GPU driver] ' + JSON.stringify({name:name, error:error,
            args:Array.from(arguments, function(value) {
              return ArrayBuffer.isView(value) ? {bytes:value.byteLength} : value;
            })}));
        var world = document.documentElement.dataset.shellEngineState === 'gameplay';
        if (isDraw && (draws++ < 6 || (world && worldDraws++ < 24))) {
          var program = ctx.getParameter(ctx.CURRENT_PROGRAM), uniforms = {};
          if (program) for (var i = 0; i < ctx.getProgramParameter(program, ctx.ACTIVE_UNIFORMS); ++i) {
            var key = ctx.getActiveUniform(program, i).name;
            var location = ctx.getUniformLocation(program, key);
            var value = location ? ctx.getUniform(program, location) : null;
            uniforms[key] = ArrayBuffer.isView(value) ? Array.from(value) : value;
          }
          Module.printErr((world ? '[GPU world] ' : '[GPU draw] ') + JSON.stringify({name:name, args:Array.from(arguments),
            viewport:Array.from(ctx.getParameter(ctx.VIEWPORT)), uniforms:uniforms}));
        }
        return result;
      };
    })(method, ctx[method]);
  }
});
