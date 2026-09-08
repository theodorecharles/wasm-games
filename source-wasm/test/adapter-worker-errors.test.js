'use strict';
const assert = require('node:assert/strict');
const { Worker } = require('node:worker_threads');
const { fixture } = require('./adapter-regressions');
const settle = () => new Promise(resolve => setImmediate(resolve));

// Browser dispatch reports a throwing onerror handler but continues dispatch
// to independent listeners. Preserve that behavior without swallowing it in
// production or depending on generated SDK code.
class BrowserWorker extends EventTarget {
  constructor() { super(); this.listeners = new Set(); this.sdkErrors = []; this.onmessage = () => {}; }
  addEventListener(type, listener) { if (type === 'error') this.listeners.add(listener); super.addEventListener(type, listener); }
  removeEventListener(type, listener) { if (type === 'error') this.listeners.delete(listener); super.removeEventListener(type, listener); }
  error(message) {
    const event = new Event('error'); event.message = message;
    let reported;
    try { this.onerror?.(event); } catch (error) { reported = error; }
    this.dispatchEvent(event); return reported;
  }
}
function poolFixture() {
  const originalError = function (event) { this.sdkErrors.push(event.message); throw event; };
  const pool = { unusedWorkers: [], runningWorkers: [], pthreads: {},
    allocateUnusedWorker() { const worker = new BrowserWorker(); this.unusedWorkers.push(worker); return worker; },
    loadWasmModuleToWorker(worker) { worker.onerror = originalError; return Promise.resolve(worker); },
  };
  pool.allocateUnusedWorker(); pool.loadWasmModuleToWorker(pool.unusedWorkers[0]);
  return { pool, originalError, allocate: pool.allocateUnusedWorker, load: pool.loadWasmModuleToWorker };
}

module.exports = async function runWorkerErrorTests(source, dataManifest) {
  function setup(options = {}) {
    const pool = poolFixture(), heap = new Int32Array(new SharedArrayBuffer(16384));
    const app = fixture(source, dataManifest, { ...options,
      native: { sourceWasmRuntime: 'pthread-side-module-v1', PThread: pool.pool, HEAP32: heap, HEAPU8: new Uint8Array(heap.buffer) },
      onMain(module) {
        heap.set([0x53574231, 1, 16, 512, 0, 0, 0, 0], 16);
        module.sourceWasmBridgeReady(64, 8224, 1);
        options.onMain?.(module);
      },
    });
    return Object.assign(app, pool);
  }
  {
    const app = setup(); await app.init(); await app.start();
    const module = app.modules[0], worker = app.pool.unusedWorkers[0], onmessage = worker.onmessage;
    assert.equal(worker.onerror, app.originalError); assert.equal(worker.listeners.size, 1);
    assert.equal(app.adapter.readEngineState(), 'loading');
    assert.equal(worker.error('null function or function signature mismatch').message, 'null function or function signature mismatch');
    assert.deepEqual(worker.sdkErrors, ['null function or function signature mismatch'], 'SDK error reporting is preserved');
    assert.equal(worker.onmessage, onmessage, 'worker command/event routing is untouched');
    assert.equal(app.adapter.readEngineState(), 'crashed'); assert.equal(app.adapter.readCaptureIntent(), false);
    assert.equal(module.sourceWasmState(1, 3, 1), false, 'late worker state cannot hide the crash');
    assert.equal(worker.listeners.size, 0); assert.equal(app.pool.allocateUnusedWorker, app.allocate);
    assert.equal(app.pool.loadWasmModuleToWorker, app.load);
    assert.match(app.logs.join('\n'), /null function or function signature mismatch/);
  }
  {
    const app = setup(); await app.init(); await app.start();
    const worker = app.pool.allocateUnusedWorker();
    assert.equal(worker.listeners.size, 1, 'future workers are watched immediately after allocation');
    assert.equal(await app.pool.loadWasmModuleToWorker(worker), worker, 'SDK load result and this binding are preserved');
    assert.equal(worker.listeners.size, 1, 'allocation and load wrappers do not duplicate listeners');
    assert.equal(worker.onerror, app.originalError);
    app.pool.runningWorkers.push(app.pool.unusedWorkers.pop());
    worker.error('future pthread failed');
    assert.equal(app.adapter.readEngineState(), 'crashed');
    assert.equal(app.pool.unusedWorkers[0].listeners.size, 0, 'failure removes listeners from the rest of the pool');
  }
  {
    let releaseFactory;
    const pendingFactory = new Promise(resolve => { releaseFactory = resolve; });
    const app = setup({ afterFactoryCreated: () => pendingFactory }); await app.init();
    const started = app.start();
    const rejection = assert.rejects(started, /pool initialization failed/);
    await settle();
    app.pool.unusedWorkers[0].error('pool initialization failed');
    let deadline;
    try {
      await Promise.race([rejection, new Promise((_resolve, reject) => {
        deadline = setTimeout(() => reject(Error('worker error did not reject pending factory startup')), 2000);
      })]);
    } finally { clearTimeout(deadline); releaseFactory(); }
    assert.equal(app.adapter.readEngineState(), 'crashed');
    assert.ok(!app.calls.includes('main'), 'an initial pool failure cannot enter native main');
    assert.equal(app.pool.unusedWorkers[0].listeners.size, 0);
  }
  {
    const app = setup({ failures: { main: 1 } }); await app.init(); await assert.rejects(app.start(), /fixture main failure/);
    const oldWorker = app.pool.unusedWorkers[0], failed = app.modules[0];
    app.pool.unusedWorkers = [new BrowserWorker()];
    app.pool.loadWasmModuleToWorker(app.pool.unusedWorkers[0]);
    await app.start();
    oldWorker.error('stale worker error'); failed.factoryOptions.onAbort('stale abort');
    assert.equal(app.adapter.readEngineState(), 'loading', 'failed runtime callbacks cannot corrupt a retried runtime');
    assert.equal(app.pool.unusedWorkers[0].listeners.size, 1);
  }
  {
    const app = setup(); await app.init(); await app.start();
    const target = app.pool.unusedWorkers[0];
    // Exercise an actual off-thread WebAssembly trap through the browser
    // event surface. The adapter never calls native engine functions here.
    const worker = new Worker('throw new WebAssembly.RuntimeError("real pthread trap")', { eval: true });
    let deadline;
    try {
      await new Promise((resolve, reject) => {
        deadline = setTimeout(() => reject(Error('real worker did not fail')), 2000);
        worker.once('error', error => { target.error(error.message); resolve(); });
      });
      assert.equal(app.adapter.readEngineState(), 'crashed'); assert.match(app.logs.join('\n'), /real pthread trap/);
    } finally { clearTimeout(deadline); await worker.terminate(); }
  }
  process.stdout.write('adapter worker failures: prepared/future pools, preserved SDK handlers, pending startup rejection, stale cleanup and real off-thread trap\n');
};
