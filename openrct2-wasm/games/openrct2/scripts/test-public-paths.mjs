import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { webcrypto } from 'node:crypto';

assert.equal(typeof vm.SyntheticModule, 'function', 'Run with node --experimental-vm-modules');
const game = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const site = path.resolve(process.argv[2] || path.join(game, 'web'));
const framework = process.env.OPENRCT2_FRAMEWORK_DIST || '/home/ted/Development/wasm-game-framework/dist';
const frameworkSource = fs.readFileSync(path.join(framework, 'wasm-game-framework.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(site, 'wasm-game.json')));
const adapterSource = fs.readFileSync(path.join(site, 'game-adapter.js'), 'utf8');
const workerSource = fs.readFileSync(path.join(site, 'openrct2-worker.js'), 'utf8');
const hotCache = await import(pathToFileURL(path.join(site, 'openrct2-hot-cache.mjs')));
function target() {
  const listeners = new Map();
  return { listeners, addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(fn); },
    emit(type, data) { for (const fn of listeners.get(type) || []) fn(data); } };
}
async function namespace(exports, context) {
  const module = new vm.SyntheticModule(Object.keys(exports), function () {
    for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
  }, { context });
  await module.link(() => { throw Error('Unexpected fixture dependency'); });
  await module.evaluate(); return module;
}
async function until(check) {
  for (let i = 0; i < 100; i++) { if (check()) return; await new Promise(setImmediate); }
  assert.ok(check(), 'async runtime seam did not complete');
}

async function adapterCase(prefix, failure) {
  const timers = new Map(), workers = [], imports = [], calls = [], audio = { closes: 0, enqueued: 0 };
  const canvas = { ...target(), width: 1280, height: 720,
    transferControlToOffscreen() { return { width: this.width, height: this.height }; } };
  const document = { ...target(), documentElement: { dataset: {} }, hidden: false };
  const globalEvents = target();
  class Worker {
    constructor(url) {
      assert.equal(url, prefix + 'openrct2-worker.js');
      if (failure === 'constructor') throw Error('fixture constructor failure');
      Object.assign(this, target()); this.messages = []; this.terminated = 0; workers.push(this);
    }
    postMessage(message, transfer) {
      if (failure === 'transfer') throw Error('fixture transfer failure');
      this.messages.push(message); if (message.type === 'start') assert.equal(transfer[0], message.canvas);
    }
    terminate() { this.terminated++; }
  }
  const sandbox = { console, URL, Blob, File, TextDecoder, Uint8Array, document, Worker,
    location: { href: 'https://games.test' + prefix }, WASM_GAME_BASE_PATH: prefix,
    addEventListener: globalEvents.addEventListener, AudioContext: class {},
    setTimeout(fn, ms) { assert.equal(ms, 600000); const id = timers.size + 1; timers.set(id, fn); return id; },
    clearTimeout(id) { timers.delete(id); }
  };
  const context = vm.createContext(sandbox);
  vm.runInContext(frameworkSource, context);
  await new vm.Script(adapterSource, { filename: 'game-adapter.js', importModuleDynamically: async specifier => {
    imports.push(specifier); assert.equal(specifier, prefix + 'openrct2-audio-bridge.mjs');
    return namespace({ createMainAudioSink() { return {
      context: { sampleRate: 44100 }, async resume() {}, async suspend() {},
      async close() { audio.closes++; }, enqueue() { audio.enqueued++; }
    }; } }, context);
  } }).runInContext(context);
  const entries = ['Data/g1.dat', 'ObjData/custom.parkobj', 'Scenarios/Park.sc6', 'Tracks/ride.td6', 'RCT1/Data/CSG1.DAT']
    .map(name => ({ mountName: name, file: new File(['fixture'], path.basename(name), { lastModified: 1700000000000 }) }));
  const ctx = { framework: sandbox.WasmGameFramework, config: manifest, variant: 'openrct2',
    elements: { canvas }, persistence: { namespace: 'openrct2:openrct2', root: '/save/openrct2' },
    shell: { async resumeAudio() {}, resize() {} }, dataClient: { media: { async load() {
      if (failure === 'media') throw Error('fixture media failure'); return { entries };
    } } }, setEngineState: state => calls.push(state), setLoading() {}, log() {}, showRuntime() {}
  };
  await sandbox.WasmGameAdapter.init(ctx);
  const started = sandbox.WasmGameAdapter.start(ctx);
  const outcome = started.then(() => null, error => error);
  if (['constructor', 'media', 'transfer'].includes(failure)) {
    assert.match(String(await outcome), /fixture .* failure/);
  } else {
    await until(() => workers[0]?.messages.length);
    const worker = workers[0], start = worker.messages[0];
    assert.equal(start.basePath, prefix);
    assert.equal(start.persistence.root, '/save/openrct2');
    assert.equal(start.persistence.namespace, 'openrct2:openrct2');
    for (const [key, extension] of [['script', 'js'], ['wasm', 'wasm'], ['data', 'data']])
      assert.equal(start.native[key], 'https://games.test' + prefix + 'runtime/openrct2.' + extension);
    assert.deepEqual(Array.from(start.groups, group => group.directory), ['Data', 'ObjData', 'Scenarios', 'Tracks', 'RCT1/Data']);
    assert.equal(start.audioSampleRate, 44100);
    assert.equal(start.groups[1].files[0].lastModified, 1700000000000);
    if (failure === 'timeout') [...timers.values()][0]();
    else if (failure === 'message') worker.emit('message', { data: { type: 'error', text: 'fixture worker failure' } });
    else if (failure === 'error') worker.emit('error', { message: 'fixture worker failure' });
    else {
      worker.emit('message', { data: { type: 'state', state: 'menu', drawCount: 1 } });
      assert.equal(await outcome, null);
      assert.equal(sandbox.WasmGameAdapter.readEngineState(), 'menu');
      sandbox.WasmGameAdapter.pointerMove({ captured: false, x: 123, y: 456 });
      assert.equal(worker.messages.at(-1).type, 'pointer-move');
      worker.emit('message', { data: { type: 'audio' } }); assert.equal(audio.enqueued, 1);
      worker.emit('message', { data: { type: 'persistence', status: { saved: true } } });
      assert.equal(JSON.parse(document.documentElement.dataset.openrct2Persistence).saved, true);
      await sandbox.WasmGameAdapter.start(ctx); assert.equal(workers.length, 1);
      // Fatal errors after a successful first frame must also release resources.
      worker.emit('error', { message: 'fixture later crash' });
    }
    if (failure) assert.match(String(await outcome), /fixture worker failure|first frame/);
    worker.emit('message', { data: { type: 'state', state: 'gameplay', drawCount: 99 } });
    worker.emit('message', { data: { type: 'audio' } });
    assert.equal(audio.enqueued, failure ? 0 : 1, 'late messages from a dead worker are ignored');
  }
  assert.equal(sandbox.WasmGameAdapter.readEngineState(), 'crashed');
  assert.equal(audio.closes, 1);
  assert.equal(timers.size, 0);
  assert.ok(workers.every(worker => worker.terminated === 1));
  assert.equal(imports.length, 1);
}

async function workerCase(prefix, invalid = false) {
  const imports = [], messages = [], order = [], mounts = [], dirs = [], timers = new Map();
  const workerFs = { stream_ops: { read() {} } };
  const FS = { filesystems: { WORKERFS: workerFs }, mkdirTree: dir => dirs.push(dir),
    readdir: () => ['.', '..'], mount(type, options, root) {
      assert.equal(type, workerFs); mounts.push(root); return { contents: {} };
    }, stat() { throw Error('not created in fixture'); }
  };
  let nativeOptions, nativeArguments;
  const native = { FS, callMain(args) { order.push('main'); nativeArguments = args; },
    _OpenRCT2Wasm_DrawCount: () => 1, _OpenRCT2Wasm_RuntimeState: () => 1 };
  const events = target();
  const sandbox = { ...events, console, URL, crypto: webcrypto, WebAssembly,
    location: { href: 'https://games.test' + prefix + 'openrct2-worker.js' },
    OffscreenCanvas: class {}, postMessage: message => messages.push(message),
    setInterval(fn, ms) { const id = timers.size + 1; timers.set(id, { fn, ms }); return id; }, clearInterval: id => timers.delete(id)
  };
  sandbox.self = sandbox;
  const context = vm.createContext(sandbox);
  sandbox.importScripts = specifier => {
    imports.push(specifier);
    if (specifier === prefix + 'shared-shell/wasm-game-framework.js') {
      vm.runInContext(frameworkSource, context);
      const actual = sandbox.WasmGameFramework;
      sandbox.WasmGameFramework = { ...actual, createPersistenceManager(config) {
        assert.equal(config.root, '/save/openrct2');
        assert.equal(config.namespace, 'openrct2:openrct2');
        return { async attach(_FS, opts) { order.push('restore'); assert.equal(_FS, FS); return { root: opts.root }; },
          markDirty() { order.push('dirty'); }, async save() { order.push('save'); } };
      } };
    } else {
      assert.equal(specifier, 'https://games.test' + prefix + 'runtime/openrct2.js');
      sandbox.OPENRCT2_WEB = async options => { nativeOptions = options; order.push('factory'); return native; };
    }
  };
  new vm.Script(workerSource, { filename: 'openrct2-worker.js', importModuleDynamically: async specifier => {
    imports.push(specifier);
    if (specifier === prefix + 'openrct2-audio-bridge.mjs') return namespace({ installWorkerAudioBridge(opts) {
      assert.ok(opts.target === vm.runInContext('self', context)); assert.equal(opts.sampleRate, 44100); order.push('audio');
    } }, context);
    assert.equal(specifier, prefix + 'openrct2-hot-cache.mjs'); return namespace(hotCache, context);
  } }).runInContext(context);
  events.emit('message', { data: { type: 'start', basePath: invalid ? '//outside.test/' : prefix,
    canvas: new sandbox.OffscreenCanvas(), width: 1280, height: 720, framework: manifest.framework,
    native: { factory: 'OPENRCT2_WEB', ...Object.fromEntries(['script', 'wasm', 'data'].map(key =>
      [key, 'https://games.test' + prefix + 'runtime/openrct2.' + (key === 'script' ? 'js' : key)])) },
    persistence: { root: '/save/openrct2', namespace: 'openrct2:openrct2' }, audioSampleRate: 44100,
    groups: ['Data', 'ObjData', 'Scenarios', 'Tracks', 'RCT1/Data'].map(directory => ({ directory,
      files: [{ name: directory === 'ObjData' ? 'private.parkobj' : 'fixture.dat' }] }))
  } });
  await until(() => messages.some(message => ['error', 'state'].includes(message.type)));
  const error = messages.find(message => message.type === 'error');
  if (invalid) { assert.match(error?.text, /canonical public base path/); assert.equal(imports.length, 0); return; }
  assert.equal(error, undefined, error?.text);
  assert.equal(sandbox.WASM_GAME_BASE_PATH, prefix);
  assert.equal(nativeOptions.noInitialRun, true);
  for (const ext of ['wasm', 'data']) assert.equal(nativeOptions.locateFile('openrct2.' + ext), 'https://games.test' + prefix + 'runtime/openrct2.' + ext);
  assert.equal(nativeOptions.locateFile('pthread.js'), 'https://games.test' + prefix + 'runtime/pthread.js');
  assert.equal(nativeOptions.mainScriptUrlOrBlob, 'https://games.test' + prefix + 'runtime/openrct2.js');
  assert.deepEqual(mounts, ['/RCT/Data', '/RCT/ObjData', '/RCT/Scenarios', '/RCT/Tracks', '/RCT/RCT1/Data', '/OpenRCT2/object/installed']);
  assert.ok(order.indexOf('restore') < order.indexOf('main'));
  assert.deepEqual(Array.from(nativeArguments), ['--user-data-path=/save/openrct2', '--openrct2-data-path=/OpenRCT2', '--rct2-data-path=/RCT', '--rct1-data-path=/RCT/RCT1']);
  assert.equal(native.wasmGamePersistenceRoot, '/save/openrct2');
  assert.equal(timers.size, 1); assert.equal([...timers.values()][0].ms, 250);
  assert.ok(order.includes('save'));
  assert.equal(imports.length, 4);
}

let cases = 0;
for (const prefix of ['/', '/openrct2/', '/games/openrct2/']) {
  for (const failure of [undefined, 'media', 'constructor', 'transfer', 'timeout', 'message', 'error']) {
    await adapterCase(prefix, failure); cases++;
  }
  await workerCase(prefix); cases++;
  await workerCase(prefix, true); cases++;
}
console.log(`OpenRCT2: ${cases} actual adapter/worker fixtures pass for root/single/nested URLs, native FS/save roots, import/audio/mount order, first-frame failure cleanup and stale callbacks. Not browser gameplay or IndexedDB durability proof.`);
