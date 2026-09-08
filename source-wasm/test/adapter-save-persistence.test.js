'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { fixture } = require('./adapter-regressions');

const settle = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function documentFixture() {
  const elements = new Map();
  function element() {
    return { style: {}, children: [], listeners: {}, hidden: false,
      setAttribute() {},
      addEventListener(name, fn) { this.listeners[name] = fn; },
      removeEventListener(name, fn) { if (this.listeners[name] === fn) delete this.listeners[name]; },
      append(...children) { children.forEach(child => this.appendChild(child)); },
      appendChild(child) { child.parent = this; this.children.push(child); if (child.id) elements.set(child.id, child); },
      remove() { this.parent?.children.splice(this.parent.children.indexOf(this), 1); elements.delete(this.id); },
    };
  }
  const runtime = element(); elements.set('runtime', runtime);
  return { documentElement: { dataset: {} }, createElement: element,
    getElementById: name => elements.get(name), querySelector: () => ({ width: 1280, height: 720 }), runtime };
}

module.exports = async function runSavePersistenceTests(source, dataManifest) {
  function setup(options = {}) {
    const document = documentFixture();
    const heap = new Int32Array(new SharedArrayBuffer(16384));
    const app = fixture(source, dataManifest, { ...options, document,
      native: { sourceWasmRuntime: 'pthread-side-module-v1', HEAP32: heap, HEAPU8: new Uint8Array(heap.buffer) },
      onMain(module) {
        module.HEAP32.set([0x53574231, 1, 16, 512, 0, 0, 0, 0], 16);
        assert.equal(module.sourceWasmBridgeReady(64, 8224, 1), true);
        options.onMain?.(module);
      },
    });
    return Object.assign(app, { document,
      async boot() { await app.init(); await app.start(); return app.modules.at(-1); },
      status: () => app.adapter.persistenceStatus(),
      file(filename, content = 'native save bytes') { app.modules.at(-1).FS.writeFile('/game/hl2/' + filename, content); },
      panel: () => document.getElementById('source-save-status'),
    });
  }

  {
    const app = setup(), write = deferred(); let flushes = 0;
    app.context.persistence.save = () => { ++flushes; return write.promise; };
    const module = await app.boot();
    assert.equal(app.status().state, 'idle');
    assert.equal(typeof module.sourceWasmSaveEvent, 'function', 'save callback is installed before native main');
    module.sourceWasmSaveEvent(1, 0, 1, 'save/slot.sav');
    assert.equal(app.panel().children[0].textContent, 'Saving…');
    app.file('save/slot.sav'); module.sourceWasmSaveEvent(1, 1); await settle();
    assert.equal(flushes, 0, 'core save completion must wait for a requested native thumbnail');
    app.file('save/slot.tga', 'thumbnail'); module.sourceWasmSaveEvent(1, 2); await settle();
    assert.equal(flushes, 1, 'last native completion immediately starts persistence without a timer or file poll');
    assert.equal(app.status().state, 'saving'); assert.equal(app.status().committedGeneration, null);
    write.resolve([true]); await settle();
    assert.equal(app.status().state, 'saved'); assert.equal(app.status().committedGeneration, 1);
    assert.equal(app.panel().children[0].textContent, 'Saved on this device');
    assert.equal(app.panel().children[1].hidden, true); assert.equal(app.timers.length, 0);
    module.sourceWasmSaveEvent(1, 1); module.sourceWasmSaveEvent(1, 2); await settle();
    assert.equal(flushes, 1, 'duplicate completion events do not start another commit');
  }

  {
    const app = setup(); let flushes = 0;
    app.context.persistence.save = async () => { ++flushes; return [true]; };
    const module = await app.boot(); app.file('save/auto.sav');
    module.sourceWasmSaveEvent(10, 1); await settle();
    assert.equal(app.status().state, 'idle', 'completion from a second pthread may arrive before its begin event');
    assert.equal(flushes, 0);
    module.sourceWasmSaveEvent(10, 0, 0, 'save/auto.sav'); await settle();
    assert.equal(flushes, 1); assert.equal(app.status().state, 'saved', 'optional no-thumbnail saves finish on core completion');
    for (const args of [[0, 0, 0, 'save/x.sav'], [11, 3], [11, 0, 2, 'save/x.sav'], [11, 0, 0, '../x.sav'],
      [11, 0, 0, 'save/../x.sav'], [11, 0, 0, 'save/\\x.sav'], [11, 0, 0, 'save/x\0.sav'], [10, 0, 0, 'save/changed.sav'], [9, 1]]) {
      assert.equal(module.sourceWasmSaveEvent(...args), false, 'invalid/stale event: ' + JSON.stringify(args));
    }
    assert.equal(app.status().generation, 10); assert.equal(flushes, 1);
  }

  {
    const app = setup(); let flushes = 0;
    app.context.persistence.save = async () => { ++flushes; return true; };
    const module = await app.boot();
    app.tick(60000); assert.equal(app.status().state, 'idle', 'cancelled native dialog emits no accepted-save event');
    module.sourceWasmSaveEvent(1, 0, 0, 'save/missing.sav'); module.sourceWasmSaveEvent(1, 1); await settle();
    assert.equal(app.status().state, 'error'); assert.equal(flushes, 0, 'missing native output cannot be called committed');
    assert.equal(app.panel().children[0].textContent, 'Save failed');
    assert.equal(app.panel().children[1].hidden, false);
    app.file('save/missing.sav', ''); assert.equal(app.adapter.retryPersistence(), true); await settle();
    assert.equal(app.status().state, 'error'); assert.equal(flushes, 0, 'empty native output also fails');
    app.file('save/missing.sav'); app.panel().children[1].listeners.click(); await settle();
    assert.equal(app.status().state, 'saved'); assert.equal(flushes, 1, 'Retry runs a real write after native output is present');
    app.file('save/noimage.sav');
    module.sourceWasmSaveEvent(2, 0, 1, 'save/noimage.sav'); module.sourceWasmSaveEvent(2, 1); module.sourceWasmSaveEvent(2, 2);
    await settle(); assert.equal(app.status().state, 'error'); assert.equal(flushes, 1);
    assert.equal(app.status().committedGeneration, 1, 'missing thumbnail cannot advance the committed generation');
  }

  {
    const app = setup(); let flushes = 0;
    app.context.persistence.save = async () => { ++flushes; return true; };
    const module = await app.boot(); app.file('save/pending.sav');
    module.sourceWasmSaveEvent(1, 0, 1, 'save/pending.sav'); module.sourceWasmSaveEvent(1, 1);
    app.tick(60000); assert.equal(app.status().state, 'error'); assert.match(app.status().error, /timed out/);
    app.adapter.retryPersistence(); await settle(); assert.equal(flushes, 0, 'Retry never substitutes a file check for absent native completion');
    app.tick(60000); assert.equal(app.status().state, 'error', 'lost native completion cannot remain pending forever');
    app.file('save/pending.tga'); module.sourceWasmSaveEvent(1, 2); await settle();
    assert.equal(app.status().state, 'saved', 'a late actual completion may recover after the bounded timeout');
    assert.equal(app.timers.length, 0);
  }

  for (const outcome of [new Error('QuotaExceededError'), [false], [], undefined]) {
    const app = setup(); let flushes = 0;
    app.context.persistence.save = () => { ++flushes; return outcome instanceof Error ? Promise.reject(outcome) : Promise.resolve(outcome); };
    const module = await app.boot(); app.file('save/slot.sav');
    module.sourceWasmSaveEvent(1, 0, 0, 'save/slot.sav'); module.sourceWasmSaveEvent(1, 1); await settle();
    assert.equal(app.status().state, 'error'); assert.equal(app.status().committedGeneration, null);
    assert.equal(flushes, 1); assert.ok(app.logs.some(message => message.includes('Save persistence failed')));
    app.context.persistence.save = async () => { ++flushes; return [true]; };
    assert.equal(app.adapter.retryPersistence(), true); await settle();
    assert.equal(flushes, 2); assert.equal(app.status().state, 'saved'); assert.equal(app.status().error, '');
    app.adapter.persistenceChanged({ lastError: 'later periodic write failed' });
    assert.equal(app.status().state, 'error');
    app.adapter.retryPersistence(); await settle();
    assert.equal(flushes, 3, 'Retry after a later persistence error commits again even if generation is unchanged');
    assert.equal(app.status().state, 'saved');
  }

  for (const rejectFirst of [false, true]) {
    const app = setup(), writes = []; let running = 0, maximum = 0;
    app.context.persistence.save = () => {
      ++running; maximum = Math.max(maximum, running);
      const write = deferred(); writes.push(write);
      return write.promise.finally(() => --running);
    };
    const module = await app.boot();
    function completed(generation) {
      app.file('save/slot.sav', 'save generation ' + generation);
      module.sourceWasmSaveEvent(generation, 0, 0, 'save/slot.sav'); module.sourceWasmSaveEvent(generation, 1);
    }
    completed(1); await settle(); completed(2); completed(3); await settle();
    assert.equal(writes.length, 1, 'burst saves cannot overlap a persistence transaction');
    if (rejectFirst) writes[0].reject(new Error('old write failed')); else writes[0].resolve([true]);
    await settle();
    assert.equal(app.status().state, 'saving'); assert.equal(app.status().generation, 3);
    assert.notEqual(app.status().committedGeneration, 3, 'an earlier transaction cannot confirm a later native save');
    assert.equal(writes.length, 2, 'pending saves coalesce to the latest fully completed generation');
    writes[1].resolve([true]); await settle();
    assert.equal(app.status().state, 'saved'); assert.equal(app.status().committedGeneration, 3);
    assert.equal(maximum, 1); assert.equal(writes.length, 2); assert.equal(app.timers.length, 0);
  }

  {
    const app = setup(), write = deferred();
    app.context.persistence.save = () => write.promise;
    const module = await app.boot(); app.file('save/slot.sav');
    module.sourceWasmSaveEvent(1, 0, 0, 'save/slot.sav'); module.sourceWasmSaveEvent(1, 1); await settle();
    app.tick(60000); assert.equal(app.status().state, 'error', 'a stalled storage callback also has a bounded player-facing wait');
    module.factoryOptions.onAbort('native fatal');
    assert.equal(module.sourceWasmSaveEvent(2, 0, 0, 'save/late.sav'), false);
    write.resolve([true]); await settle();
    assert.equal(app.status().state, 'error'); assert.equal(app.status().committedGeneration, null, 'late storage callback from a dead runtime is ignored');
    assert.equal(app.adapter.retryPersistence(), false); assert.equal(app.timers.length, 0);
    assert.equal(app.panel().children[1].hidden, true, 'dead runtime cannot offer a nonfunctional Retry button');
  }

  {
    const app = setup({ failures: { main: 1 }, onMain(module) { module.sourceWasmSaveEvent(1, 0, 0, 'save/interrupted.sav'); } });
    await app.init(); await assert.rejects(app.start(), /fixture main failure/);
    const failed = app.modules[0]; assert.equal(app.document.runtime.children.length, 1);
    await app.start(); const module = app.modules[1];
    assert.equal(app.document.runtime.children.length, 1, 'retry replaces the previous runtime status rather than duplicating its UI');
    assert.equal(failed.sourceWasmSaveEvent(1, 1), false);
    assert.equal(app.status().state, 'saving'); assert.equal(app.status().committedGeneration, null);
    module.factoryOptions.onAbort('cleanup');
    assert.equal(app.panel().children[0].textContent, 'Save failed'); assert.equal(app.timers.length, 0);
  }
  {
    const frameworkRoot = process.env.WASM_FRAMEWORK_DIR || process.env.WASM_GAME_FRAMEWORK_ROOT || '/home/ted/Development/wasm-game-framework';
    const { createPersistenceManager } = require(path.join(frameworkRoot, 'dist/wasm-game-framework.js'));
    const app = setup({ failures: { main: 1 } }), syncCalls = [];
    const manager = createPersistenceManager({ namespace: 'save-test', root: '/save/hl2', autoSave: false,
      intervalMs: 0, requestDurability: false, onStatus: detail => app.adapter.persistenceChanged(detail) });
    app.context.persistence = { ...manager, attach(FS, options) {
      const runtime = app.modules.length;
      FS.mount = () => {};
      FS.syncfs = (populate, callback) => { syncCalls.push([runtime, populate]); callback(); };
      return manager.attach(FS, options);
    } };
    await app.init(); await assert.rejects(app.start(), /fixture main failure/);
    assert.equal(manager.status().attached, 0, 'failed startup must unregister the destroyed mount from the real framework manager');
    await app.start(); const module = app.modules[1]; app.file('save/retried.sav');
    module.sourceWasmSaveEvent(1, 0, 0, 'save/retried.sav'); module.sourceWasmSaveEvent(1, 1); await settle();
    assert.equal(app.status().state, 'saved');
    assert.deepEqual(syncCalls, [[1, true], [1, false], [2, true], [2, false]], 'only the live runtime participates in the retried save');
    await manager.destroy();
  }
  process.stdout.write('adapter saves: native core/thumbnail ordering, bounded waits, real commit results, Retry, burst serialization, stale runtime cleanup and player status\n');
};
