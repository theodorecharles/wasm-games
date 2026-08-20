#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const repo = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(repo, 'web/wasm-game.json'), 'utf8'));
const dataManifest = JSON.parse(fs.readFileSync(path.join(repo, 'web/wasm-game-data.json'), 'utf8'));

function baseHarness(variant) {
  const listeners = new Map();
  const canvasListeners = new Map();
  const intervals = [];
  const stateChanges = [];
  const lifecycle = [];
  let shellState = 'launcher';
  let resumeAudioCalls = 0;
  let persistenceDirty = 0;
  let persistenceSaves = 0;
  const displays = [];
  const canvas = {
    addEventListener(type, listener) {
      const current = canvasListeners.get(type) || [];
      current.push(listener);
      canvasListeners.set(type, current);
    },
    focus() {}
  };
  const sandbox = {
    URLSearchParams,
    console,
    queueMicrotask,
    performance: { now: () => 1000 },
    location: { search: '', href: 'http://localhost/' },
    document: {
      pointerLockElement: null,
      documentElement: { dataset: {} },
      createElement: () => ({}),
      head: { appendChild() {} },
      addEventListener(type, listener) {
        const current = listeners.get(type) || [];
        current.push(listener);
        listeners.set(type, current);
      }
    },
    window: {
      innerWidth: 1280, innerHeight: 720,
      visualViewport: { width: 1280, height: 720 },
      setInterval(callback) { intervals.push(callback); return intervals.length; },
      clearInterval() {}, setTimeout(callback) { callback(); return 1; }, clearTimeout() {}
    }
  };
  sandbox.globalThis = sandbox;
  const context = {
    variant,
    config: manifest.variants[variant],
    elements: { canvas },
    preferences: { values: () => ({
      playerName: 'Test Ranger', qualityProfile: variant === 'quake' ? 'modernized' : 'ultra',
      targetFps: 120, dynamicQuality: true
    }) },
    framework: {
      createOwnerDataSet: policy => policy,
      mountOwnerFiles: async () => {},
      createQualityController(options) {
        context.qualityOptions = options;
        return { start() { options.apply(options.profiles[0], { reason: 'start' }); }, stop() {} };
      }
    },
    dataClient: {
      load: async policy => ({ entries: policy.files.map(file => ({ cached: true, policy: file })) })
    },
    persistence: {
      root: `/persistent/idtech2/${variant}`,
      async attach(FS, options) {
        assert.ok(FS, `${variant} exposes Emscripten FS to persistence`);
        assert.equal(options.root, `/persistent/idtech2/${variant}`);
        lifecycle.push('attach');
        return { root: options.root };
      },
      markDirty() { persistenceDirty += 1; },
      async save() { persistenceSaves += 1; return true; }
    },
    shell: {
      engineState: () => shellState,
      inputCaptured: () => false,
      async resumeAudio() { resumeAudioCalls += 1; },
      setDisplay(display) { displays.push(display); },
      resize() { return { requestedWidth: 1280, requestedHeight: 720 }; }
    },
    setLoading() {}, log() {},
    setEngineState(state, options) {
      shellState = state;
      stateChanges.push({ state, capture: options?.capture === true, event: options?.event });
    },
    showRuntime(state) { shellState = state || shellState; }
  };
  return {
    sandbox, context, listeners, canvasListeners, intervals, stateChanges, lifecycle, displays,
    shellState: () => shellState, resumeAudioCalls: () => resumeAudioCalls,
    persistenceDirty: () => persistenceDirty, persistenceSaves: () => persistenceSaves
  };
}

