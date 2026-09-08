'use strict';
const assert = require('node:assert/strict');
const path = require('node:path').posix;
const vm = require('node:vm');

// The contract used by Emscripten MEMFS/IDBFS: parent symlinks are followed,
// normal files contain bytes and permissions, readFile reads into a separate
// JS buffer at offset zero, and persistence serializes node.contents directly.
// No generated engine code or owner assets are needed by this fixture.
function memoryFs() {
  const nodes = new Map([['/', { directory: true }]]), links = new Map();
  function resolve(filename) {
    let current = path.resolve('/', filename);
    for (let depth = 0; depth < 8; depth++) {
      const alias = [...links.keys()].find(key => current === key || current.startsWith(key + '/'));
      if (!alias) return current;
      current = links.get(alias) + current.slice(alias.length);
    }
    throw Error('Too many symlinks');
  }
  function requireNode(filename) {
    const node = nodes.get(resolve(filename));
    if (!node) throw Object.assign(Error('No such file: ' + filename), { code: 'ENOENT', errno: 44 });
    return node;
  }
  const FS = {
    filesystems: { IDBFS: {} }, nodes, resolve,
    mkdirTree(filename) {
      const segments = resolve(filename).split('/').filter(Boolean);
      let current = '';
      for (const segment of segments) {
        current += '/' + segment;
        if (!nodes.has(current)) nodes.set(current, { directory: true });
      }
    },
    symlink(target, filename) {
      if (links.has(filename) || nodes.has(filename)) throw Error('File exists');
      links.set(filename, target);
    },
    analyzePath(filename) { return { exists: nodes.has(resolve(filename)) }; },
    stat(filename) {
      const node = requireNode(filename);
      return { size: node.usedBytes ?? node.contents?.length ?? 0, mode: node.mode };
    },
    unlink(filename) { if (!nodes.delete(resolve(filename))) throw Error('No such file'); },
    createFile(parent, name, properties, canRead, canWrite) {
      assert.ok(requireNode(parent).directory);
      const filename = resolve(path.join(parent, name));
      assert.ok(!nodes.has(filename), 'createFile must not overwrite without unlink');
      const node = { ...properties, contents: null, mode: 0o100000 | (canRead ? 0o444 : 0) | (canWrite ? 0o222 : 0), stream_ops: {} };
      node.stream_ops.read = (_stream, destination, offset, length, position) => {
        const bytes = (node.contents || new Uint8Array()).subarray(position, position + length);
        destination.set(bytes, offset); return bytes.length;
      };
      nodes.set(filename, node); return node;
    },
    createDataFile(parent, name, bytes, canRead, canWrite) {
      const node = FS.createFile(parent, name, {}, canRead, canWrite);
      node.contents = new Uint8Array(bytes); return node;
    },
    writeFile(filename, bytes) {
      const resolved = resolve(filename);
      let node = nodes.get(resolved);
      if (!node) node = FS.createFile(path.dirname(resolved), path.basename(resolved), {}, true, true);
      if (!(node.mode & 0o222)) throw Error('Permission denied');
      node.contents = typeof bytes === 'string' ? new Uint8Array(Buffer.from(bytes)) : new Uint8Array(bytes);
    },
    readFile(filename) {
      const node = requireNode(filename), destination = new Uint8Array(FS.stat(filename).size);
      node.stream_ops.read({ node }, destination, 0, destination.length, 0);
      return destination;
    },
    chdir(filename) { assert.ok(requireNode(filename).directory); },
    persisted(root) {
      return Object.fromEntries([...nodes].filter(([filename, node]) => filename.startsWith(root + '/') && !node.directory)
        .map(([filename, node]) => [filename, Buffer.from(node.contents || []).toString()]));
    },
  };
  return FS;
}

