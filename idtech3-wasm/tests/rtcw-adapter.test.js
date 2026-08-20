'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const adapterSource = fs.readFileSync(path.join(root, 'games/rtcw/site/game-adapter.js'), 'utf8');
const arena = require('../games/rtcw/server/arena');

function createDocument(env) {
  const dataset = {};
  const canvas = {
    id: '',
    width: 1280,
    height: 720,
    addEventListener() {}
  };
  const listeners = {};
  return {
    documentElement: { dataset },
    body: {
      appendChild(node) {
        queueMicrotask(() => {
          const module = env.globalThis && env.globalThis.Module;
          if (module) {
            Object.assign(module, env.engine || {});
            if (typeof module.onRuntimeInitialized === 'function') module.onRuntimeInitialized();
          }
          if (node && node.onload) node.onload();
        });
      }
    },
    createElement(name) {
      return { name, src: '', async: false, onerror: null, onload: null };
    },
    addEventListener(type, fn) {
      listeners[type] = listeners[type] || [];
      listeners[type].push(fn);
    },
    canvas
  };
}

(async () => {
  const env = {};
  const document = createDocument(env);
  const window = {
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    addEventListener() {},
    document
  };
  const shown = [];
  const engine = {
    _RTCW_BrowserJoinTarget: () => 1,
    _RTCW_BrowserJoinRequested: () => 0,
    _RTCW_BrowserArmCaptureIntent: () => 1,
    _RTCW_BrowserCancelCaptureIntent: () => 1,
    _RTCW_BrowserJoinServer: (addressPtr) => {
      const address = engine.strings[addressPtr - 1];
      assert.equal(address, arena.MANAGED_CONNECT);
      engine.joined = address;
      return 1;
    },
    _RTCW_BrowserSetPlayerName: () => 1,
    _RTCW_BrowserRuntimeState: () => 0,
    _RTCW_BrowserConfigureControls: () => 1,
    _RTCW_BrowserApplyPreferences: () => 1,
    _RTCW_BrowserWriteConfiguration: () => 1,
    _RTCW_BrowserResize: () => 1,
    _RTCW_BrowserRenderWidth: () => 1280,
    _RTCW_BrowserRenderHeight: () => 720,
    _RTCW_BrowserControlsMask: () => 0,
    _RTCW_BrowserSetInputCaptured: () => 1,
    stringToNewUTF8(value) {
      engine.strings = engine.strings || [];
      engine.strings.push(String(value));
      return engine.strings.length;
    },
    _free() {},
    FS: {},
    callMain() {}
  };

  let wakeStatus = { state: 'running', map: 'mp_depot', gametype: 5 };
  const context = {
    variant: 'rtcw-mp',
    elements: { canvas: document.canvas },
    log() {},
    setLoading() {},
    setEngineState(state) { context.state = state; },
    showRuntime(state) { shown.push(state); context.surface = state; },
    persistence: {
      root: '/save/rtcw-mp',
      attach: async () => ({}),
      markDirty() {},
      save: async () => true
    },
    preferences: {
      values: () => ({ playerName: 'Paloooz', qualityProfile: 'balanced', targetFps: 60, dynamicQuality: false })
    },
    dataClient: {
      load: async () => ({ entries: [] })
    },
    framework: {
      createOwnerDataSet: () => ({}),
      createWakeClient() {
        return {
          ensureRunning: async () => wakeStatus
        };
      },
      createQualityController() {
        return { start() {}, setEnabled() {}, setTargetFps() {} };
      },
      mountOwnerFiles: async () => ({})
    },
    shell: {
      resumeAudio() {},
      resize() {},
      setDisplay(next) {
        context.display = next;
        return {};
      }
    }
  };

  const sandbox = {
    console,
    document,
    window,
    location: { protocol: 'http:', host: '127.0.0.1:18590' },
    fetch: async (url) => {
      if (String(url).includes('wasm-game-data.json')) {
        return {
          ok: true,
          json: async () => ({
            namespace: 'rtcw',
            version: 'v1',
            variants: { 'rtcw-mp': { files: [] } }
          })
        };
      }
      return {
        ok: true,
        arrayBuffer: async () => Uint8Array.from([0x45, 0x14, 0x72, 0x12, 0, 0, 0, 0]).buffer
      };
    },
    File: class File {
      constructor(parts, name) { this.name = name; this.size = 8; }
    },
    performance: { now: () => Date.now() },
    globalThis: null
  };
  sandbox.globalThis = sandbox;
  env.globalThis = sandbox;
  env.engine = engine;
  sandbox.__readString = (ptr) => engine.strings[ptr - 1];
  Object.assign(sandbox, {
    setTimeout, clearTimeout, setInterval, clearInterval, queueMicrotask, Uint8Array
  });

  vm.runInNewContext(adapterSource, sandbox, { filename: 'game-adapter.js' });
  const adapter = sandbox.globalThis.WasmGameAdapter;
  assert.equal(typeof adapter.init, 'function');
  await adapter.init(context);
  assert.equal(context.display.displayMode, '4:3');
  assert.equal(context.display.fit, 'contain');

  sandbox.globalThis.Module = engine;
  Object.assign(engine, sandbox.globalThis.Module);
  sandbox.globalThis.Module = engine;
  await adapter.start();

  await adapter.pointerButton({ button: 0, pressed: true }, { type: 'pointerup' });
  for (let i = 0; i < 20 && !engine.joined; i += 1) {
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  assert.equal(engine.joined, arena.MANAGED_CONNECT);
  assert.equal(arena.joinKeepsRuntime(shown), true);
  assert.ok(!shown.includes('launcher'));

  console.log('RTCW MP adapter JOIN stays off the launcher');
  process.exit(0);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
