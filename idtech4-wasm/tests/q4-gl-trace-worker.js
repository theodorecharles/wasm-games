// Isolated diagnostic worker only; never staged or shipped by build-all.
// Mount this as q4-worker.js and the unmodified production wrapper as
// q4-worker-native.js. It records the actual WebGL operation behind an error
// while retaining that error for the engine's normal getError query.
'use strict';
const q4OriginalGetContext = OffscreenCanvas.prototype.getContext;
OffscreenCanvas.prototype.getContext = function (...arguments_) {
  const context = q4OriginalGetContext.apply(this, arguments_);
  if (!context || arguments_[0] !== 'webgl2' || context.q4TraceInstalled) return context;
  context.q4TraceInstalled = true;
  const getError = context.getError.bind(context);
  const pendingErrors = new Set();
  const reported = new Map();
  const methods = new Set();
  let failedLinks = 0;
  for (let prototype = context; prototype && prototype !== Object.prototype; prototype = Object.getPrototypeOf(prototype)) {
    for (const name of Object.getOwnPropertyNames(prototype)) {
      const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
      if (typeof descriptor?.value === 'function' && name !== 'constructor' && name !== 'getError') methods.add(name);
    }
  }
  for (const name of methods) {
    const original = context[name];
    context[name] = function (...args) {
      const result = original.apply(context, args);
      const error = getError();
      if (name === 'linkProgram' && !context.getProgramParameter(args[0], 0x8B82) && failedLinks++ < 4) {
        self.postMessage({type:'log', text:'[q4-gl-trace] ' + JSON.stringify({
          method:'linkProgram', linked:false, info:context.getProgramInfoLog(args[0]),
          shaders:context.getAttachedShaders(args[0]).map(shader => ({
            type:context.getShaderParameter(shader, 0x8B4F),
            compiled:context.getShaderParameter(shader, 0x8B81),
            info:context.getShaderInfoLog(shader), source:context.getShaderSource(shader)
          })), stack:new Error('WebGL program link').stack
        })});
      }
      if (error) {
        pendingErrors.add(error);
        const key = `${name}:${error}`;
        const count = (reported.get(key) || 0) + 1;
        reported.set(key, count);
        if (count <= 2 && reported.size <= 40) {
          const values = args.map(value => value === null || ['string', 'number', 'boolean'].includes(typeof value)
            ? value : Object.prototype.toString.call(value));
          self.postMessage({type:'log', text:'[q4-gl-trace] ' + JSON.stringify({
            method:name, error, args:values, stack:new Error('WebGL operation').stack
          })});
        }
      }
      return result;
    };
  }
  context.getError = function () {
    if (!pendingErrors.size) return getError();
    const error = pendingErrors.values().next().value;
    pendingErrors.delete(error);
    return error;
  };
  self.postMessage({type:'log', text:'[q4-gl-trace] WebGL call tracing enabled (diagnostic only)'});
  return context;
};
importScripts('/q4-worker-native.js');
