#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');

if (!process.env.WOLF4SDL_TEST_VARIANT) {
  for (const variant of ['wolf3d', 'spear']) {
    execFileSync(process.execPath, [__filename], {
      stdio: 'inherit',
      env: { ...process.env, WOLF4SDL_TEST_VARIANT: variant }
    });
  }
  console.log('Verified both Wolf4SDL variants across audio preparation, WASD/mouse, state, capture, persistence, controller, PWA, and data-cache contracts.');
  process.exit(0);
}

const repo = path.resolve(__dirname, '..');
const testVariant = process.env.WOLF4SDL_TEST_VARIANT;
const makefile = fs.readFileSync(path.join(repo, 'Makefile'), 'utf8');
const config = JSON.parse(fs.readFileSync(path.join(repo, 'web/wasm-game.json'), 'utf8'));
assert.equal(config.menuCursor, 'none');
const dataManifest = JSON.parse(fs.readFileSync(path.join(repo, 'web/wasm-game-data.json'), 'utf8'));
const selectedConfig = { ...config, ...config.variants[testVariant] };
const selectedDataManifest = dataManifest.variants[testVariant];
const listeners = new Map();
const intervals = [];
const stateChanges = [];
let shellState = 'launcher';
let nativeState = 1;
let openMenuCalls = 0;
let captureValue = -1;
let mainArguments = null;
let now = 1000;
const lifecycle = [];
const controllerKeys = [];
const controllerMouse = [];
const controllerButtonMasks = [];
let persistenceSaves = 0;
let persistenceDirty = 0;
let ownerPolicy = null;
const scriptSources = [];

assert.match(makefile, /-lidbfs\.js/,
  'the Emscripten build must expose IDBFS to framework persistence');
assert.match(makefile, /CFLAGS \+= -pthread/,
  'the browser native loop must run on its Emscripten worker');
assert.match(makefile, /LDFLAGS \+= -pthread[\s\S]*PROXY_TO_PTHREAD=1[\s\S]*PTHREAD_POOL_SIZE=1/,
  'the permanently blocking native loop must stay off the UI thread');
assert.doesNotMatch(makefile, /ASYNCIFY=1/,
  'the blocking engine loop is incompatible with callMain Asyncify unwinding');

const engineParts = {
  FS: {
    chdir() {},
    write(_stream, _buffer, _offset, length) { return length; }
  },
  callMain(args) { mainArguments = args; lifecycle.push(['main', Array.from(args)]); },
  _WolfWasm_BrowserRuntimeState: () => nativeState,
  _WolfWasm_BrowserOpenMenu() { openMenuCalls += 1; nativeState = 4; },
  _WolfWasm_BrowserSetInputCaptured(value) { captureValue = value; },
  _WolfWasm_BrowserControllerKey(code, pressed) { controllerKeys.push([code, pressed]); },
  _WolfWasm_BrowserControllerMouse(dx, dy) { controllerMouse.push([dx, dy]); },
  _WolfWasm_BrowserControllerButtons(mask) { controllerButtonMasks.push(mask); },
  _WolfWasm_BrowserCaptureIntent: () => nativeState === 5 ? 1 : 0,
  _WolfWasm_BrowserControlsMask: () => 31,
  _WolfWasm_BrowserPreparedDigiSounds: () => testVariant === 'spear' ? 40 : 46,
  _WolfWasm_BrowserDigiStarts: () => 3,
  _WolfWasm_BrowserActiveDigiChannels: () => 1
};
const canvas = { addEventListener() {} };
const sandbox = {
  URLSearchParams,
  console,
  queueMicrotask,
  performance: { now: () => now },
  location: { search: '', href: 'http://localhost/' },
  fetch: async () => ({ ok: true, json: async () => dataManifest }),
  document: {
    documentElement: { dataset: {} },
    createElement: () => ({}),
    head: {
      appendChild(script) {
        scriptSources.push(script.src);
        Object.assign(sandbox.Module, engineParts);
        script.onload();
        sandbox.Module.onRuntimeInitialized();
      }
    },
    addEventListener(type, listener) {
      const current = listeners.get(type) || [];
      current.push(listener);
      listeners.set(type, current);
    }
  },
  window: {
    setInterval(callback) { intervals.push(callback); return intervals.length; },
    clearInterval() {}
  }
};
sandbox.globalThis = sandbox;
vm.runInNewContext(fs.readFileSync(path.join(repo, 'web/game-adapter.js'), 'utf8'), sandbox,
  { filename: 'web/game-adapter.js' });

