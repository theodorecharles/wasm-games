'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const adapterSource = fs.readFileSync(process.argv[2] || path.join(root, 'games/rtcw/site/game-adapter.js'), 'utf8');
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
        env.requests.push(node.src);
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
    dispatch(type, event) {
      for (const listener of listeners[type] || []) listener(event);
    },
    visibilityState: 'visible',
    canvas
  };
}

async function testVariant(variant, basePath = '/', protocol = 'http:') {
  const env = { requests: [] };
  const publicUrl = value => basePath + value.replace(/^\/+/, '');
  const timers = [];
  const document = createDocument(env);
  const frames = new Map();
  let nextFrame = 0;
  let now = Date.now();
  let runtimeState = 0;
  let captureArmed = false;
  const window = {
    setTimeout,
    clearTimeout,
    setInterval(fn, delay) { const timer = setInterval(fn, delay); timers.push(timer); return timer; },
    clearInterval,
    requestAnimationFrame(fn) { frames.set(++nextFrame, fn); return nextFrame; },
    cancelAnimationFrame(id) { frames.delete(id); },
    addEventListener() {},
    document
  };
  const shown = [];
  const engine = {
    _RTCW_BrowserJoinTarget: () => 1,
    _RTCW_BrowserJoinRequested: () => 0,
    _RTCW_BrowserArmCaptureIntent: () => { captureArmed = true; },
    _RTCW_BrowserCancelCaptureIntent: () => { captureArmed = false; },
    _RTCW_BrowserCaptureIntent: () => captureArmed && (runtimeState === 1 || runtimeState === 4),
    _RTCW_BrowserJoinServer: (addressPtr) => {
      const address = engine.strings[addressPtr - 1];
      assert.equal(address, arena.MANAGED_CONNECT);
      engine.joined = address;
      return 1;
    },
    _RTCW_BrowserSetPlayerName: () => 1,
    _RTCW_BrowserRuntimeState: () => runtimeState,
    _RTCW_BrowserConfigureControls: () => 1,
    _RTCW_BrowserApplyPreferences: () => 1,
    _RTCW_BrowserWriteConfiguration: () => 1,
    _RTCW_BrowserResize: () => 1,
    _RTCW_BrowserRenderWidth: () => 1280,
    _RTCW_BrowserRenderHeight: () => 720,
    _RTCW_BrowserControlsMask: () => 0,
    _RTCW_BrowserSetInputCaptured: captured => { if (captured) captureArmed = false; },
    stringToNewUTF8(value) {
      engine.strings = engine.strings || [];
      engine.strings.push(String(value));
      return engine.strings.length;
    },
    _free() {},
    FS: {},
    callMain(args) { engine.args = Array.from(args); }
  };

  let wakeStatus = { state: 'running', map: 'mp_depot', gametype: 5 };
  const captureRequests = [];
  const context = {
    variant,
    elements: { canvas: document.canvas },
    log() {},
    setLoading() {},
    setEngineState(state, options) {
      context.state = state;
      if (options?.capture) captureRequests.push({ state, event: options.event });
    },
    showRuntime(state) { shown.push(state); context.surface = state; },
    persistence: {
      root: `/save/${variant}`,
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
      publicUrl,
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
    URL,
    location: { protocol, host: '127.0.0.1:18590', href: `${protocol}//127.0.0.1:18590${basePath}` },
    fetch: async (url) => {
      env.requests.push(url);
      if (String(url).includes('wasm-game-data.json')) {
        return {
          ok: true,
          json: async () => ({
            namespace: 'rtcw',
            version: 'v1',
            variants: { [variant]: { files: [] } }
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
    performance: { now: () => now },
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
  const suffix = variant === 'rtcw-sp' ? 'sp' : 'mp';
  assert.deepEqual(env.requests.sort(), ['wasm-game-data.json', `iowolf${suffix}.js`,
    `menus/${suffix}_wasm.pk3`, ...['cgame', 'qagame', 'ui'].map(name => `qvm/${suffix}/${name}.${suffix}.qvm`)]
    .map(value => basePath + value).sort());
  assert.equal(sandbox.Module.locateFile(`iowolf${suffix}.wasm`), `${basePath}iowolf${suffix}.wasm`);
  assert.equal(sandbox.Module.locateFile('/runtime.worker.js'), `${protocol}//127.0.0.1:18590${basePath}runtime.worker.js`);
  if (variant === 'rtcw-mp') assert.equal(sandbox.Module.websocket.url, `${protocol === 'https:' ? 'wss:' : 'ws:'}//127.0.0.1:18590${basePath}ws`);
  const argument = name => engine.args[engine.args.indexOf(name) + 1];
  assert.equal(argument('fs_homepath'), `/save/${variant}`);
  assert.equal(argument('fs_basepath'), '/game');
  assert.equal(argument('r_ext_multitexture'), variant === 'rtcw-sp' ? '1' : '0');
  assert.equal(argument('r_ignoreFastPath'), variant === 'rtcw-sp' ? '0' : '1');
  assert.equal(argument('r_primitives'), '2');
  assert.equal(argument('vm_ui'), '2');

  if (variant === 'rtcw-mp') {
    await adapter.pointerButton({ button: 0, pressed: true }, { type: 'pointerup' });
    for (let i = 0; i < 20 && !engine.joined; i += 1) {
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    assert.equal(engine.joined, arena.MANAGED_CONNECT);
    assert.equal(arena.joinKeepsRuntime(shown), true);
    assert.ok(!shown.includes('launcher'));

    console.log('RTCW MP adapter JOIN stays off the launcher');
  }

  async function frame(elapsed = 16) {
    now += elapsed;
    const callbacks = Array.from(frames.values());
    frames.clear();
    for (const callback of callbacks) callback(now);
    await Promise.resolve();
  }
  function resetCapture(state) {
    runtimeState = 1;
    adapter.readEngineState(); // Clear the completed managed-join state.
    adapter.inputCaptureChanged(true);
    runtimeState = state;
    adapter.inputCaptureChanged(false);
    captureRequests.length = 0;
  }

  resetCapture(2);
  document.dispatch('keydown', { key: 'Escape' });
  const resumeKey = { key: 'Escape' };
  document.dispatch('keyup', resumeKey);
  await Promise.resolve();
  assert.equal(captureRequests.length, 0, 'a still-paused native frame must not capture');
  runtimeState = 1; // SDL processes the queued Escape on its next frame.
  await frame();
  assert.equal(captureRequests.length, 1, 'Escape resume must capture after the native frame advances');
  assert.equal(captureRequests[0].event, resumeKey);

  resetCapture(2);
  adapter.pointerButton({ button: 0, pressed: true }, { type: 'pointerdown' });
  const resumeClick = { type: 'pointerup' };
  adapter.pointerButton({ button: 0, pressed: false }, resumeClick);
  await Promise.resolve();
  runtimeState = 1; // Save/Load or Resume closes the overlay asynchronously.
  await frame();
  assert.equal(captureRequests.length, 1, 'paused-menu resume must retain the pointer gesture');
  assert.equal(captureRequests[0].event, resumeClick);

  resetCapture(0);
  document.dispatch('keydown', { key: 'Enter' });
  document.dispatch('keyup', { key: 'Enter' });
  await Promise.resolve();
  await frame(2100); // Ordinary menu interaction never began loading.
  runtimeState = 1;
  await frame();
  assert.equal(captureRequests.length, 0, 'an expired gesture cannot capture a later transition');
  assert.equal(frames.size, 0, 'capture polling is bounded');

  resetCapture(1);
  document.dispatch('keydown', { key: 'Escape' });
  runtimeState = 2;
  document.dispatch('keyup', { key: 'Escape' });
  await Promise.resolve();
  await frame();
  assert.equal(captureRequests.length, 0, 'opening the pause menu must not recapture');
  console.log(`${variant} delayed native Resume preserves capture without trapping menu input`);
  timers.forEach(clearInterval);
  console.log(`${variant} renderer arguments preserve its GL backend`);
}

(async () => {
  for (const variant of ['rtcw-mp', 'rtcw-sp']) await testVariant(variant);
  for (const variant of ['rtcw-mp', 'rtcw-sp']) await testVariant(variant, variant === 'rtcw-sp' ? '/rtcw/' : '/rtcw-mp/', 'https:');
  process.exit(0);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