async function exerciseQuake() {
  const harness = baseHarness('quake');
  let nativeState = 0;
  let openMenuCalls = 0;
  let captureValue = -1;
  let mainArguments = null;
  const controllerButtons = [];
  const controllerLooks = [];
  let controllerReleases = 0;
  let configWrites = 0;
  let audioResumeCalls = 0;
  let menuDispatchCalls = 0;
  const resizes = [];
  const engineParts = {
    FS: { filesystems: { IDBFS: {} } },
    callMain(args) { harness.lifecycle.push('main'); mainArguments = args; },
    _Q1_BrowserRuntimeState: () => nativeState,
    _Q1_BrowserOpenMenu() { openMenuCalls += 1; nativeState = 0; },
    _Q1_BrowserSetInputCaptured(value) { captureValue = value; },
    _Q1_BrowserCaptureIntent: () => nativeState === 4 ? 1 : 0,
    _Q1_BrowserDispatchMenuKey(key) {
      menuDispatchCalls += 1;
      if (key === 13) nativeState = 4;
      return 1;
    },
    _Q1_BrowserResize(width, height) { resizes.push([width, height]); },
    _Q1_BrowserRenderWidth: () => 1280,
    _Q1_BrowserRenderHeight: () => 720,
    _Q1_BrowserModernized: () => 1,
    _Q1_BrowserPixelAspectX1000: () => 1000,
    _SNDDMA_BrowserCallbacks: () => 1,
    _SNDDMA_BrowserNonzeroCallbacks: () => 1,
    _SNDDMA_BrowserAudioState: () => 2,
    _SNDDMA_BrowserResumeAudio() { audioResumeCalls += 1; return 2; },
    _Q1_BrowserControlsValid: () => 1,
    _Q1_BrowserControlsMask: () => 255,
    _Q1_BrowserSensitivityX100: () => 800,
    _Q1_BrowserDemoPlayback: () => 0,
    _Q1_BrowserMenuActive: () => 1,
    _Q1_BrowserControllerKey(key, down) { controllerButtons.push([key, down]); },
    _Q1_BrowserControllerLook(x, y) { controllerLooks.push([x, y]); },
    _Q1_BrowserControllerReleaseAll() { controllerReleases += 1; },
    _Q1_BrowserWriteConfiguration() { configWrites += 1; harness.sandbox.Module.quakePersistenceChanged(false); }
  };
  harness.sandbox.fetch = async () => ({ ok: true, json: async () => dataManifest });
  harness.sandbox.document.head.appendChild = script => {
    Object.assign(harness.sandbox.Module, engineParts);
    script.onload();
    harness.sandbox.Module.onRuntimeInitialized();
  };
  vm.runInNewContext(fs.readFileSync(path.join(repo, 'web/quake-adapter.js'), 'utf8'), harness.sandbox,
    { filename: 'web/quake-adapter.js' });
  const adapter = harness.sandbox.WasmGameAdapter;
  await adapter.init(harness.context);
  assert.equal(harness.context.elements.canvas.id, 'canvas',
    'Quake exposes the selector required by Emscripten SDL before native startup');
  await adapter.start(harness.context);
  assert.deepEqual(harness.lifecycle, ['attach', 'main'], 'Quake restores IDBFS before native main');
  assert.deepEqual(Array.from(mainArguments),
    ['-userdir', '/persistent/idtech2/quake', '+name', 'Test Ranger', '-modernized'],
    'Quake hands its writable root, sanitized identity, and selected native profile to main');
  assert.equal(harness.displays.at(-1).displayMode, 'dynamic');
  assert.equal(harness.displays.at(-1).pixelated, false);
  assert.deepEqual(resizes.at(-1), [1280, 720], 'modernized Quake starts at the current dynamic viewport');
  assert.equal(audioResumeCalls, 1, 'Quake resumes the SDL-owned AudioContext after native startup');
  assert.equal(harness.resumeAudioCalls(), 2, 'Quake asks the framework to resume audio before and after startup');
  harness.sandbox.Module.quakePersistenceChanged(true);
  await Promise.resolve();
  assert.equal(harness.persistenceDirty(), 1);
  assert.equal(harness.persistenceSaves(), 1);
  harness.sandbox.document.visibilityState = 'hidden';
  for (const listener of harness.listeners.get('visibilitychange')) listener();
  await Promise.resolve();
  assert.equal(configWrites, 1, 'Quake writes native config before lifecycle flush');
  assert.equal(harness.persistenceDirty(), 2);
  assert.equal(harness.persistenceSaves(), 2);

  adapter.controllerChanged({ selection: 'auto', activeIndex: 0 });
  adapter.controllerFrame({ deltaMs: 16, actions: { forward: 1, jump: 1, lookX: 0.5, lookY: -0.25 } });
  assert.deepEqual(controllerButtons.slice(-2), [[1001, 1], [13, 1]], 'Quake adapter maps actions to native menu keys');
  nativeState = 1;
  adapter.controllerFrame({ deltaMs: 16, actions: { forward: 1, jump: 0, attack: 1, lookX: 0.5, lookY: -0.25 } });
  assert.ok(controllerReleases >= 1, 'Quake releases menu keys when native state changes');
  assert.ok(controllerButtons.some(call => call[0] === 1020 && call[1] === 1), 'Quake adapter maps trigger attack to native mouse one');
  assert.ok(controllerLooks.some(call => call[0] > 0 && call[1] < 0), 'Quake sends frame-scaled right-stick look to native mouse input');
  adapter.controllerChanged({ selection: 'disabled', activeIndex: 0 });
  assert.ok(controllerReleases >= 2, 'Quake releases controller-held input when disabled');

  nativeState = 1;
  harness.intervals.at(-1)();
  assert.equal(harness.shellState(), 'gameplay');
  nativeState = 3;
  harness.intervals.at(-1)();
  assert.equal(harness.shellState(), 'debrief');

  nativeState = 4;
  assert.equal(adapter.readEngineState(), 'loading');
  assert.equal(adapter.readCaptureIntent(), true);

  nativeState = 0;
  const event = {
    key: 'Enter', code: 'Enter', repeat: false, prevented: false, stopped: false,
    preventDefault() { this.prevented = true; },
    stopImmediatePropagation() { this.stopped = true; }
  };
  for (const listener of harness.listeners.get('keydown')) listener(event);
  assert.equal(menuDispatchCalls, 1, 'Quake dispatches the trusted menu key synchronously into native code');
  assert.equal(event.prevented, true);
  assert.equal(event.stopped, true, 'the delayed SDL copy of a directly dispatched menu key is suppressed');
  assert.equal(harness.stateChanges.at(-1).state, 'loading');
  assert.equal(harness.stateChanges.at(-1).capture, true);
  assert.equal(harness.stateChanges.at(-1).event, event);
  assert.equal(audioResumeCalls, 2, 'the trusted native menu transition resumes engine audio');
  const keyup = { ...event, prevented: false, stopped: false };
  for (const listener of harness.listeners.get('keyup')) listener(keyup);
  assert.equal(keyup.prevented, true);
  assert.equal(keyup.stopped, true);

  harness.intervals.at(-1)();
  assert.equal(harness.sandbox.document.documentElement.dataset.quakeAudioState, '2');
  assert.equal(harness.sandbox.document.documentElement.dataset.quakeRender, '1280x720');
  assert.equal(harness.sandbox.document.documentElement.dataset.quakeProfile, 'modernized');
  assert.equal(harness.sandbox.document.documentElement.dataset.quakeSensitivity, '8');
  assert.equal(harness.sandbox.document.documentElement.dataset.quakeDemoPlayback, 'false');
  assert.equal(harness.sandbox.document.documentElement.dataset.quakeMenuActive, 'true');
  adapter.resize({ requestedWidth: 900, requestedHeight: 650 });
  assert.deepEqual(resizes.at(-1), [900, 650], 'modernized Quake forwards immediate dynamic viewport changes');
  nativeState = 1;
  adapter.captureLost({}, harness.context);
  assert.equal(openMenuCalls, 1);
  assert.equal(harness.shellState(), 'menu');
  adapter.inputCaptureChanged(true);
  assert.equal(captureValue, 1);
}