const context = {
  variant: testVariant,
  elements: { canvas },
  framework: {
    requireCapabilities: () => ({ supported: true, missing: [] }),
    createOwnerDataSet: policy => { ownerPolicy = policy; return policy; },
    mountOwnerFiles: async () => {}
  },
  persistence: {
    root: `/persistent/wolf4sdl/${testVariant}`,
    async attach(targetFs, options) {
      assert.equal(targetFs, engineParts.FS);
      assert.equal(options.root, this.root);
      lifecycle.push(['restore', options.root]);
      return {
        root: options.root,
        markDirty() { persistenceDirty += 1; },
        async save() { persistenceSaves += 1; }
      };
    }
  },
  dataClient: {
    load: async policy => ({ entries: policy.files.map(file => ({ cached: true, policy: file })) })
  },
  shell: {
    engineState: () => shellState,
    async resumeAudio() {}
  },
  setLoading() {}, log() {},
  setEngineState(state, options) {
    shellState = state;
    stateChanges.push({ state, capture: options?.capture === true, event: options?.event });
  },
  showRuntime(state) { shellState = state; }
};

(async () => {
  assert.equal(selectedConfig.fullscreen, true);
  assert.equal(selectedConfig.controller.mode, 'disabled');
  assert.equal(selectedConfig.persistence.root, '/persistent/wolf4sdl/{variant}');
  assert.equal(selectedConfig.identity, false);
  assert.equal(selectedConfig.graphics, false);
  assert.equal(selectedConfig.displayMode, '4:3');
  assert.equal(selectedConfig.canvasWidth / selectedConfig.canvasHeight, 4 / 3);
  assert.equal(selectedConfig.pwa.icons.length, 2);
  assert.equal(selectedDataManifest.files.length, 8);
  assert.ok(selectedDataManifest.files.every(file => file.sha256));

  const playSource = fs.readFileSync(path.join(repo, 'wl_play.cpp'), 'utf8');
  assert.match(playSource, /dirscan\[4\] = \{ sc_UpArrow, sc_RightArrow, sc_DownArrow, sc_LeftArrow \}/);
  assert.match(playSource,
    /WOLF4SDL_WEB[\s\S]*Keyboard\[sc_W\][\s\S]*Keyboard\[sc_A\][\s\S]*bt_strafeleft/,
    'browser WASD must move/strafe independently of the original turning bindings');
  assert.match(fs.readFileSync(path.join(repo, 'wl_main.cpp'), 'utf8'),
    /WOLF4SDL_WEB[\s\S]*dirscan\[di_north\] = sc_UpArrow[\s\S]*dirscan\[di_west\] = sc_LeftArrow/,
    'persisted browser configs must not restore the old double-bound WASD directions');
  assert.match(fs.readFileSync(path.join(repo, 'wl_menu.cpp'), 'utf8'),
    /#ifndef WOLF4SDL_WEB[\s\S]*mouseenabled && IN_IsInputGrabbed\(\)/,
    'browser menus must ignore mouse motion entirely');
  assert.match(playSource, /ex_completed[\s\S]*ex_secretlevel[\s\S]*ex_victorious \? 3 : 1/);
  assert.match(fs.readFileSync(path.join(repo, 'Makefile'), 'utf8'), /_WolfWasm_BrowserControlsMask/);
  assert.match(fs.readFileSync(path.join(repo, 'Makefile'), 'utf8'), /_WolfWasm_BrowserCaptureIntent/);
  assert.match(fs.readFileSync(path.join(repo, 'Makefile'), 'utf8'), /_WolfWasm_BrowserControllerMouse/);
  assert.match(makefile, /_WolfWasm_BrowserPreparedDigiSounds/);
  const mainSource = fs.readFileSync(path.join(repo, 'wl_main.cpp'), 'utf8');
  assert.match(mainSource,
    /DigiChannel\[map\[1\]\] = map\[2\];\s*SD_PrepareSound\(map\[1\]\);/,
    'every mapped digitized effect must be prepared for the browser mixer');
  assert.doesNotMatch(mainSource, /#ifndef WOLF4SDL_WEB\s*SD_PrepareSound/,
    'the browser build must not skip digitized sound preparation');
  assert.match(fs.readFileSync(path.join(repo, 'id_in.cpp'), 'utf8'),
    /WolfWasm_BrowserControllerKey[\s\S]*Keyboard\[keycode\]/,
    'controller keys must use Wolf4SDL native keyboard state');
  assert.match(fs.readFileSync(path.join(repo, 'wl_main.cpp'), 'utf8'),
    /--datadir[\s\S]*chdir\(datadir\)[\s\S]*CheckForEpisodes/,
    'the native worker must enter the mounted owner-data directory before discovery');
  const menuSource = fs.readFileSync(path.join(repo, 'wl_menu.cpp'), 'utf8');
  assert.match(menuSource, /startgame \|\| loadedgame[\s\S]*WolfWasmRuntimeState = 5/,
    'New Game and Load must synchronously publish native loading intent');
  assert.match(menuSource, /WolfWasmRuntimeState = ingame \? 4 : 1/,
    'menu entry must distinguish the paused and main-menu states');
  assert.match(fs.readFileSync(path.join(repo, 'id_in.cpp'), 'utf8'),
    /WolfWasmRuntimeState = 4;[\s\S]*LastScan = sc_Escape/,
    'capture loss must synchronously publish the native paused transition');

  const adapter = sandbox.WasmGameAdapter;
  await adapter.init(context);
  assert.equal(canvas.id, 'canvas', 'the framework canvas exposes SDL\'s native selector');
  assert.equal(ownerPolicy.files.every(file => file.mountName === file.name.toLowerCase()), true,
    'owner data mounts under Wolf4SDL\'s lowercase Unix filenames');
  await adapter.start(context);
  assert.deepEqual(scriptSources, [`/${testVariant}.js`]);
  assert.deepEqual(Array.from(mainArguments), [
    '--res', '960', '720', '--datadir', '/game', '--configdir', `/persistent/wolf4sdl/${testVariant}`
  ]);
  assert.deepEqual(lifecycle.map(entry => entry[0]), ['restore', 'main'],
    'persistence must restore before native main reads config and save slots');
  engineParts.FS.write({
    path: `/persistent/wolf4sdl/${testVariant}/savegam0.${testVariant === 'spear' ? 'sod' : 'wl6'}`
  }, new Uint8Array([1]), 0, 1);
  assert.equal(persistenceDirty, 1, 'native save writes must mark framework persistence dirty');
  assert.equal(shellState, 'menu');

  adapter.pointerMove({ captured: true, movementX: 9.6, movementY: -4 });
  assert.deepEqual(controllerMouse.at(-1), [10, 0],
    'captured browser mouse motion must use the native relative-input seam');

  nativeState = 2;
  intervals.at(-1)();
  assert.equal(shellState, 'gameplay');
  assert.equal(sandbox.document.documentElement.dataset.wolf3dControlsValid, 'true');
  assert.equal(Number(sandbox.document.documentElement.dataset.wolfAudioPrepared) > 0, true);
  assert.equal(sandbox.document.documentElement.dataset.wolfAudioDigiStarts, '3');
  assert.equal(sandbox.document.documentElement.dataset.wolfAudioActive, '1');
  nativeState = 3;
  intervals.at(-1)();
  assert.equal(shellState, 'debrief');

  nativeState = 5;
  assert.equal(adapter.readEngineState(), 'loading');
  assert.equal(adapter.readCaptureIntent(), true);

  nativeState = 2;
  shellState = 'menu';
  const event = { key: 'Escape' };
  for (const listener of listeners.get('keyup')) listener(event);
  await Promise.resolve();
  assert.equal(stateChanges.at(-1).state, 'gameplay');
  assert.equal(stateChanges.at(-1).capture, true);
  assert.equal(stateChanges.at(-1).event, event);

  adapter.captureLost({}, context);
  assert.equal(openMenuCalls, 1);
  assert.equal(shellState, 'paused');
  adapter.inputCaptureChanged(true);
  assert.equal(captureValue, 1);

  nativeState = 2;
  adapter.controllerFrame({ deltaMs: 16, actions: {
    forward: 1, backward: 0, left: 0, right: 0, lookX: 0.75, lookY: 0,
    attack: 1, altAttack: 0, jump: 0, crouch: 0, reload: 0, weapon: 0,
    previousWeapon: 0, nextWeapon: 0, scoreboard: 0, menu: 0, sprint: 0, melee: 0
  } }, context);
  assert.ok(controllerKeys.some(([code, pressed]) => code === 119 && pressed === 1));
  assert.ok(controllerMouse.some(([dx]) => dx > 0));
  assert.ok(controllerButtonMasks.includes(1));
  adapter.controllerChanged({ connected: false, selection: 'auto', activeIndex: null }, context);
  assert.ok(controllerKeys.some(([code, pressed]) => code === 119 && pressed === 0));
  assert.equal(controllerButtonMasks.at(-1), 0);

  nativeState = 2;
  now += 100;
  for (const listener of listeners.get('keydown')) listener({ key: 'Escape' });
  adapter.captureLost({}, context);
  assert.equal(openMenuCalls, 1, 'Escape-triggered capture loss must not inject a second menu action');
  await Promise.resolve();
  assert.ok(persistenceSaves >= 1, 'capture loss must request a high-value persistence flush');
  console.log(`Verified ${testVariant} adapter contract.`);
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