function fixture(source, dataManifest, options = {}) {
  const calls = [], logs = [], modules = [], timers = [], requests = [];
  const owner = new Map(Object.entries(options.owner || { 'hl2/gameinfo.txt': 'gameinfo' }).map(([key, value]) => [key, Buffer.from(value)]));
  const restored = options.restored || {};
  const failures = { ...options.failures };
  let now = 0, nextTimer = 0;
  function fail(stage) {
    if (failures[stage]) { failures[stage]--; throw Error('fixture ' + stage + ' failure'); }
  }
  const scope = {
    console: { log() {}, error() {} }, URL, Uint8Array, TextEncoder, Atomics: options.atomics || Atomics,
    atob: value => Buffer.from(value, 'base64').toString('latin1'),
    location: { href: 'http://fixture/?' + (options.query || '') },
    document: options.document || { documentElement: { dataset: {} }, querySelector: () => ({ width: 1280, height: 720 }) },
    Date: { now: () => now },
    setTimeout(fn) { fn.timerId = ++nextTimer; timers.push(fn); return fn.timerId; },
    clearTimeout(id) { const index = timers.findIndex(fn => fn.timerId === id); if (index >= 0) timers.splice(index, 1); },
    fetch: async url => {
      requests.push(String(url));
      const pathname = new URL(url, 'http://fixture').pathname;
      if (pathname === '/wasm-game-data.json') return { ok: true, json: async () => dataManifest };
      if (pathname === '/owner-index') {
        fail('index');
        return { ok: true, json: async () => ({ schema: 1, recipe: options.recipe || 'goty-2014-plus-legacy-shaders-v1',
          files: [...owner].map(([name, bytes]) => [name, bytes.length]),
        }) };
      }
      const bytes = owner.get(decodeURIComponent(pathname.slice('/owner/'.length)));
      if (!bytes) return { ok: false, status: 404 };
      return { ok: true, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length) };
    },
    XMLHttpRequest: class {
      open(_method, url) { this.filename = decodeURIComponent(new URL(url, 'http://fixture').pathname.slice('/owner/'.length)); }
      setRequestHeader(name, value) { if (name === 'Range') this.range = /^bytes=(\d+)-(\d+)$/.exec(value); }
      overrideMimeType() {}
      send() {
        requests.push('sync:' + this.filename);
        options.beforeSyncRead?.(modules.at(-1), this.filename);
        const bytes = owner.get(this.filename); this.status = bytes ? 200 : 404;
        this.responseText = bytes ? bytes.subarray(Number(this.range[1]), Number(this.range[2]) + 1).toString('base64') : '';
      }
    },
    async createSourceEngineModule(factoryOptions) {
      calls.push('factory'); fail('factory');
      if (options.factoryWait) await options.factoryWait;
      const module = { FS: memoryFs(), HEAPU8: new Uint8Array(2048),
        factoryOptions,
        callMain(args) { this.launchArgs = args; calls.push('main'); options.onMain?.(this); fail('main'); },
        pauseMainLoop() { calls.push('pause-loop'); },
        _source_wasm_read_engine_state: () => 2,
        cwrap() { calls.push('cwrap'); return () => { throw Error('missing native export'); }; },
        ccall(name, _result, _types, values) {
          calls.push('ccall:' + name);
          if (name === 'source_wasm_start_map') calls.push('map:' + values[0]);
          else if (name !== 'source_wasm_set_player_name' && name !== 'source_wasm_set_cvar') throw Error('missing native export: ' + name);
        },
        ...options.native,
      };
      modules.push(module);
      factoryOptions.preRun?.forEach(callback => callback(module));
      await options.afterFactoryCreated?.(module);
      return module;
    },
  };
  if (options.noXHR) scope.XMLHttpRequest = undefined;
  scope.globalThis = scope; vm.runInNewContext(source, scope, { filename: 'game-adapter.js' });
  const context = {
    variant: 'hl2', preferences: {},
    framework: { publicUrl: value => value, createOwnerDataSet: value => value },
    persistence: { root: '/save/hl2', async attach(FS) {
      calls.push('attach'); fail('attach'); FS.mkdirTree('/save/hl2');
      for (const [filename, value] of Object.entries(restored)) {
        FS.mkdirTree(path.dirname('/save/hl2/' + filename)); FS.writeFile('/save/hl2/' + filename, value);
      }
      return { async destroy() { calls.push('destroy-mount'); } };
    } },
    log: message => logs.push(message), setEngineState: state => calls.push('state:' + state),
    showRuntime: state => calls.push('show:' + state), showLoading() {}, setLoading() {},
  };
  return { adapter: scope.WasmGameAdapter, context, calls, logs, modules, timers, failures, requests,
    async init() { await scope.WasmGameAdapter.init(context); },
    start: () => scope.WasmGameAdapter.start(context),
    tick(elapsed = 100) { now += elapsed; const pending = timers.splice(0); for (const fn of pending) fn(); },
  };
}

