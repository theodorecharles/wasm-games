#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const repo = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(repo, 'web/game-adapter.js'), 'utf8');
const config = JSON.parse(fs.readFileSync(path.join(repo, 'web/wasm-game.json'), 'utf8'));
const dataManifest = JSON.parse(fs.readFileSync(path.join(repo, 'web/wasm-game-data.json'), 'utf8'));
const modernVariants = new Set(['doom', 'doom2', 'tnt', 'plutonia', 'heretic', 'hexen', 'chex']);
const browserVideoSource = fs.readFileSync(path.join(repo, 'src/i_video.c'), 'utf8');
const browserSeamSource = fs.readFileSync(path.join(repo, 'src/i_browser.c'), 'utf8');
const classicBuildSource = fs.readFileSync(path.join(repo, 'wasm/CMakeLists.txt'), 'utf8');
const dsdaPatch = fs.readFileSync(path.join(repo, 'patches/dsda-wasm.patch'), 'utf8');

assert.match(classicBuildSource, /-lidbfs\.js/,
  'classic Emscripten builds must expose IDBFS to framework persistence');
assert.match(dsdaPatch, /-lidbfs\.js/,
  'modern Emscripten builds must expose IDBFS to framework persistence');

assert.match(browserVideoSource, /emscripten_get_pointerlock_status/,
  'classic native input must observe framework-owned pointer lock');
assert.match(browserSeamSource, /I_BrowserSetInputCaptured/,
  'classic native input needs an explicit framework capture seam');
assert.match(browserSeamSource, /I_BrowserControllerKey[\s\S]*SDL_PushEvent/,
  'classic controller input must enter SDL native events');
assert.match(browserSeamSource, /I_BrowserControllerWheel[\s\S]*SDL_MOUSEWHEEL/,
  'classic controller weapon cycling must enter SDL native wheel events');
assert.match(dsdaPatch, /emscripten_get_pointerlock_status/,
  'modern native input must observe framework-owned pointer lock');
assert.match(dsdaPatch, /I_BrowserSetInputCaptured/,
  'modern native input needs an explicit framework capture seam');
assert.match(dsdaPatch, /I_BrowserControllerMouse[\s\S]*SDL_PushEvent/,
  'modern controller look must enter SDL native events');
assert.match(dsdaPatch, /I_BrowserControllerWheel[\s\S]*SDL_MOUSEWHEEL/,
  'modern controller weapon cycling must enter SDL native wheel events');
assert.match(dsdaPatch, /I_BrowserScreenWidth[\s\S]*SCREENWIDTH/,
  'modern native resize must expose the authoritative backbuffer width');
assert.match(dsdaPatch, /I_BrowserScreenHeight[\s\S]*SCREENHEIGHT/,
  'modern native resize must expose the authoritative backbuffer height');
assert.match(dsdaPatch, /SDL_RENDERER_ACCELERATED/,
  'modern software scenes must request accelerated SDL browser presentation');
assert.match(dsdaPatch, /I_BrowserAudioDeviceCount[\s\S]*browser_audio_device_count/,
  'modern audio must expose the active native mixer-device count');
assert.match(dsdaPatch, /I_BrowserAudioCallbackCount[\s\S]*browser_audio_callback_count/,
  'modern audio must expose native mixer callback progress');
assert.match(dsdaPatch, /static void M_InvokeCheat[\s\S]*func == \(void \(\*\)\(\)\)cheat_pw[\s\S]*func\(\);/,
  'modern cheats must dispatch zero-argument and integer handlers with exact WebAssembly signatures');
assert.match(dsdaPatch, /argbuf\[-cht->arg\] = '\\0';/,
  'modern parameterized cheats must receive a terminated argument buffer');
assert.match(dsdaPatch, /TryRunTics[\s\S]*event loop[\s\S]*outer browser frame/,
  'modern interpolation must yield each frame to the browser instead of blocking at 35 Hz');
assert.match(dsdaPatch, /#ifndef __EMSCRIPTEN__[\s\S]*is released under[\s\S]*ABSOLUTELY NO WARRANTY/,
  'modern browser startup must keep the native licensing banner out of the visible loading console');
assert.doesNotMatch(source, /createPersistentFs/,
  'the adapter must use framework-managed persistence');

