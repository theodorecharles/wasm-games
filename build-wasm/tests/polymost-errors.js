// Isolated probe only: surface asynchronous failures in the ordinary game log.
// Do not suppress the error, inspect engine state, or change input/rendering.
globalThis.addEventListener('error', function(event) {
  Module.printErr('[GPU probe] ' + (event.error?.stack || event.message));
});
globalThis.addEventListener('unhandledrejection', function(event) {
  Module.printErr('[GPU probe rejection] ' + (event.reason?.stack || event.reason));
});