module.exports = async function runRegressions(source, dataManifest) {
  {
    const app = fixture(source, dataManifest, {
      owner: { 'hl2/gameinfo.txt': 'gameinfo', 'hl2/cfg/config.cfg': 'packaged bindings', 'hl2/cfg/empty.cfg': 'packaged nonempty',
        'hl2/cfg/config_default.cfg': 'default bindings', 'hl2/save/slot.sav': 'packaged save' },
      restored: { 'cfg/config.cfg': 'player bindings', 'cfg/empty.cfg': '', 'save/slot.sav': 'player save' },
    });
    await app.init(); await app.start(); const FS = app.modules[0].FS;
    assert.equal(Buffer.from(FS.readFile('/game/hl2/cfg/config.cfg')).toString(), 'player bindings');
    assert.equal(FS.readFile('/game/hl2/cfg/empty.cfg').length, 0);
    assert.equal(Buffer.from(FS.readFile('/game/hl2/save/slot.sav')).toString(), 'player save');
    assert.equal(Buffer.from(FS.readFile('/game/hl2/cfg/config_default.cfg')).toString(), 'default bindings');
    FS.writeFile('/game/hl2/cfg/config_default.cfg', 'edited defaults');
    assert.deepEqual(FS.persisted('/save/hl2'), { '/save/hl2/cfg/config.cfg': 'player bindings', '/save/hl2/cfg/empty.cfg': '',
      '/save/hl2/save/slot.sav': 'player save', '/save/hl2/cfg/config_default.cfg': 'edited defaults' });
  }
  process.stdout.write('adapter regression: symlinked cfg/save overlay preserves restored bytes and seeds writable serializable defaults\n');

  {
    const app = fixture(source, dataManifest, { owner: { 'hl2/gameinfo.txt': 'gameinfo', 'hl2/whole.bin': 'abcdef', 'hl2/grow.bin': 'growth' },
      beforeSyncRead(module, filename) { if (filename.endsWith('grow.bin')) module.HEAPU8 = new Uint8Array(4096); },
    });
    await app.init(); await app.start(); const module = app.modules[0], FS = module.FS;
    assert.equal(Buffer.from(FS.readFile('/game/hl2/whole.bin')).toString(), 'abcdef');
    assert.ok(module.HEAPU8.every(value => value === 0), 'JS readFile must not touch the native heap');
    const host = new Uint8Array(8), whole = FS.nodes.get('/game/hl2/whole.bin');
    whole.stream_ops.read({}, host.subarray(2), 1, 3, 1); assert.deepEqual([...host], [0, 0, 0, 98, 99, 100, 0, 0]);
    assert.throws(() => whole.stream_ops.read({}, module.HEAPU8, 0, 4, 0), /refusing heap write/);
    assert.throws(() => whole.stream_ops.read({}, new Uint8Array(2), 0, 4, 0), /exceeds/);
    const oldHeap = module.HEAPU8, grow = FS.nodes.get('/game/hl2/grow.bin');
    grow.stream_ops.read({}, oldHeap, 32, 6, 0);
    assert.equal(Buffer.from(module.HEAPU8.subarray(32, 38)).toString(), 'growth');
    assert.ok(oldHeap.every(value => value === 0), 'native I/O refreshes the grown heap instead of the stale view');
  }
  process.stdout.write('adapter regression: separate JS destinations, byte-offset views, native null guard and heap growth during owner I/O\n');

  for (const stage of ['factory', 'attach', 'index', 'main']) {
    const app = fixture(source, dataManifest, { failures: { [stage]: 1 } }); await app.init();
    await assert.rejects(app.start(), new RegExp('fixture ' + stage + ' failure'));
    assert.equal(app.adapter.readEngineState(), 'crashed'); assert.equal(app.adapter.persistAttached(), false);
    assert.ok(!app.calls.includes('show:menu'));
    if (stage === 'index' || stage === 'main') assert.ok(app.calls.includes('destroy-mount'));
    if (stage === 'main') assert.ok(app.calls.includes('pause-loop'));
    await app.start(); assert.equal(app.adapter.readEngineState(), 'menu'); assert.equal(app.adapter.persistAttached(), true);
    assert.equal(app.calls.filter(call => call === 'factory').length, 2);
    assert.equal(app.calls.filter(call => call === 'main').length, stage === 'main' ? 2 : 1);
  }
  {
    let release;
    const app = fixture(source, dataManifest, { factoryWait: new Promise(resolve => { release = resolve; }) });
    await app.init(); const first = app.start(), second = app.start(); release(); await Promise.all([first, second]);
    await app.start(); assert.equal(app.calls.filter(call => call === 'factory').length, 1);
    assert.equal(app.calls.filter(call => call === 'attach').length, 1); assert.equal(app.calls.filter(call => call === 'main').length, 1);
  }
  for (const options of [{ noXHR: true }, { native: { callMain: undefined } }]) {
    const app = fixture(source, dataManifest, options); await app.init();
    await assert.rejects(app.start(), /cannot mount|entry point is missing/); assert.equal(app.adapter.readEngineState(), 'crashed');
    assert.ok(!app.calls.includes('main')); assert.ok(!app.calls.includes('show:menu'));
  }
  process.stdout.write('adapter regression: startup failure cleanup/retry, concurrent starts, and required runtime capabilities\n');

  {
    const app = fixture(source, dataManifest, { query: 'source-wasm-map=d1_trainstation_01', recipe: 'steam-legacy-loose-v1' });
    await app.init(); await app.start();
    assert.equal(app.adapter.readEngineState(), 'menu'); assert.equal(app.timers.length, 0);
    assert.ok(!app.calls.includes('cwrap')); assert.match(app.logs.join('\n'), /lacks safe map-start diagnostics/);
    assert.ok(!app.calls.some(call => call.startsWith('map:')));
    app.adapter.preferencesChanged({ playerName: 'Gordon', profile: 'quality' });
    app.adapter.pointerMove({ x: 10, y: 20, captured: false });
    app.adapter.pointerButton({ x: 10, y: 20, button: 0, pressed: true });
    app.adapter.inputCaptureChanged(false);
    assert.equal(app.adapter.execClientCmd('status'), false);
    assert.ok(!app.calls.some(call => call.startsWith('ccall:')), 'absent optional exports never reach ccall');
  }
  {
    const app = fixture(source, dataManifest, { native: { _source_wasm_read_map_phase() { throw Error('fixture optional phase failure'); } } });
    await app.init(); await app.start(); assert.equal(app.adapter.readEngineState(), 'menu');
  }
  for (const readyEventually of [true, false]) {
    let ready = false;
    const app = fixture(source, dataManifest, { query: 'source-wasm-map=d1_trainstation_01',
      native: { _source_wasm_mod_ready: () => ready ? 1 : 0, _source_wasm_start_map() {} },
    });
    await app.init(); await app.start(); app.tick(); assert.ok(!app.calls.some(call => call.startsWith('map:')));
    ready = readyEventually; app.tick(120000);
    assert.equal(app.calls.filter(call => call.startsWith('map:')).length, readyEventually ? 1 : 0);
    assert.equal(app.timers.length, 0);
    if (!readyEventually) assert.match(app.logs.join('\n'), /did not become ready/);
  }
  process.stdout.write('adapter regression: missing/throwing optional exports and map readiness success/timeout\n');

  {
    let state = 1;
    const preferences = [];
    const app = fixture(source, dataManifest, { native: {
      _source_wasm_read_engine_state: () => state,
      _source_wasm_set_player_name() {}, _source_wasm_set_cvar() {},
      ccall(name, _result, _types, values) { preferences.push([name, ...values]); },
    } });
    await app.init(); await app.start(); app.adapter.preferencesChanged({ playerName: '<Gordon>', profile: 'quality' });
    assert.deepEqual(preferences, [], 'native cvars are not touched while modules are loading');
    state = 2; app.adapter.readEngineState();
    assert.deepEqual(preferences, [['source_wasm_set_player_name', 'Gordon'], ['source_wasm_set_cvar', 'mat_picmip', '-1'],
      ['source_wasm_set_cvar', 'r_rootlod', '0'], ['source_wasm_set_cvar', 'mat_reducefillrate', '0']]);
    app.adapter.readEngineState(); assert.equal(preferences.length, 4, 'state polling does not continually reset preferences');
  }
  process.stdout.write('adapter regression: coherent loose recipe and preferences deferred until native initialization\n');

  {
    const heap = new Int32Array(new SharedArrayBuffer(64)), notifications = [];
    const app = fixture(source, dataManifest, {
      native: { sourceWasmRuntime: 'pthread-side-module-v1', HEAP32: heap, _source_wasm_read_engine_state: undefined },
      owner: { 'hl2/gameinfo.txt': 'gameinfo', 'hl2/maps/d1_trainstation_01.bsp': 'synthetic map' },
      atomics: { store: Atomics.store, notify(array, index) { notifications.push(index); return Atomics.notify(array, index); } },
      onMain(module) {
        Atomics.store(heap, 2, 1);
        assert.equal(module.downloadMap(2, 'd1_trainstation_01'), true, 'map handler and owner mounts exist before native main');
        assert.equal(Atomics.load(heap, 2), 0);
      },
    });
    await app.init(); await app.start(); const module = app.modules[0];
    assert.equal(app.adapter.readEngineState(), 'loading', 'side-module marker does not invent a native state');
    for (const flag of ['-nosound', '-noasync', '-NoQueuedPacketThread']) assert.ok(!module.launchArgs.includes(flag), flag);
    assert.equal(typeof module.downloadMap, 'function');
    const requests = app.requests.length;
    for (const mapName of ['d1_trainstation_01', 'maps/d1_trainstation_01.bsp', 'D1_TRAINSTATION_01.BSP']) {
      Atomics.store(heap, 3, 1);
      assert.equal(module.downloadMap(3, mapName), true);
      assert.equal(Atomics.load(heap, 3), 0);
    }
    for (const mapName of ['not_installed', '../cfg/config', 'maps/../../escape.bsp']) {
      Atomics.store(heap, 4, 1);
      assert.equal(module.downloadMap(4, mapName), false);
      assert.equal(Atomics.load(heap, 4), 0, 'failed lookup must release the waiting native thread');
    }
    const lookup = module.FS.analyzePath;
    module.FS.analyzePath = () => { throw Error('fixture map lookup failure'); };
    Atomics.store(heap, 5, 1); assert.equal(module.downloadMap(5, 'd1_trainstation_01'), false); assert.equal(Atomics.load(heap, 5), 0);
    module.FS.analyzePath = lookup;
    const count = notifications.length; heap.fill(1);
    for (const index of [-1, heap.length, 1.5, NaN, '3']) assert.equal(module.downloadMap(index, 'd1_trainstation_01'), false);
    assert.ok(heap.every(value => value === 1), 'invalid lock indices never write to shared memory');
    assert.equal(notifications.length, count);
    const grownHeap = new Int32Array(new SharedArrayBuffer(128)); module.HEAP32 = grownHeap;
    Atomics.store(grownHeap, 20, 1); assert.equal(module.downloadMap(20, 'd1_trainstation_01'), true);
    assert.equal(Atomics.load(grownHeap, 20), 0, 'handoffs use the current heap after memory growth');
    assert.deepEqual(notifications, [2, 3, 3, 3, 4, 4, 4, 5, 20]);
    assert.equal(app.requests.length, requests, 'map handoff only inspects already-mounted files');
    assert.match(app.logs.join('\n'), /not mounted.*not_installed/); assert.match(app.logs.join('\n'), /Map lookup failed/);
  }
  {
    const app = fixture(source, dataManifest); await app.init(); await app.start(); const module = app.modules[0];
    assert.equal(module.downloadMap, undefined);
    for (const flag of ['-nosound', '-noasync', '-NoQueuedPacketThread']) assert.ok(module.launchArgs.includes(flag), flag);
    const invalid = fixture(source, dataManifest, { native: { sourceWasmRuntime: 'pthread-side-module-v1', HEAP32: new Int32Array(16) } });
    await invalid.init(); await assert.rejects(invalid.start(), /requires a shared Int32 heap/);
    assert.ok(!invalid.calls.includes('main'), 'invalid shared-memory runtime cannot reach a waiting native thread');
  }
  process.stdout.write('adapter regression: side-module map locks release on mounted/missing/invalid/error paths, no extra I/O, isolated audio/thread args\n');

  function bridgeHeap(module, write = 0) {
    const memory = new SharedArrayBuffer(16384), heap = new Int32Array(memory), base = 16;
    module.HEAP32 = heap; module.HEAPU8 = new Uint8Array(memory);
    heap.set([0x53574231, 1, 16, 512, write, write, 0, 0], base);
    return { heap, base, address: base * 4 };
  }
  function consume(module, accepted = 1) {
    const heap = module.HEAP32, base = 16;
    const read = Atomics.load(heap, base + 5) >>> 0, write = Atomics.load(heap, base + 4) >>> 0;
    if (read === write) return null;
    assert.ok(((write - read) >>> 0) <= 16, 'native consumer never observes more than ring capacity');
    const slot = base + 8 + (read % 16) * 128;
    const entry = [heap[slot], Buffer.from(heap.buffer, (slot + 2) * 4, heap[slot + 1]).toString('utf8')];
    const next = (read + 1) >>> 0;
    Atomics.store(heap, base + 5, next | 0);
    module.sourceWasmCommandResult(next, accepted);
    return entry;
  }
  const sideNative = () => ({ sourceWasmRuntime: 'pthread-side-module-v1', HEAP32: new Int32Array(new SharedArrayBuffer(16384)),
    _source_wasm_read_engine_state() { throw Error('cross-thread state access'); },
    _source_wasm_read_capture_intent() { throw Error('cross-thread intent access'); },
    _source_wasm_pause() { throw Error('cross-thread pause'); },
    _source_wasm_set_player_name() {}, _source_wasm_set_cvar() {}, _source_wasm_client_cmd() {},
    _source_wasm_pointer() {}, _source_wasm_pointer_button() {},
  });
  {
    const app = fixture(source, dataManifest, { native: sideNative(), onMain(module) {
      const { address } = bridgeHeap(module);
      assert.equal(typeof module.sourceWasmState, 'function', 'state callback exists before main');
      assert.equal(module.sourceWasmBridgeReady(address, 8224, 1), true);
      assert.equal(module.sourceWasmState(1, 1, 0), true);
    } });
    await app.init(); await app.start(); const module = app.modules[0], heap = module.HEAP32;
    assert.equal(app.adapter.readEngineState(), 'loading');
    app.adapter.preferencesChanged({ playerName: '<Gordon>', profile: 'quality' });
    assert.equal(consume(module), null, 'loading does not enqueue preferences');
    assert.equal(module.sourceWasmState(2, 2, 0), true);
    assert.equal(app.adapter.readEngineState(), 'menu');
    assert.deepEqual(consume(module), [2, 'Gordon\nquality']);
    assert.ok(app.calls.includes('state:menu'), 'worker reports update the shell without polling');
    assert.equal(app.adapter.execClientCmd('echo café'), true);
    assert.equal(app.adapter.readEngineState(), 'menu', 'command acceptance never changes native state');
    assert.deepEqual(consume(module), [1, 'echo café']);
    for (const command of ['', 'x'.repeat(504), 'é'.repeat(252), 'nul\0byte']) assert.equal(app.adapter.execClientCmd(command), false);
    assert.equal(app.adapter.execClientCmd('x'.repeat(503)), true); assert.deepEqual(consume(module), [1, 'x'.repeat(503)]);
    for (let i = 0; i < 16; ++i) assert.equal(app.adapter.execClientCmd('echo ' + i), true);
    assert.equal(app.adapter.execClientCmd('overflow'), false);
    app.adapter.preferencesChanged({ playerName: 'Alyx', profile: 'performance' });
    assert.equal(module.sourceWasmState(3, 3, 1), true);
    app.adapter.captureLost();
    assert.equal(Atomics.load(heap, 16 + 6), 1, 'capture loss survives a full command ring');
    assert.equal(app.adapter.readEngineState(), 'gameplay', 'pause remains a request until native menu report');
    assert.equal(app.adapter.readCaptureIntent(), true);
    assert.deepEqual(consume(module), [1, 'echo 0']);
    for (let i = 1; i < 16; ++i) assert.deepEqual(consume(module), [1, 'echo ' + i]);
    assert.deepEqual(consume(module), [2, 'Alyx\nperformance'], 'new preferences retry when an acknowledgement frees capacity');
    Atomics.exchange(heap, 16 + 6, 0);
    assert.equal(module.sourceWasmState(4, 2, 0), true);
    assert.equal(app.adapter.readEngineState(), 'menu'); assert.equal(app.adapter.readCaptureIntent(), false);
    assert.equal(module.sourceWasmState(5, 4, 0), true); assert.equal(app.adapter.readEngineState(), 'paused');
    for (const args of [[4, 3, 1], [5, 3, 1], [6, 2, 1], [6, 100, 0], [NaN, 3, 1]]) assert.equal(module.sourceWasmState(...args), false);
    assert.equal(app.adapter.readEngineState(), 'paused', 'stale/invalid snapshots cannot overwrite native truth');
    app.adapter.pointerMove({ movementX: 1, movementY: 2, captured: true });
    app.adapter.pointerButton({ x: 1, y: 2, pressed: true }); app.adapter.inputCaptureChanged(false);
    assert.ok(!app.calls.some(call => call.startsWith('ccall:')), 'side mode never calls game globals from the browser thread');
    assert.equal(module.sourceWasmState(6, 6, 0), true);
    assert.equal(app.adapter.execClientCmd('status'), false); assert.equal(module.sourceWasmState(7, 3, 1), false);
    assert.equal(app.adapter.readEngineState(), 'crashed');
  }
  {
    const app = fixture(source, dataManifest, { native: sideNative(), onMain(module) {
      const { heap, address } = bridgeHeap(module, -2);
      for (const args of [[0, 8224, 1], [address + 1, 8224, 1], [address, 100, 1], [address, 8224, 2], [16380, 8224, 1]]) {
        assert.equal(module.sourceWasmBridgeReady(...args), false);
      }
      heap[16] = 0; assert.equal(module.sourceWasmBridgeReady(address, 8224, 1), false); heap[16] = 0x53574231;
      assert.equal(module.sourceWasmState(1, 3, 1), false, 'no native state is accepted before validated registration');
      assert.equal(module.sourceWasmBridgeReady(address, 8224, 1), true);
      assert.equal(module.sourceWasmBridgeReady(address, 8224, 1), false);
    } });
    await app.init(); await app.start(); const module = app.modules[0];
    for (const command of ['near wrap', 'wrap', 'after wrap']) { assert.equal(app.adapter.execClientCmd(command), true); assert.deepEqual(consume(module), [1, command]); }
    assert.equal(Atomics.load(module.HEAP32, 20), 1);
    const old = module.HEAP32, grown = new Int32Array(new SharedArrayBuffer(32768)); grown.set(old);
    module.HEAP32 = grown; module.HEAPU8 = new Uint8Array(grown.buffer);
    assert.equal(app.adapter.execClientCmd('grown'), true); assert.deepEqual(consume(module, 0), [1, 'grown']);
    assert.equal(Atomics.load(old, 20), 1, 'new commands use current shared heap views');
    assert.match(app.logs.join('\n'), /Native command .* was rejected/);
    assert.equal(module.sourceWasmCommandResult(400, 1), false);
    assert.equal(typeof module.factoryOptions.onAbort, 'function', 'worker abort callback exists during factory/pool creation');
    module.factoryOptions.onAbort('fixture native fatal error');
    assert.equal(app.adapter.readEngineState(), 'crashed');
    assert.equal(module.sourceWasmState(2, 3, 1), false);
  }
  {
    const app = fixture(source, dataManifest, { native: sideNative(), failures: { main: 1 }, onMain(module) {
      const { address } = bridgeHeap(module); module.sourceWasmBridgeReady(address, 8224, 1);
    } });
    await app.init(); await assert.rejects(app.start(), /fixture main failure/); const failed = app.modules[0];
    assert.equal(failed.sourceWasmState(1, 3, 1), false); assert.equal(app.adapter.readEngineState(), 'crashed');
    await app.start(); assert.equal(failed.sourceWasmState(2, 3, 1), false);
    failed.factoryOptions.onAbort('stale failure');
    assert.equal(app.adapter.readEngineState(), 'loading', 'retry receives no state from the failed module');
    app.adapter.captureLost(); assert.equal(app.adapter.readEngineState(), 'loading');
  }
  process.stdout.write('adapter regression: worker state truth, bounded atomic mailbox, pause under backpressure, preference retry, UTF-8 limits, wrap/growth and stale module isolation\n');
};
module.exports.fixture = fixture;