async function exerciseQuake2() {
  const harness = baseHarness('quake2');
  let nativeState = 0;
  let ensureMenuCalls = 0;
  let captureValue = -1;
  const resizes = [];
  const qualities = [];
  let moduleOptions = null;
  let mainArguments = null;
  const controllerButtons = [];
  const controllerLooks = [];
  let controllerReleases = 0;
  let configWrites = 0;
  const engine = {
    FS: { filesystems: { IDBFS: {} } },
    callMain(args) { harness.lifecycle.push('main'); mainArguments = args; },
    _Q2Web_RuntimeState: () => nativeState,
    _Q2Web_CaptureIntent: () => nativeState === 4 ? 1 : 0,
    _Q2Web_SetInputCaptured(value) { captureValue = value; },
    _Q2Web_EnsureMenu() { ensureMenuCalls += 1; nativeState = 0; },
    _Q2Web_ResizeViewport(width, height) { resizes.push([width, height]); },
    _Q2Web_ApplyQuality(level) { qualities.push(level); },
    _Q2Web_AudioCallbacks: () => 1,
    _Q2Web_AudioNonzeroCallbacks: () => 1,
    _Q2Web_ControlsMask: () => 255,
    _Q2Web_RenderWidth: () => 1280,
    _Q2Web_RenderHeight: () => 720,
    _Q2Web_ViewWidth: () => 1280,
    _Q2Web_ViewHeight: () => 720,
    _Q2Web_FovX100: () => 10600,
    _Q2Web_FovY100: () => 7400,
    _Q2Web_ControllerKey(key, down) { controllerButtons.push([key, down]); },
    _Q2Web_ControllerLook(x, y) { controllerLooks.push([x, y]); },
    _Q2Web_ControllerReleaseAll() { controllerReleases += 1; },
    _Q2Web_WriteConfiguration() { configWrites += 1; moduleOptions.quake2PersistenceChanged(false); }
  };
  harness.sandbox.fetch = async target => String(target).endsWith('.json')
    ? { ok: true, json: async () => dataManifest }
    : { ok: true };
  harness.sandbox.document.head.appendChild = script => {
    harness.sandbox.createQuake2Module = async options => { moduleOptions = options; return engine; };
    script.onload();
  };
  vm.runInNewContext(fs.readFileSync(path.join(repo, 'engines/quake2/web/game-adapter.js'), 'utf8'), harness.sandbox,
    { filename: 'engines/quake2/web/game-adapter.js' });
  const adapter = harness.sandbox.WasmGameAdapter;
  await adapter.init(harness.context);
  assert.equal(harness.context.elements.canvas.id, 'canvas',
    'Quake II exposes the selector required by Emscripten SDL before native startup');
  await adapter.start(harness.context);
  assert.equal(moduleOptions.noInitialRun, true, 'Quake II defers native main until persistence restore');
  assert.equal(Object.hasOwn(moduleOptions, 'arguments'), false, 'Quake II cannot auto-run with pre-restore arguments');
  assert.deepEqual(harness.lifecycle, ['attach', 'main'], 'Quake II restores IDBFS before native main');
  assert.ok(mainArguments.includes('Test Ranger'), 'Quake II hands identity to native arguments');
  assert.ok(mainArguments.includes('120'), 'Quake II hands the FPS target to native arguments');
  assert.deepEqual(Array.from(mainArguments.slice(0, 4)), ['-datadir', '/data', '-userdir', '/persistent/idtech2/quake2']);
  moduleOptions.quake2PersistenceChanged(true);
  await Promise.resolve();
  assert.equal(harness.persistenceDirty(), 1);
  assert.equal(harness.persistenceSaves(), 1);
  harness.sandbox.document.visibilityState = 'hidden';
  for (const listener of harness.listeners.get('visibilitychange')) listener();
  await Promise.resolve();
  assert.equal(configWrites, 1, 'Quake II writes native config before lifecycle flush');
  assert.equal(harness.persistenceDirty(), 2);
  assert.equal(harness.persistenceSaves(), 2);
  assert.deepEqual(Array.from(harness.context.qualityOptions.profiles), ['ultra', 'high', 'medium']);
  assert.deepEqual(qualities, [2], 'Quake II applies the selected real quality ceiling');

  adapter.controllerChanged({ selection: 'auto', activeIndex: 2 });
  adapter.controllerFrame({ deltaMs: 20, actions: { backward: 1, jump: 1, lookX: -0.4, lookY: 0.3 } });
  assert.deepEqual(controllerButtons.slice(-2), [[1002, 1], [13, 1]], 'Quake II adapter maps actions to native menu keys');
  nativeState = 1;
  adapter.controllerFrame({ deltaMs: 20, actions: { backward: 1, jump: 0, attack: 1, lookX: -0.4, lookY: 0.3 } });
  assert.ok(controllerReleases >= 1, 'Quake II releases menu keys when native state changes');
  assert.ok(controllerButtons.some(call => call[0] === 1020 && call[1] === 1), 'Quake II adapter maps trigger attack to native mouse one');
  assert.ok(controllerLooks.some(call => call[0] < 0 && call[1] > 0), 'Quake II sends frame-scaled right-stick look to native mouse input');
  adapter.controllerChanged({ selection: 'auto', activeIndex: null });
  assert.ok(controllerReleases >= 2, 'Quake II releases controller-held input on disconnect');

  nativeState = 1;
  harness.intervals.at(-1)();
  assert.equal(harness.shellState(), 'gameplay');
  nativeState = 3;
  harness.intervals.at(-1)();
  assert.equal(harness.shellState(), 'debrief');

  nativeState = 4;
  assert.equal(adapter.readEngineState(), 'loading');
  assert.equal(adapter.readCaptureIntent(), true);

  nativeState = 1;
  const event = { key: 'Enter' };
  for (const listener of harness.listeners.get('keyup')) listener(event);
  await Promise.resolve();
  assert.equal(harness.stateChanges.at(-1).state, 'gameplay');
  assert.equal(harness.stateChanges.at(-1).capture, true);
  assert.equal(harness.stateChanges.at(-1).event, event);
  adapter.resize({ requestedWidth: 1111, requestedHeight: 777 });
  assert.deepEqual(resizes.at(-1), [1111, 777], 'Quake II resizes native rendering without a delayed adapter timer');
  adapter.captureLost({}, harness.context);
  assert.equal(ensureMenuCalls, 1);
  assert.equal(captureValue, 0);
  assert.equal(harness.shellState(), 'menu');
}

