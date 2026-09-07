#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const repo = path.resolve(__dirname, '..');
const sourceRoot = process.env.BUILD_ENGINE_SOURCE_DIR ||
  execFileSync(path.join(repo, 'scripts/fetch-source'), { encoding: 'utf8' }).trim();
const manifest = JSON.parse(fs.readFileSync(path.join(repo, 'web/wasm-game.json'), 'utf8'));
const dataManifest = JSON.parse(fs.readFileSync(path.join(repo, 'web/wasm-game-data.json'), 'utf8'));

assert.equal(manifest.identity, false);
assert.equal(manifest.fullscreen, true);
assert.equal(manifest.pointerLock, true);
for (const variant of ['blood', 'duke3d']) {
  const config = manifest.variants[variant];
  assert.equal(config.menuCursor, variant === 'blood' ? 'none' : 'native');
  assert.equal(config.displayMode, '4:3');
  assert.equal(config.canvasWidth / config.canvasHeight, 4 / 3);
  assert.equal(config.graphics, true, `${variant} must expose its packaged renderer profiles`);
  assert.equal(config.advanced, true, 'the framework nests its graphics selector inside Advanced');
  assert.doesNotMatch(config.description, /files?|data|cache|container|directory|folder/i,
    `${variant} ready copy must describe the game rather than provisioning`);
  assert.ok(config.provisioningText, `${variant} missing-data copy is required`);
  assert.ok(config.pwa?.icons?.length, `${variant} needs PWA metadata`);
  assert.equal(config.controller?.mode, 'disabled');
  assert.match(config.persistence?.root || '', /^\/home\/web_user\/\.config\//);
}

async function exercise(variant, profile = 'classic', { query = '', existingModernized = false, basePath = '/' } = {}) {
  const publicUrl = value => /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(value) || value.startsWith(basePath) && basePath !== '/'
    ? value : basePath + value.replace(/^\//, '');
  const isBlood = variant === 'blood';
  const modernized = profile === 'modernized';
  const profileKey = isBlood ? 'bloodProfile' : 'dukeProfile';
  const classicConfig = isBlood ? 'nblood.cfg' : 'eduke32.cfg';
  const adapterRelative = `build-wasm/web/${isBlood ? 'blood' : 'duke3d'}-adapter.js`;
  const source = process.env.BUILD_ADAPTER_SOURCE_REVISION
    ? execFileSync('git', ['-C', repo, 'show', `${process.env.BUILD_ADAPTER_SOURCE_REVISION}:${adapterRelative}`], { encoding: 'utf8' })
    : fs.readFileSync(process.env.BUILD_ADAPTER_SITE_ROOT
      ? path.join(process.env.BUILD_ADAPTER_SITE_ROOT, 'adapters', `${variant}.js`)
      : path.join(repo, `web/${variant}-adapter.js`), 'utf8');
  const events = new Map();
  const canvasEvents = new Map();
  const calls = [];
  const transitions = [];
  const stateChanges = [];
  const loading = [];
  const timers = [];
  const consoleEvents = [];
  let nativeState = 1;
  let now = 1000;
  let createdPolicy;
  let loadedPolicy;
  let module;
  let nativeMenuId = 100;
  let nativeCaptureTarget = false;
  const persisted = new Map([
    [`${manifest.variants[variant].persistence.root}/${classicConfig}`, 'existing Classic settings'],
    [`${manifest.variants[variant].persistence.root}/nblood_cvars.cfg`, 'existing Classic console settings'],
    [`${manifest.variants[variant].persistence.root}/settings.cfg`, 'existing Classic bindings']
  ]);
  const modernizedPath = `${manifest.variants[variant].persistence.root}/modernized.cfg`;
  if (existingModernized) persisted.set(modernizedPath, 'existing Modernized settings');

  const canvas = { addEventListener(type, listener) { canvasEvents.set(type, listener); } };
  const document = {
    visibilityState: 'visible',
    documentElement: { dataset: {} },
    addEventListener(type, listener) { events.set(type, listener); },
    createElement(type) { assert.equal(type, 'script'); return {}; },
    head: {
      appendChild(script) {
        assert.equal(script.src, `${basePath}${variant}${modernized ? '-modernized' : ''}.js`);
        module = sandbox.Module;
        module.FS = {
          filesystems: { IDBFS: {} }, mkdirTree() {}, mount() {}, syncfs(_populate, callback) { callback(); }, chmod() {},
          analyzePath(path) { return { exists: persisted.has(path) }; },
          writeFile(path, contents) { assert.equal(persisted.has(path), false); persisted.set(path, contents); }
        };
        module.addRunDependency = () => {};
        module.removeRunDependency = () => {};
        module.callMain = arguments_ => calls.push(['callMain', Array.from(arguments_)]);
        const prefix = isBlood ? '_NBlood_Wasm' : '_Duke_Wasm';
        module[`${prefix}RuntimeState`] = () => nativeState;
        module[`${prefix}EnsureMenu`] = () => {
          calls.push(['menu']);
          if (isBlood) nativeState = 2;
        };
        if (isBlood) {
          module._NBlood_WasmCaptureIntent = () => nativeState === 4 ? 1 : 0;
          module._NBlood_WasmCaptureTarget = () => nativeCaptureTarget ? 1 : 0;
        }
        module[`${prefix}SetPointerLock`] = value => calls.push(['capture', value]);
        module[`${prefix}ControlsMask`] = () => 31;
        if (!isBlood) {
          module._Duke_WasmMenuId = () => nativeMenuId;
          module._Duke_WasmMenuEntry = () => 2;
        }
        module[`${prefix}FlushPersistence`] = () => calls.push(['flush']);
        module._Build_WasmControllerFrame = (...values) => calls.push(['controller', ...values]);
        module._Build_WasmKeyEvent = (...values) => calls.push(['key', ...values]);
        module._Build_WasmTextEvent = code => { calls.push(['text', code]); return 1; };
        module._Build_WasmPointerMove = (...values) => calls.push(['pointerMove', ...values]);
        module._Build_WasmPointerDelta = (...values) => calls.push(['pointerDelta', ...values]);
        module._Build_WasmPointerButton = (...values) => calls.push(['pointerButton', ...values]);
        module._Build_WasmRenderMode = () => modernized ? 3 : 0;
        module._Build_WasmRenderWidth = () => modernized ? 1280 : 800;
        module._Build_WasmRenderHeight = () => modernized ? 720 : 600;
        module._Build_WasmRenderBpp = () => modernized ? 32 : 8;
        module._Build_WasmPointerX = () => 400;
        module._Build_WasmPointerY = () => 300;
        module._Build_WasmPointerBits = () => 0;
        module._Build_WasmPointerClickState = () => 0;
        module._Build_WasmPointerReleaseCountdown = () => 0;
        module._Build_WasmInputFrameCount = () => 7;
        queueMicrotask(() => module.onRuntimeInitialized());
      }
    }
  };
  const window = {
    addEventListener(type, listener) { events.set(type, listener); },
    setInterval(callback) { timers.push(callback); return timers.length; },
    clearInterval() {}
  };
  const sandbox = {
    console: {
      log: (...args) => consoleEvents.push(['log', ...args]),
      warn: (...args) => consoleEvents.push(['warn', ...args]),
      error: (...args) => consoleEvents.push(['error', ...args])
    },
    document, window, URLSearchParams, queueMicrotask,
    WasmGameFramework: { publicUrl },
    performance: { now: () => now }, location: { search: query },
    crypto: { subtle: { digest: async () => new ArrayBuffer(32) } },
    fetch: async request => {
      assert.equal(request, basePath + 'wasm-game-data.json');
      return { ok: true, json: async () => dataManifest };
    }
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: `${variant}-adapter.js` });
  const adapter = sandbox.WasmGameAdapter;
  const context = {
    variant,
    elements: { canvas, graphicsProfile: { value: query ? 'classic' : profile }, description: {} },
    framework: {
      createOwnerDataSet(policy) { createdPolicy = policy; return policy; },
      async mountOwnerFiles(currentModule, data, options) {
        assert.equal(currentModule, module);
        assert.equal(data.policy, createdPolicy);
        assert.equal(options.root, '/game');
        calls.push(['mount']);
      }
    },
    dataClient: {
      async load(policy, options) {
        loadedPolicy = policy;
        if (!isBlood) {
          await assert.rejects(
            policy.files[0].validate({ arrayBuffer: async () => new ArrayBuffer(0) }),
            /failed SHA-256 verification/
          );
          options.onProgress({ phase: 'checking-cache', key: policy.files[0].key });
          options.onProgress({ phase: 'downloading', key: policy.files[0].key, received: 1, total: 2 });
          options.onProgress({ phase: 'restored', key: policy.files[0].key });
        }
        return {
          policy,
          entries: policy.files.map(file => ({ cached: true, policy: { ...file, path: file.mountName } }))
        };
      }
    },
    persistence: {
      root: manifest.variants[variant].persistence.root,
      async attach(FS, options) {
        assert.equal(FS, module.FS);
        assert.equal(options.root, manifest.variants[variant].persistence.root);
        calls.push(['persistence', options.root]);
      },
      markDirty() { calls.push(['dirty']); },
      async save() { calls.push(['save']); }
    },
    shell: { resumeAudio() {}, engineState() { return transitions.at(-1) || 'launcher'; },
      setDisplay(detail) { calls.push(['display', detail.displayMode, detail.pixelated]); } },
    setLoading(...detail) { loading.push(detail); }, log() {},
    showRuntime(state) { transitions.push(state); },
    setEngineState(state, options) {
      transitions.push(state);
      stateChanges.push({ state, capture: options?.capture === true, event: options?.event });
    }
  };

  assert.equal(adapter.readEngineState(), 'menu');
  await adapter.init(context);
  {
    assert.equal(document.documentElement.dataset[profileKey], profile);
    assert.equal(context.elements.graphicsProfile.value, profile);
    assert.equal(canvas.width, modernized ? 1280 : 800);
    assert.equal(canvas.height, modernized ? 720 : 600);
    assert.deepEqual(calls.filter(call => call[0] === 'display').at(-1), ['display', modernized ? '16:9' : '4:3', true]);
    adapter.preferencesChanged({ qualityProfile: modernized ? 'classic' : 'modernized' }, context);
    assert.equal(document.documentElement.dataset[profileKey], modernized ? 'classic' : 'modernized');
    adapter.preferencesChanged({ qualityProfile: profile }, context);
  }
  assert.ok(canvasEvents.has('mousemove'), `${variant} must prevent duplicate raw SDL mouse motion`);
  assert.equal(createdPolicy.namespace, dataManifest.variants[variant].namespace || dataManifest.namespace);
  await adapter.start(context);
  {
    assert.equal(module.locateFile(`${variant}.wasm`, '/'), `${basePath}${variant}${modernized ? '-modernized' : ''}.wasm`);
    if (isBlood) assert.equal(module.locateFile('blood.data', '/'), basePath + (modernized ? 'blood-modernized.data' : 'blood.data'));
    else assert.equal(module.locateFile('other.data', '/assets/'), basePath + 'assets/other.data');
    assert.equal(module.locateFile('other.bin', '/assets/'), basePath + 'assets/other.bin');
    assert.equal(module.locateFile('other.bin', basePath + 'assets/'), basePath + 'assets/other.bin', 'already-prefixed engine asset stays singly prefixed');
    assert.equal(context.elements.graphicsProfile.disabled, true);
    const displayCalls = calls.filter(call => call[0] === 'display').length;
    adapter.preferencesChanged({ qualityProfile: modernized ? 'classic' : 'modernized' }, context);
    assert.equal(context.elements.graphicsProfile.value, profile, 'a running engine must not pretend to switch profiles');
    assert.equal(calls.filter(call => call[0] === 'display').length, displayCalls);
    assert.equal(persisted.get(`${manifest.variants[variant].persistence.root}/${classicConfig}`), 'existing Classic settings');
    assert.equal(persisted.get(`${manifest.variants[variant].persistence.root}/nblood_cvars.cfg`), 'existing Classic console settings');
    assert.equal(persisted.get(`${manifest.variants[variant].persistence.root}/settings.cfg`), 'existing Classic bindings');
    assert.equal(persisted.get(modernizedPath), modernized
      ? existingModernized ? 'existing Modernized settings' : '[Screen Setup]\n' : undefined);
  }
  module.printErr('WARN| Found 4 warning(s), 0 error(s).');
  assert.equal(consoleEvents.at(-1)[0], 'log', 'a zero-error summary must not pollute the error console');
  module.printErr('ERROR: renderer initialization failed');
  assert.equal(consoleEvents.at(-1)[0], 'error', 'a real native failure must remain a console error');
  assert.equal(loadedPolicy, createdPolicy);
  if (!isBlood) {
    module.setStatus('Mounting owner data from cache');
    module.monitorRunDependencies(1);
    assert.doesNotMatch(loading.flat().join('\n'), /files?|data|cache|container|browser|mount|verif|directory|folder|path|engine/i,
      'Duke normal loading copy must remain title-focused');
  }
  assert.equal(adapter.readEngineState(), 'gameplay');
  assert.equal(transitions.at(-1), 'gameplay');
  assert.ok(calls.some(call => call[0] === 'mount'));
  assert.ok(calls.some(call => call[0] === 'persistence'));
  events.get('pagehide')();
  assert.deepEqual(calls.slice(-3), [['flush'], ['dirty'], ['save']],
    `${variant} page hide must write native configuration before flushing framework persistence`);
  const launch = calls.find(call => call[0] === 'callMain');
  assert.ok(launch);
  if (!isBlood) assert.deepEqual(launch[1].slice(7), modernized ? ['-cfg', 'modernized.cfg'] : []);
  else {
    assert.equal(launch[1].includes('-cfg=modernized.cfg'), modernized);
    assert.equal(launch[1].includes('-ini=CRYPTIC.INI'), query.includes('campaign=cryptic'));
    if (query.includes('autostart=1')) {
      assert(launch[1].includes('-map=CP01.MAP'));
      assert(launch[1].includes('-quick') && launch[1].includes('-nodemo'));
    }
  }
  assert.ok(launch[1].includes('/game') || launch[1].includes('-game_dir=/game'));
  adapter.inputCaptureChanged(true);
  assert.deepEqual(calls.at(-1), ['capture', 1]);
  adapter.pointerMove({ captured: true, movementX: 17.4, movementY: -8.6 });
  assert.deepEqual(calls.at(-1), ['pointerDelta', 17, -9],
    `${variant} captured gameplay movement must use relative deltas`);
  adapter.pointerMove({ captured: false, x: 300, y: 220 });
  adapter.pointerMove({ captured: false, x: 324, y: 207 });
  assert.deepEqual(calls.at(-1), ['pointerDelta', 24, -13],
    `${variant} must preserve mouse look when an embedded browser declines pointer lock`);
  for (const button of [0, 1, 2]) {
    const before = calls.length;
    adapter.pointerButton({ button, pressed: true, captured: true }, {}, context);
    adapter.pointerButton({ button, pressed: false, captured: true }, {}, context);
    assert.deepEqual(calls.slice(before), [['pointerButton', button, 1], ['pointerButton', button, 0]],
      `${variant} gameplay must forward button press/release without changing the absolute menu pointer`);
  }
  // Reproduce the real shell contract: it does NOT call pointerButton while
  // locked. Exercise physical mouse listeners, not the adapter hook directly.
  const mouse = button => ({button, stopImmediatePropagation() {}});
  for (const button of [0, 1, 2]) {
    const before = calls.length;
    canvasEvents.get('mousedown')(mouse(button));
    canvasEvents.get('mouseup')(mouse(button));
    assert.deepEqual(calls.slice(before), [['pointerButton', button, 1], ['pointerButton', button, 0]],
      `${variant}/${profile}: captured physical clicks must reach native press AND release`);
  }
  {
    adapter.inputCaptureChanged(false);
    const before = calls.length;
    adapter.pointerButton({button: 0, pressed: true}, {}, context);
    adapter.inputCaptureChanged(true);
    // The first press happened unlocked; the framework now omits its release.
    canvasEvents.get('mousedown')(mouse(0));
    events.get('pointerup')(mouse(0));
    events.get('mouseup')(mouse(0));
    canvasEvents.get('mouseup')(mouse(0));
    assert.deepEqual(calls.slice(before).filter(c => c[0] === 'pointerButton'),
      [['pointerButton', 0, 1], ['pointerButton', 0, 0]],
      `${variant}/${profile}: lock acquisition must neither latch fire nor duplicate edges`);
  }
  for (const release of ['pointerup', 'mouseup', 'pointercancel', 'blur']) {
    const before = calls.length;
    canvasEvents.get('mousedown')(mouse(0));
    events.get(release)(mouse(0));
    assert.deepEqual(calls.slice(before).filter(c => c[0] === 'pointerButton'),
      [['pointerButton', 0, 1], ['pointerButton', 0, 0]],
      `${variant}/${profile}: ${release} must release fire even outside the canvas`);
  }
  {
    const before = calls.length;
    for (const button of [0, 2]) canvasEvents.get('mousedown')(mouse(button));
    adapter.inputCaptureChanged(false);
    assert.deepEqual(calls.slice(before).filter(c => c[0] === 'pointerButton'),
      [['pointerButton', 0, 1], ['pointerButton', 2, 1], ['pointerButton', 0, 0], ['pointerButton', 2, 0]],
      `${variant}/${profile}: losing capture must release every held mouse button`);
    const idle = calls.length;
    canvasEvents.get('mousedown')(mouse(0));
    canvasEvents.get('mouseup')(mouse(0));
    assert.equal(calls.length, idle, 'unlocked compatibility events must not bypass native menu policy');
  }
  adapter.controllerFrame({
    deltaMs: 16,
    actions: { forward: 1, right: 1, lookX: 0.5, lookY: -0.25, attack: 1, jump: 1 }
  }, context);
  const controllerCall = calls.at(-1);
  assert.equal(controllerCall[0], 'controller');
  assert.ok(controllerCall[1] & 1, 'controller forward must map to native W');
  assert.ok(controllerCall[1] & 8, 'controller right must map to native D');
  assert.ok(controllerCall[1] & 16, 'controller jump must map to native jump');
  assert.ok(controllerCall[2] > 0, 'right stick must map to native horizontal mouse input');
  assert.ok(controllerCall[3] < 0, 'right stick must map to native vertical mouselook input');
  assert.equal(controllerCall[4] & 1, 1, 'controller trigger must map to native attack');
  adapter.controllerChanged({ activeIndex: null, selection: 'auto' }, context);
  assert.deepEqual(calls.at(-1), ['controller', 0, 0, 0, 0], 'disconnect must release native controller state');
  nativeState = 0;
  adapter.controllerFrame({
    deltaMs: 16,
    actions: { up: 1, right: 1, attack: 1, menu: 1, lookX: 1, lookY: 1 }
  }, context);
  const menuControllerCall = calls.at(-1);
  assert.equal(menuControllerCall[0], 'controller');
  assert.ok(menuControllerCall[1] & (1 << 11), 'controller up must map to the native menu up key');
  assert.ok(menuControllerCall[1] & (1 << 14), 'controller right must map to the native menu right key');
  assert.ok(menuControllerCall[1] & (1 << 7), 'controller attack must map to the native menu advance key');
  assert.ok(menuControllerCall[1] & (1 << 10), 'controller menu must map to the native menu return key');
  assert.equal(menuControllerCall[2], 0, 'right-stick look must not move the native menu pointer');
  assert.equal(menuControllerCall[3], 0, 'right-stick look must not move the native menu pointer');
  assert.equal(menuControllerCall[4], 0, 'controller attack must not leak into gameplay mouse buttons in menus');
  adapter.controllerChanged({ activeIndex: null, selection: 'disabled' }, context);
  assert.deepEqual(calls.at(-1), ['controller', 0, 0, 0, 0], 'disabling in a menu must release native controller state');
  nativeState = 1;
  if (isBlood) {
    const nativeSource = fs.readFileSync(path.join(sourceRoot, 'source/blood/src/blood.cpp'), 'utf8');
    const controlsSource = fs.readFileSync(path.join(sourceRoot, 'source/blood/src/controls.cpp'), 'utf8');
    assert.match(nativeSource, /gInputMode == INPUT_MODE_3[\s\S]*return 3;/,
      'Blood debrief must be an authoritative native state');
    assert.match(nativeSource, /gStartNewGame[\s\S]*return 4;/,
      'Blood New Game must publish native loading state');
    assert.match(nativeSource, /NBlood_WasmCaptureIntent[\s\S]*gStartNewGame != 0/,
      'Blood New Game must publish native capture intent');
    assert.match(nativeSource, /NBlood_WasmCaptureTarget[\s\S]*menuDifficulty[\s\S]*menuDifficultyCustom/,
      'Blood must identify stock and custom New Game actions before native dispatch');
    assert.match(nativeSource, /NBlood_WasmEnsureMenu[\s\S]*gGameMenuMgr\.Push\(&menuMainWithSave/,
      'Blood capture loss must synchronously open the native pause menu');
    assert.doesNotMatch(nativeSource, /document\.exitPointerLock/,
      'Blood native diagnostics must not compete with framework pointer-lock ownership');
    assert.match(fs.readFileSync(path.join(sourceRoot, 'source/build/src/sdlayer.cpp'), 'utf8'),
      /emscripten_get_pointerlock_status/,
      'Blood relative mouse mode must observe framework-owned pointer lock');
    assert.match(controlsSource, /#ifdef __EMSCRIPTEN__[\s\S]*gMouseAim = 1;/,
      'Blood pointer-lock input must keep vertical mouselook enabled');

    nativeState = 2;
    timers[0]();
    assert.equal(transitions.at(-1), 'paused');
    nativeState = 3;
    timers[0]();
    assert.equal(transitions.at(-1), 'debrief');
    nativeState = 4;
    assert.equal(adapter.readEngineState(), 'loading');
    assert.equal(adapter.readCaptureIntent(), true);

    nativeState = 0;
    nativeCaptureTarget = true;
    const newGameEvent = {
      code: 'Enter', ctrlKey: false, metaKey: false, altKey: false,
      stopPropagation() {}, preventDefault() {}
    };
    canvasEvents.get('keydown')(newGameEvent);
    assert.equal(adapter.readCaptureIntent(), true,
      'Blood difficulty Enter must publish trusted capture intent before the native frame');
    assert.equal(adapter.readEngineState(), 'loading',
      'Blood must retain capture through the native New Game transition');
    adapter.captureLost({}, context);
    assert.equal(adapter.readCaptureIntent(), false);

    nativeState = 0;
    nativeCaptureTarget = true;
    const bloodClickEvent = { type: 'pointerdown' };
    adapter.pointerButton({ button: 0, pressed: true, x: 400, y: 300 }, bloodClickEvent, context);
    assert.equal(adapter.readCaptureIntent(), true,
      'Blood difficulty click must publish trusted capture intent synchronously');
    assert.deepEqual(stateChanges.at(-1), { state: 'loading', capture: true, event: bloodClickEvent });
    assert.deepEqual(calls.slice(-2), [['pointerMove', 400, 300], ['pointerButton', 0, 1]]);

    nativeState = 1;
    transitions.push('menu');
    const event = { key: 'Enter' };
    events.get('keyup')(event);
    await Promise.resolve();
    assert.deepEqual(stateChanges.at(-1), { state: 'gameplay', capture: true, event });

    adapter.captureLost({}, context);
    assert.deepEqual(calls.at(-1), ['menu']);
    assert.equal(transitions.at(-1), 'paused');
    const menuCalls = calls.filter(call => call[0] === 'menu').length;
    nativeState = 1;
    now += 100;
    events.get('keydown')({ key: 'Escape' });
    adapter.captureLost({}, context);
    assert.equal(calls.filter(call => call[0] === 'menu').length, menuCalls,
      'Escape-triggered capture loss must not inject a second menu action');
  } else {
    const nativeSource = fs.readFileSync(path.join(sourceRoot, 'source/duke3d/src/game.cpp'), 'utf8');
    assert.match(nativeSource, /ud\.mouseaiming = 0;\s*g_myAimMode = 1;/,
      'Duke pointer-lock input must start with vertical mouselook enabled');
    // Text and physical scan states are separate native queues. Exercise the
    // real adapter handler with layout-resolved key values, not just key codes.
    const keyboard = (key, code, options = {}, type = 'keydown') => {
      const start = calls.length;
      let prevented = false, stopped = false;
      canvasEvents.get(type)({ key, code, ...options,
        preventDefault() { prevented = true; }, stopPropagation() { stopped = true; } });
      return { calls: calls.slice(start), prevented, stopped };
    };
    for (const [key, code, scan, options] of [
      ['t', 'KeyT', 0x14, {}], ['T', 'KeyT', 0x14, { shiftKey: true }],
      ['A', 'KeyA', 0x1e, {}], ['z', 'KeyY', 0x15, {}],
      [' ', 'Space', 0x39, {}], ['7', 'Digit7', 0x08, {}],
      ['!', 'Digit1', 0x02, { shiftKey: true }],
      ['t', 'KeyT', 0x14, { repeat: true }],
      ['Enter', 'Enter', 0x1c, {}], ['Escape', 'Escape', 0x01, {}],
      ['Backspace', 'Backspace', 0x0e, {}], ['Tab', 'Tab', 0x0f, {}]
    ]) {
      const ascii = { Enter: 13, Escape: 27, Backspace: 8, Tab: 9 }[key] || key.charCodeAt(0);
      const down = keyboard(key, code, options);
      assert.deepEqual(down.calls, [['text', ascii], ['key', scan, 1]]);
      assert.equal(down.prevented, true, 'prevent compatibility keypress duplication');
      assert.equal(down.stopped, true, 'keep SDL from duplicating scan delivery');
      assert.equal(document.documentElement.dataset.buildTextInput, `${ascii}:1`);
      assert.deepEqual(keyboard(key, code, options, 'keyup').calls, [['key', scan, 0]],
        'release must not insert a second character');
    }
    for (const options of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }]) {
      const shortcut = keyboard('t', 'KeyT', options);
      assert.deepEqual(shortcut.calls, [['key', 0x14, 1]]);
      assert.equal(shortcut.prevented, false, 'browser shortcuts must keep their default action');
    }
    for (const [key, options] of [['t', { isComposing: true }], ['Dead', {}],
      ['é', {}], ['💾', {}], ['Unidentified', {}]]) {
      assert.deepEqual(keyboard(key, 'KeyT', options).calls, [['key', 0x14, 1]],
        'do not guess or truncate composition/non-ASCII text into the bitmap-font editor');
    }
    assert.deepEqual(keyboard('<', 'Unidentified'), {
      calls: [['text', 60]], prevented: true, stopped: true
    }, 'a resolved ASCII character does not require a recognized physical scan');
    const textHook = module._Build_WasmTextEvent;
    for (const result of [0, 2]) {
      module._Build_WasmTextEvent = code => { calls.push(['text', code]); return result; };
      const handled = keyboard('t', 'KeyT');
      assert.equal(handled.prevented, true, 'full FIFO or console routing must not trigger SDL fallback');
      assert.equal(document.documentElement.dataset.buildTextInput, `116:${result}`);
    }
    delete module._Build_WasmTextEvent;
    assert.deepEqual(keyboard('t', 'KeyT').calls, [['key', 0x14, 1]], 'older modules retain scan input');
    module._Build_WasmTextEvent = textHook;
    nativeState = 0;
    nativeMenuId = 110;
    const enterEvent = {
      code: 'Enter', ctrlKey: false, metaKey: false, altKey: false,
      stopPropagation() {}, preventDefault() {}
    };
    canvasEvents.get('keydown')(enterEvent);
    assert.equal(adapter.readCaptureIntent(), true, 'Duke difficulty selection must publish capture intent synchronously');
    assert.equal(adapter.readEngineState(), 'loading', 'Duke must remain loading until the native game becomes active');
    assert.deepEqual(calls.at(-1), ['key', 0x1c, 1]);

    nativeState = 1;
    timers[0]();
    assert.equal(adapter.readCaptureIntent(), true,
      'Duke launch intent must survive until the trusted pointer gesture can request pointer lock');
    adapter.inputCaptureChanged(true);
    assert.equal(adapter.readCaptureIntent(), false, 'successful pointer lock must consume Duke capture intent');

    nativeState = 2;
    const resumeEvent = {
      code: 'Escape', ctrlKey: false, metaKey: false, altKey: false,
      stopPropagation() {}, preventDefault() {}
    };
    canvasEvents.get('keydown')(resumeEvent);
    assert.equal(adapter.readCaptureIntent(), true, 'paused Escape must publish synchronous Resume intent');

    nativeState = 0;
    nativeMenuId = 110;
    const dukeClickEvent = { type: 'pointerdown' };
    adapter.pointerButton({ button: 0, pressed: true, x: 400, y: 300 }, dukeClickEvent, context);
    assert.equal(adapter.readCaptureIntent(), true, 'Duke difficulty click must publish trusted capture intent');
    assert.deepEqual(stateChanges.at(-1), { state: 'loading', capture: true, event: dukeClickEvent });
    assert.deepEqual(calls.slice(-2), [['pointerMove', 400, 300], ['pointerButton', 0, 1]]);

    nativeState = 1;
    adapter.captureLost();
    assert.deepEqual(calls.at(-1), ['menu']);
    assert.equal(adapter.readCaptureIntent(), false);
  }
  assert.ok(timers.length, 'native state telemetry must remain active');
  timers[0]();
  assert.equal(document.documentElement.dataset[isBlood ? 'bloodControlsValid' : 'dukeControlsValid'], 'true');
  if (!isBlood) {
    assert.equal(document.documentElement.dataset.dukeMenuId, String(nativeMenuId));
    assert.equal(document.documentElement.dataset.dukeMenuEntry, '2');
    assert.match(source, /0\\s\+error/, 'Duke stderr routing must ignore a zero-error summary');
  } else {
    assert.match(source, /0\\s\+error/, 'Blood stderr routing must ignore a zero-error summary');
  }
}

(async () => {
  await exercise('blood');
  await exercise('blood', 'modernized');
  await exercise('blood', 'modernized', { query: '?profile=modernized' });
  await exercise('blood', 'modernized', { existingModernized: true });
  await exercise('blood', 'classic', { query: '?profile=unknown' });
  await exercise('blood', 'classic', { query: '?profile=__proto__' });
  await exercise('blood', 'modernized', { query: '?profile=modernized&campaign=cryptic&autostart=1' });
  await exercise('duke3d');
  await exercise('duke3d', 'modernized');
  await exercise('duke3d', 'modernized', { query: '?profile=modernized' });
  await exercise('duke3d', 'modernized', { existingModernized: true });
  await exercise('duke3d', 'classic', { query: '?profile=unknown' });
  await exercise('duke3d', 'classic', { query: '?profile=__proto__' });
  for (const variant of ['blood', 'duke3d']) {
    for (const profile of ['classic', 'modernized']) {
      await exercise(variant, profile, { basePath: `/${variant}/` });
    }
  }
  console.log('Build-family state, capture, text/scan input, mount, display, profile, and manifest contracts passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