async function exercise(variant, requestedProfile, options = {}) {
  let nativeState = 0;
  let openMenuCalls = 0;
  const nativeResizes = [];
  const stateChanges = [];
  const displayChanges = [];
  const intervals = [];
  const documentListeners = new Map();
  let shellState = 'launcher';
  let resumeAudioCalls = 0;
  let now = 1000;
  const captureSignals = [];
  let ownerDataPolicy = null;
  const lifecycle = [];
  const controllerKeys = [];
  const controllerButtons = [];
  const controllerMouse = [];
  const controllerWheels = [];
  let persistenceSaves = 0;
  let persistenceDirty = 0;
  let nativeWidth = 1280;
  let nativeHeight = 720;
  let nativeFrames = 1;
  const files = new Set();
  const fileData = new Map();

  const FS = {
    mkdirTree() {},
    writeFile(path, bytes) {
      files.add(path);
      fileData.set(path, typeof bytes === 'string' ? bytes : new TextDecoder().decode(bytes));
    },
    readFile(path) {
      if (!files.has(path)) throw new Error('missing');
      return fileData.get(path) || '';
    },
    stat(path) { if (!files.has(path)) throw new Error('missing'); return {}; },
    mkdir() {},
    write(_stream, _buffer, _offset, length) { return length; }
  };
  const engine = {
    FS,
    callMain(args) { lifecycle.push(['main', Array.from(args)]); },
    _I_BrowserRuntimeState: () => nativeState,
    _I_BrowserOpenMenu() { openMenuCalls += 1; nativeState = 0; },
    _I_BrowserResizeViewport(width, height) {
      nativeResizes.push([width, height]);
      nativeWidth = width;
      nativeHeight = height;
    },
    _I_BrowserScreenWidth: () => nativeWidth,
    _I_BrowserScreenHeight: () => nativeHeight,
    _I_BrowserSetInputCaptured(value) { captureSignals.push(value); },
    _I_BrowserControllerKey(code, pressed) { controllerKeys.push([code, pressed]); },
    _I_BrowserControllerButton(button, pressed) { controllerButtons.push([button, pressed]); },
    _I_BrowserControllerMouse(dx, dy) { controllerMouse.push([dx, dy]); },
    _I_BrowserControllerWheel(y) { controllerWheels.push(y); },
    _I_BrowserFrameCount: () => nativeFrames,
    _I_BrowserTargetFPS: () => 120,
    _I_BrowserAudioDeviceCount: () => 1,
    _I_BrowserAudioCallbackCount: () => 42,
    _I_BrowserPlayerX: () => 2,
    _I_BrowserPlayerY: () => 3,
    _I_BrowserPlayerAngle: () => 4,
    _I_BrowserViewPitch: () => 5
  };
  const canvas = { id: 'game-canvas', addEventListener() {}, focus() {} };
  const elements = {
    canvas,
    graphicsProfile: { value: requestedProfile },
    fpsRow: { hidden: false },
    dynamicRow: { hidden: false },
    description: { textContent: '', hidden: true }
  };
  const sandbox = {
    URLSearchParams,
    TextEncoder,
    console,
    location: { search: '', href: 'http://localhost/' },
    queueMicrotask,
    performance: { now: () => now },
    fetch: async target => {
      if (String(target) === '/wasm-game-data.json') {
        return { ok: true, json: async () => dataManifest };
      }
      return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) };
    },
    document: {
      documentElement: { dataset: {} },
      head: {
        appendChild(script) {
          if (script.src.includes('dsda-doom')) sandbox.createDsdaDoom = async () => engine;
          else if (script.src.includes('heretic')) sandbox.createCrispyHeretic = async () => engine;
          else if (script.src.includes('hexen')) sandbox.createCrispyHexen = async () => engine;
          else sandbox.createCrispyDoom = async () => engine;
          script.onload();
        }
      },
      createElement: () => ({}),
      addEventListener(type, listener) { documentListeners.set(type, listener); }
    },
    window: {
      innerWidth: 1280, innerHeight: 720,
      visualViewport: { width: 1280, height: 720 },
      addEventListener() {},
      setInterval(callback) { intervals.push(callback); return intervals.length; },
      clearInterval() {}, clearTimeout() {}, setTimeout(callback) { callback(); return 1; }
    }
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox, { filename: 'web/game-adapter.js' });
  const adapter = sandbox.WasmGameAdapter;
  const context = {
    variant,
    config: config.variants[variant],
    elements,
    preferences: { values: () => ({ qualityProfile: requestedProfile, targetFps: 120 }) },
    framework: {
      requireCapabilities: () => ({ supported: true, missing: [] }),
      createOwnerDataSet: policy => { ownerDataPolicy = policy; return policy; },
      mountOwnerFiles: async () => {}
    },
    dataClient: {
      load: async policy => ({
        entries: policy.files.map(file => ({ cached: true, file: new Blob([]), policy }))
      })
    },
    persistence: {
      root: `/persistent/idtech1/${variant}`,
      async attach(targetFs, options) {
        assert.equal(targetFs, FS);
        assert.equal(options.root, this.root);
        lifecycle.push(['restore', options.root]);
        return {
          root: options.root,
          markDirty() { persistenceDirty += 1; },
          async save() { persistenceSaves += 1; }
        };
      }
    },
    shell: {
      engineState: () => shellState,
      setDisplay(display) { displayChanges.push(display); },
      async resumeAudio() { resumeAudioCalls += 1; },
      resize() {}
    },
    setStatus() {}, setLoading() {}, log() {},
    setEngineState(state, options) {
      shellState = state;
      stateChanges.push({ state, capture: options?.capture === true, event: options?.event });
    },
    showRuntime(state) { shellState = state; }
  };

  await adapter.init(context);
  assert.equal(canvas.id, 'canvas', `${variant} binds the framework canvas to SDL2's native selector`);
  if (requestedProfile === 'modernized') {
    const configPath = `/persistent/idtech1/${variant}/dsda-doom.cfg`;
    files.add(configPath);
    fileData.set(configPath, [
      'videomode                  "OpenGL"',
      'screen_resolution          "640x480"',
      'custom_resolution          "640x480"',
      `mouse_sensitivity_horiz   ${options.migrated ? 42 : 3}`,
      'palette_onbonus            1',
      `input_forward              ${options.migrated ? 120 : 273} -1 -1`,
      'user_setting               7',
      ''
    ].join('\n'));
    if (options.migrated) {
      const versionPath = `${configPath}.wasm-profile-version`;
      files.add(versionPath);
      fileData.set(versionPath, '2\n');
    }
  }
  await adapter.start(context);
  assert.equal(lifecycle[0][0], 'restore', `${variant} restores persistence before native main`);
  assert.equal(lifecycle[1][0], 'main', `${variant} starts native main after persistence restore`);
  assert.ok(lifecycle[1][1].includes(`/persistent/idtech1/${variant}`),
    `${variant} points native saves/config at its isolated persistence root`);
  if (requestedProfile === 'modernized') {
    const config = fileData.get(`/persistent/idtech1/${variant}/dsda-doom.cfg`);
    assert.match(config, /videomode\s+"Software"/,
      `${variant} migrates legacy black-canvas OpenGL configs to the software compositor`);
    assert.match(config, /screen_resolution\s+"1280x720"/,
      `${variant} refreshes its persisted modernized viewport before native main`);
    assert.match(config, /user_setting\s+7/,
      `${variant} preserves unrelated persisted settings during compositor migration`);
    assert.equal(fileData.get(`/persistent/idtech1/${variant}/dsda-doom.cfg.wasm-profile-version`), '2\n',
      `${variant} records the completed Modernized profile migration`);
    if (options.migrated) {
      assert.match(config, /mouse_sensitivity_horiz\s+42/,
        `${variant} preserves a returning user's mouse sensitivity`);
      assert.match(config, /palette_onbonus\s+1/,
        `${variant} preserves a returning user's post-migration palette choice`);
      assert.match(config, /input_forward\s+120 -1 -1/,
        `${variant} preserves a returning user's post-migration key binding`);
    } else {
      assert.match(config, /dsda_fps_limit\s+120/,
        `${variant} applies the selected 120 FPS ceiling`);
      assert.match(config, /palette_onbonus\s+0/,
        `${variant} removes the reported yellow pickup-palette flash`);
      assert.match(config, /snd_samplecount\s+128/,
        `${variant} applies the low-latency browser audio slice`);
      assert.match(config, /dsda_parallel_sfx_limit\s+1/,
        `${variant} suppresses same-tic duplicate sound effects`);
      assert.match(config, /movement_vertmouse\s+0/,
        `${variant} keeps vertical mouse movement disabled`);
      assert.match(config, /allow_freelook\s+0/,
        `${variant} keeps vertical freelook disabled`);
      assert.match(config, /use_game_controller\s+0/,
        `${variant} disables DSDA's duplicate browser gamepad path`);
      assert.match(config, /input_forward\s+119 -1 -1/,
        `${variant} migrates the default forward binding to W`);
    }
  } else {
    const classic = fileData.get(`/persistent/idtech1/${variant}/default.cfg`);
    const profile = fileData.get('/profiles/crispy.cfg');
    assert.match(classic, /key_up 119/, `${variant} defaults classic forward movement to W`);
    assert.match(classic, /key_strafeleft 97/, `${variant} defaults classic left strafe to A`);
    assert.match(classic, /novert 1/, `${variant} keeps classic vertical mouse movement disabled`);
    if (requestedProfile === 'original') {
      assert.match(profile, /crispy_hires 0/, `${variant} preserves the Original low-resolution renderer`);
      assert.match(profile, /crispy_uncapped 0/, `${variant} preserves the Original 35 Hz timing`);
    } else {
      assert.match(profile, /crispy_hires 1/, `${variant} preserves the Smooth high-resolution renderer`);
      assert.match(profile, /crispy_uncapped 1/, `${variant} preserves the Smooth uncapped timing`);
    }
  }
  FS.write({ path: `/persistent/idtech1/${variant}/save.dsg` }, new Uint8Array([1]), 0, 1);
  assert.equal(persistenceDirty, 1, `${variant} marks native persistent writes dirty`);
  assert.equal(adapter.readEngineState(), 'menu', `${variant} starts in the native menu`);
  assert.equal(adapter.readCaptureIntent(), false, `${variant} has no asynchronous loading transition`);
  assert.ok(displayChanges.length > 0, `${variant} applies its selected profile`);
  assert.equal(displayChanges.at(-1).displayMode,
    requestedProfile === 'modernized' ? 'dynamic' : '4:3',
    `${variant} applies the profile's exact aspect policy`);
  assert.equal(displayChanges.at(-1).pixelated, requestedProfile === 'original',
    `${variant} applies the profile's exact filtering policy`);
  assert.equal(ownerDataPolicy.validator.module, '/data-validator.mjs', `${variant} uses the shared downstream validator`);
  assert.equal(ownerDataPolicy.files.every(file => file.validator?.policy?.family), true,
    `${variant} preserves per-file structural policy for browser validation`);
  assert.equal(ownerDataPolicy.files.some(file => file.sha256), false,
    `${variant} does not recreate a digest allowlist in its adapter`);

  nativeState = 1;
  intervals.at(-1)();
  assert.equal(shellState, 'gameplay', `${variant} publishes native gameplay`);
  nativeState = 3;
  intervals.at(-1)();
  assert.equal(shellState, 'debrief', `${variant} releases capture for debrief`);

  nativeState = 0;
  intervals.at(-1)();
  const delayedKeyEvent = { key: 'Enter' };
  documentListeners.get('keyup')(delayedKeyEvent);
  await Promise.resolve();
  nativeState = 1;
  intervals.at(-1)();
  assert.deepEqual(stateChanges.at(-1),
    { state: 'gameplay', capture: true, event: delayedKeyEvent },
    `${variant} captures delayed native menu-to-gameplay transitions`);

  nativeState = 1;
  shellState = 'menu';
  const keyEvent = { key: 'Escape' };
  documentListeners.get('keyup')(keyEvent);
  await Promise.resolve();
  assert.deepEqual(stateChanges.at(-1), { state: 'gameplay', capture: true, event: keyEvent },
    `${variant} requests capture when keyboard Resume returns to gameplay`);

  adapter.captureLost({}, context);
  assert.equal(openMenuCalls, 1, `${variant} opens its native menu when capture is lost`);
  assert.equal(shellState, 'menu', `${variant} immediately publishes menu after capture loss`);
  adapter.inputCaptureChanged(true, context);
  adapter.inputCaptureChanged(false, context);
  assert.deepEqual(captureSignals.slice(-2), [1, 0], `${variant} synchronizes native relative-mouse mode`);
  assert.ok(resumeAudioCalls >= 2, `${variant} resumes audio from captured input`);

  nativeState = 1;
  adapter.controllerFrame({ deltaMs: 16, actions: {
    forward: 1, backward: 0, left: 0, right: 0, lookX: 0.8, lookY: -0.4,
    attack: 1, altAttack: 0, jump: 0, crouch: 0, reload: 0, weapon: 0,
    previousWeapon: 0, nextWeapon: 1, scoreboard: 0, menu: 0, sprint: 0, melee: 0
  } }, context);
  assert.ok(controllerKeys.some(([code, pressed]) => code === 119 && pressed === 1),
    `${variant} maps controller movement into native W input`);
  assert.ok(controllerButtons.some(([button, pressed]) => button === 1 && pressed === 1),
    `${variant} maps controller attack into the native mouse queue`);
  assert.ok(controllerMouse.some(([dx]) => dx > 0), `${variant} maps right-stick look into native mouse motion`);
  assert.equal(controllerMouse.every(([, dy]) => dy === 0), true,
    `${variant} never maps right-stick movement into vertical Doom look`);
  assert.equal(controllerWheels.at(-1), 1, `${variant} maps weapon cycling into a native wheel event`);
  adapter.controllerChanged({ connected: false, selection: 'auto', activeIndex: null }, context);
  assert.ok(controllerKeys.some(([code, pressed]) => code === 119 && pressed === 0),
    `${variant} releases held controller movement after disconnect`);

  nativeState = 1;
  shellState = 'gameplay';
  now += 100;
  documentListeners.get('keydown')({ key: 'Escape' });
  adapter.captureLost({}, context);
  assert.equal(openMenuCalls, 1, `${variant} does not inject a second menu action after Escape`);
  await Promise.resolve();
  assert.ok(persistenceSaves >= 1, `${variant} requests a high-value persistence flush on capture loss`);

  adapter.resize({ requestedWidth: 1111, requestedHeight: 777 });
  if (requestedProfile === 'modernized') {
    assert.deepEqual(nativeResizes.at(-1), [1111, 777], `${variant} resizes its native backbuffer immediately`);
    now += 900;
    nativeFrames += 120;
    intervals.at(-1)();
    assert.equal(sandbox.document.documentElement.dataset.doomBackbuffer, '1111x777',
      `${variant} reports the authoritative native backbuffer after resize`);
    assert.equal(sandbox.document.documentElement.dataset.doomTargetFps, '120',
      `${variant} reports its configured native FPS ceiling`);
    assert.equal(sandbox.document.documentElement.dataset.doomAudioDevices, '1',
      `${variant} reports exactly one active native mixer device`);
    assert.equal(sandbox.document.documentElement.dataset.doomAudioCallbacks, '42',
      `${variant} reports native mixer callback progress`);
    assert.equal(sandbox.document.documentElement.dataset.doomFps, '120.0',
      `${variant} measures delivered browser main-loop frames`);
  } else {
    assert.equal(nativeResizes.length, 0, `${variant} keeps the fixed classic backbuffer`);
  }
}

(async () => {
  assert.equal(config.fullscreen, true);
  assert.equal(config.identity, false);
  assert.equal(config.controller.mode, 'disabled');
  assert.equal(config.persistence.root, '/persistent/idtech1/{variant}');
  assert.deepEqual(Object.keys(config.variants), Object.keys(dataManifest.variants));
  assert.equal(Object.keys(config.variants).length, 7);
  for (const [variant, policy] of Object.entries(config.variants)) {
    assert.equal(policy.pwa.icons.length, 2, `${variant} supplies both PWA icon sizes`);
    assert.ok(policy.icon, `${variant} supplies launcher/favicon artwork`);
    assert.equal(dataManifest.variants[variant].files.every(file => file.validator), true);
    await exercise(variant, 'original');
    await exercise(variant, 'smooth');
    if (modernVariants.has(variant)) {
      assert.equal(policy.resizeTransition, 'immediate');
      await exercise(variant, 'modernized');
      await exercise(variant, 'modernized', { migrated: true });
    }
  }
  console.log('Verified all 7 id Tech 1 variants across controller, persistence, profile, state, capture, resize, PWA, and data-cache contracts.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