(async () => {
  assert.equal(manifest.fullscreen, true);
  assert.equal(manifest.identity, true);
  for (const variant of ['quake', 'quake2']) {
    assert.equal(manifest.variants[variant].pwa.icons.length, 2);
    assert.ok(manifest.variants[variant].icon);
    assert.equal(manifest.variants[variant].controller.mode, 'disabled');
    assert.equal(manifest.variants[variant].persistence.root, '/persistent/idtech2/{variant}');
    assert.ok(dataManifest.variants[variant].files.every(file => file.sha256));
  }
  assert.equal(manifest.variants.quake.displayMode, '4:3');
  assert.equal(manifest.variants.quake.menuCursor, 'none');
  assert.equal(manifest.variants.quake.nativeManaged, true);
  assert.deepEqual(manifest.variants.quake.profiles.map(profile => profile.value), ['original', 'modernized']);
  assert.equal(manifest.variants.quake2.displayMode, 'dynamic');
  assert.equal(manifest.variants.quake2.menuCursor, 'browser');
  assert.equal(manifest.variants.quake2.resizeTransition, 'immediate');
  assert.match(fs.readFileSync(path.join(repo, 'WinQuake/sys_emscripten.c'), 'utf8'), /cl\.intermission[\s\S]*return 3;/);
  const quakeSource = fs.readFileSync(path.join(repo, 'WinQuake/sys_emscripten.c'), 'utf8');
  assert.match(quakeSource, /scr_disabled_for_loading[\s\S]*return 4;/,
    'Quake must distinguish native loading from controllable gameplay');
  assert.match(quakeSource, /cls\.demoplayback[\s\S]*browser_capture_intent = false;[\s\S]*return 0;/,
    'Quake attract demos must not claim controllable gameplay or capture input');
  assert.match(quakeSource, /if \(browser_capture_intent && cls\.demoplayback\)[\s\S]*return 4;[\s\S]*if \(cls\.demoplayback\)/,
    'trusted New Game intent must win over stale attract-demo state until the next native frame');
  assert.match(quakeSource, /Q1_BrowserArmCaptureIntent[\s\S]*browser_capture_intent && Q1_BrowserRuntimeState\(\) == 4/,
    'Quake New Game/Load must expose native capture intent');
  assert.match(quakeSource, /Q1_BrowserDispatchMenuKey[\s\S]*M_Keydown\(K_ENTER\)/,
    'Quake must process trusted Enter synchronously before browser activation expires');
  assert.match(quakeSource, /wasm_browser_defaults_version[\s\S]*sensitivity", "8"/,
    'Quake must migrate once to fast WASD/mouselook defaults without overwriting later user config');
  assert.match(fs.readFileSync(path.join(repo, 'WinQuake/keys.c'), 'utf8'),
    /if \(\*keybindings\[i\]\)[\s\S]*fprintf \(f, "unbind/,
    'Quake config must retain explicitly unbound legacy look keys across reloads');
  assert.match(fs.readFileSync(path.join(repo, 'WinQuake/vid_emscripten.c'), 'utf8'),
    /Q1_BrowserResize[\s\S]*MAXWIDTH[\s\S]*MAXHEIGHT[\s\S]*VID_ResizeBuffers/,
    'modernized Quake must resize its native software framebuffer within original renderer bounds');
  assert.match(fs.readFileSync(path.join(repo, 'WinQuake/vid_emscripten.c'), 'utf8'),
    /vid\.aspect = Sys_BrowserModernized\(\)[\s\S]*\? 1\.0f/,
    'modernized Quake must use square pixels instead of forcing a 4:3 projection into wide buffers');
  assert.match(quakeSource, /Q1_BrowserControllerKey[\s\S]*Q1_BrowserControllerReleaseAll/,
    'Quake controller mapping and targeted release must enter native input');
  assert.match(fs.readFileSync(path.join(repo, 'WinQuake/common.c'), 'utf8'), /-userdir[\s\S]*COM_AddGameDirectory \(userdir\)/,
    'Quake persistent directory must be the highest-priority writable search path');
  assert.match(fs.readFileSync(path.join(repo, 'WinQuake/menu.c'), 'utf8'),
    /Q1_BrowserArmCaptureIntent \(\);[\s\S]*map start/,
    'Quake must arm capture from the native New Game action');
  const demoSource = fs.readFileSync(path.join(repo, 'WinQuake/cl_main.c'), 'utf8');
  assert.match(demoSource, /cls\.demonum >= MAX_DEMOS \|\| !cls\.demos\[cls\.demonum\]\[0\]/,
    'Quake must bounds-check the attract-demo index before dereferencing it');
  assert.doesNotMatch(fs.readFileSync(path.join(repo, 'WinQuake/vid_emscripten.c'), 'utf8'),
    /SDL_CreateWindow\([\s\S]*?SDL_WINDOW_RESIZABLE/,
    'fixed-resolution Quake must not let hidden-canvas CSS collapse its SDL window to zero');
  const quake2Source = fs.readFileSync(path.join(repo, 'engines/quake2/src/backends/web/main.c'), 'utf8');
  assert.match(quake2Source, /PM_FREEZE[\s\S]*return 3;/);
  assert.match(quake2Source, /Q2Web_ArmCaptureIntent[\s\S]*q2web_capture_intent && Q2Web_RuntimeState\(\) == 4/,
    'Quake II JOIN/New Game must expose native capture intent');
  assert.match(quake2Source, /Q2Web_ControllerKey[\s\S]*Q2Web_ControllerReleaseAll/,
    'Quake II controller mapping and targeted release must enter native input');
  assert.match(quake2Source, /q2web_started = true;\s*Qcommon_Init\(argc, argv\);/,
    'Quake II must enable browser exports before its simulated infinite main loop');
  assert.match(quake2Source, /GLimp_ResizeWebViewport\(width, height\)/,
    'Quake II must resize the live browser window without unloading its statically linked renderer');
  assert.doesNotMatch(quake2Source.match(/Q2Web_ResizeViewport[\s\S]*?\n}/)?.[0] || '', /vid_restart/,
    'Quake II browser viewport changes must not use the shared-library restart path');
  assert.match(fs.readFileSync(path.join(repo, 'engines/quake2/src/client/menu/menu.c'), 'utf8'),
    /Q2Web_ArmCaptureIntent\(\);[\s\S]*cls\.key_dest = key_game/,
    'Quake II must arm capture at the native menu-to-game transition');
  await exerciseQuake();
  await exerciseQuake2();
  console.log('Verified Quake and Quake II identity, state, capture, persistence, controller, resize, quality, PWA, and data-cache behavior.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
