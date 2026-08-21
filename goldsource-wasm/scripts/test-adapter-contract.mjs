#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(path.join(repo, 'src/framework-adapter.js'), 'utf8')
  .replace(/^import .*;\n/gm, '');
const config = JSON.parse(readFileSync(path.join(repo, 'web/wasm-game.json'), 'utf8'));
const dataManifest = JSON.parse(readFileSync(path.join(repo, 'web/wasm-game-data.json'), 'utf8'));
const variants = ['half-life', 'blue-shift', 'opposing-force', 'counter-strike'];
const nativePatch = readFileSync(path.join(repo, 'patches/xash-framework-contract.patch'), 'utf8');
const menuPatch = readFileSync(path.join(repo, 'patches/xash-no-quit.patch'), 'utf8');

for (const symbol of [
  'WasmGame_RuntimeState', 'WasmGame_CaptureIntent', 'WasmGame_PlayerNameStatus', 'WasmGame_Resize',
  'WasmGame_SetInputCaptured', 'WasmGame_PointerMove', 'WasmGame_PointerDelta',
  'WasmGame_ControllerAction', 'WasmGame_ControllerMouse'
]) {
  assert.match(nativePatch, new RegExp(symbol), `native patch must export ${symbol}`);
}
assert.match(nativePatch, /cl\.players\[cl\.playernum\]\.name/,
  'identity verification must inspect the server-populated scoreboard name');
assert.match(nativePatch, /Key_IsDown\( K_TAB \)[\s\S]*scoreboard/,
  'native state must release capture while the scoreboard is held');
assert.match(nativePatch, /emscripten_get_pointerlock_status[\s\S]*wasm_game_input_captured/,
  'native relative mouse mode must follow framework-owned pointer lock');
assert.match(nativePatch, /Key_Event\( key, pressed \? true : false \)/,
  'controller buttons must enter Xash native key input');
assert.match(nativePatch, /SDL_GetRelativeMouseState[\s\S]*wasm_controller_mouse_x/,
  'controller look must enter Xash native relative-mouse input');
assert.match(menuPatch, /^-\s*AddItem\( customGame \);/m,
  'browser menu patch must remove Custom game');
assert.match(menuPatch, /^-\s*AddItem\( minimizeBtn \);/m,
  'browser menu patch must remove the meaningless minimize control');
assert.doesNotMatch(source, /createPersistentFs/,
  'the adapter must use framework-managed persistence');

assert.equal(config.fullscreen, true);
assert.equal(config.displayMode, 'dynamic');
assert.equal(config.nativeManaged, false);
assert.equal(config.syncBackbuffer, true);
assert.equal(config.resizeTransition, 'immediate');
assert.equal(config.controller.mode, 'disabled');
assert.equal(config.persistence.root, '/persistent/goldsource/{variant}');

for (const variant of variants) {
  const definition = config.variants[variant];
  assert.ok(definition.pwa?.id && definition.pwa.icons.length === 2, `${variant} needs PWA metadata`);
  assert.doesNotMatch(definition.description, /\b(required|files?|cache(?:d|s|ing)?|provision)\b/i,
    `${variant} ready-state description must only describe the game`);
  assert.match(definition.provisioningText, /files/i, `${variant} missing-data UI needs file guidance`);
  await exerciseVariant(variant);
}

async function exerciseVariant(variant) {
  const listeners = new Map();
  const instances = [];
  const sockets = [];
  const stateHistory = [];
  const stateTransitions = [];
  const loading = [];
  const mounts = [];
  const createdPolicies = [];
  const fsWrites = [];
  const lifecycle = [];
  let shellState = 'launcher';
  let saved = 0;
  let now = 1000;
  let nativeState = 0;
  let nativeName = 'Player';
  let serverName = '';
  const nativeCaptureSignals = [];
  const nativePointerMoves = [];
  const nativePointerDeltas = [];
  const nativeResizes = [];
  const controllerActions = [];
  const controllerMouse = [];
  const persistenceRoots = [];
  const symlinks = [];
  let dirtied = 0;
  let preMainCommands = -1;
  let preMainResizes = -1;
  let preMainCommandAccepted = true;

  class MockNet {
    constructor() { this.incoming = { enqueue() {} }; }
  }

  class MockXash {
    constructor(options) {
      this.options = options;
      this.commands = [];
      this.running = false;
      this.em = {
        Module: {
          ccall(name, _returnType, _argumentTypes, args = []) {
            if (name === 'WasmGame_RuntimeState') return nativeState;
            if (name === 'WasmGame_CaptureIntent') return nativeState === 4 ? 1 : 0;
            if (name === 'WasmGame_PlayerNameStatus') {
              if (args[0] !== nativeName) return 0;
              return nativeState === 1 && serverName ? Number(serverName === args[0]) * 2 : 1;
            }
            if (name === 'WasmGame_SetInputCaptured') {
              nativeCaptureSignals.push(args[0]);
              return null;
            }
            if (name === 'WasmGame_PointerMove') {
              nativePointerMoves.push(Array.from(args));
              return null;
            }
            if (name === 'WasmGame_PointerDelta') {
              nativePointerDeltas.push(Array.from(args));
              return null;
            }
            if (name === 'WasmGame_Resize') {
              nativeResizes.push(Array.from(args));
              return null;
            }
            if (name === 'WasmGame_ControllerAction') {
              controllerActions.push(Array.from(args));
              return null;
            }
            if (name === 'WasmGame_ControllerMouse') {
              controllerMouse.push(Array.from(args));
              return null;
            }
            throw new Error(`Unexpected native call ${name}`);
          }
        },
        FS: {
          mkdirTree() {},
          open(file) { return { file, path: file }; },
          write(stream, bytes, _offset, length, position) {
            fsWrites.push({ file: stream.file, length, position, bytes: bytes.slice() });
          },
          close() {},
          chdir(directory) { this.cwd = directory; },
          rmdir(directory) { this.removed = directory; },
          symlink(target, link) { symlinks.push({ target, link }); }
        }
      };
      instances.push(this);
    }
    // The real wrapper reports `running` after WASM initialization, before
    // native main initializes Xash's command pool.
    async init() { this.initialized = true; this.running = true; }
    main() {
      lifecycle.push('main');
      this.running = true;
      this.em.Module.calledRun = true;
    }
    Cmd_ExecuteString(command) {
      this.commands.push(command);
      const match = command.match(/^name "(.*)"$/);
      if (match) nativeName = match[1];
      if (command === 'togglemenu') nativeState = 2;
    }
  }

  class MockSocket {
    static OPEN = 1;
    constructor(endpoint) {
      this.endpoint = String(endpoint);
      this.readyState = MockSocket.OPEN;
      this.messages = [];
      sockets.push(this);
      queueMicrotask(() => this.onmessage?.({
        data: JSON.stringify(['v1:offer', { type: 'offer', sdp: 'test' }])
      }));
    }
    send(message) { this.messages.push(JSON.parse(message)); }
  }

  class MockPeer {
    constructor() { this.connectionState = 'connected'; }
    async setRemoteDescription(description) {
      this.remoteDescription = description;
      for (const label of ['write', 'read']) {
        const channel = {
          label,
          readyState: 'open',
          send() {}
        };
        this.ondatachannel?.({ channel });
        queueMicrotask(() => channel.onopen?.());
      }
    }
    async addIceCandidate() {}
    async createAnswer() { return { type: 'answer', sdp: 'test' }; }
    async setLocalDescription(description) { this.localDescription = description; }
  }

  const windowObject = {
    addEventListener(type, callback) {
      const entries = listeners.get(type) || [];
      entries.push(callback);
      listeners.set(type, entries);
    }
  };
  const sandbox = {
    Blob,
    Net: MockNet,
    Xash3D: MockXash,
    RTCPeerConnection: MockPeer,
    WebSocket: MockSocket,
    URL,
    URLSearchParams,
    Uint8Array,
    Promise,
    Object,
    Math,
    Number,
    String,
    JSON,
    Error,
    console,
    queueMicrotask,
    setTimeout() { return 1; },
    clearTimeout() {},
    setInterval() { return 2; },
    clearInterval() {},
    performance: { now: () => now },
    location: {
      href: `https://games.example.test/?variant=${variant}`,
      protocol: 'https:',
      search: `?variant=${variant}`
    },
    document: { documentElement: { dataset: {} } },
    window: windowObject,
    filesystemUrl: '/artifacts/filesystem.wasm',
    xashUrl: '/artifacts/xash.wasm',
    menuUrl: '/artifacts/menu.wasm',
    webgl2Url: '/artifacts/ref-webgl2.wasm',
    softUrl: '/artifacts/ref-soft.wasm',
    extrasUrl: '/artifacts/extras.pk3',
    hlClientUrl: '/artifacts/hl-client.wasm',
    hlServerUrl: '/artifacts/hl-server.wasm',
    opforClientUrl: '/artifacts/opfor-client.wasm',
    opforServerUrl: '/artifacts/opfor-server.wasm',
    csMenuUrl: '/artifacts/cs-menu.wasm',
    csClientUrl: '/artifacts/cs-client.wasm',
    csServerUrl: '/artifacts/cs-server.wasm',
    fetch: async resource => {
      if (String(resource) === '/wasm-game-data.json') {
        return { ok: true, json: async () => dataManifest };
      }
      assert.equal(String(resource), '/artifacts/extras.pk3');
      return { ok: true, blob: async () => new Blob([new Uint8Array([80, 75, 3, 4])]) };
    }
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'framework-adapter.js' });
  const adapter = sandbox.WasmGameAdapter;
  assert.ok(adapter);

  const canvasListeners = new Map();
  const context = {
    variant,
    config: config.variants[variant],
    elements: { canvas: {
      width: 1280,
      height: 720,
      addEventListener(type, listener, capture) { canvasListeners.set(type, { listener, capture }); }
    } },
    preferences: { values: () => ({ playerName: 'Test; "Player"', targetFps: 90 }) },
    framework: {
      requireCapabilities: () => ({ supported: true, missing: [] }),
      createOwnerDataSet(policy) {
        createdPolicies.push(policy);
        assert.ok(policy.files.every(file => file.mount !== false && file.validateCached === false));
        return { policy };
      },
      async mountOwnerFiles(_module, ownerData, options) {
        mounts.push({ ownerData, options });
      }
    },
    persistence: {
      root: `/persistent/goldsource/${variant}`,
      async attach(_FS, options) {
        adapter.preferencesChanged({ playerName: 'Too Early', targetFps: 60 }, context);
        adapter.resize({ bufferWidth: 900, bufferHeight: 500 });
        preMainCommandAccepted = adapter.executeCommand('god');
        preMainCommands = instances[0].commands.length;
        preMainResizes = nativeResizes.length;
        lifecycle.push('persistence');
        persistenceRoots.push(options.root);
        return {
          root: options.root,
          markDirty() { dirtied += 1; },
          async save() { saved += 1; }
        };
      }
    },
    dataClient: { async load(dataSet) { return dataSet; } },
    shell: {
      engineState: () => shellState,
      async resumeAudio() { context.audioResumed = true; }
    },
    setEngineState(state, options) {
      shellState = state;
      stateHistory.push(state);
      stateTransitions.push({ state, capture: options?.capture === true, event: options?.event });
    },
    setLoading(title, detail, percent) { loading.push({ title, detail, percent }); },
    showRuntime(state) { stateHistory.push(`runtime:${state}`); },
    showLoading() { stateHistory.push('loading'); },
    showLauncher() { stateHistory.push('launcher'); },
    log() {}
  };

  await adapter.init(context);
  assert.equal(canvasListeners.get('mousemove')?.capture, true,
    `${variant} must suppress SDL's duplicate raw mouse path before native startup`);
  await adapter.start(context);
  assert.equal(instances.length, 1);
  const engine = instances[0];
  assert.equal(engine.initialized, true);
  assert.equal(engine.running, true);
  assert.equal(preMainCommands, 0,
    `${variant} must not execute console commands before native main initializes cmd_pool`);
  assert.equal(preMainResizes, 0,
    `${variant} must not enter native resize code before native main is ready`);
  assert.equal(preMainCommandAccepted, false,
    `${variant} must reject external commands until native main is ready`);
  assert.deepEqual(lifecycle, ['persistence', 'main'],
    `${variant} must restore persistence before native main`);
  assert.deepEqual(persistenceRoots, [`/persistent/goldsource/${variant}`]);
  assert.deepEqual(symlinks, [{ target: `/persistent/goldsource/${variant}`, link: '/rwdir' }]);
  assert.equal(engine.em.FS.cwd, '/rwdir', `${variant} must run from the writable framework root`);
  assert.equal(adapter.readEngineState(), 'menu');
  assert.equal(mounts.length, 1);
  assert.equal(mounts[0].options.root, '/rodir');
  assert.equal(mounts[0].options.preservePaths, true);
  assert.ok(createdPolicies[0].files.every(file => !file.key.startsWith('icon-')),
    `${variant} PWA icons must be cached but not mounted into the engine`);
  assert.ok(createdPolicies[0].files.some(file => file.key === 'valve-liblist' && file.mountName === 'valve/liblist.gam'),
    `${variant} must mount the real Valve descriptor before native main`);
  if (variant !== 'half-life') {
    const game = { 'blue-shift': 'bshift', 'opposing-force': 'gearbox', 'counter-strike': 'cstrike' }[variant];
    assert.ok(createdPolicies[0].files.some(file => file.key === `${game}-liblist` && file.mountName === `${game}/liblist.gam`),
      `${variant} must mount its real game descriptor before native main`);
  }
  assert.ok(fsWrites.some(write => write.file === '/rodir/extras.pk3'));
  const persistentStream = engine.em.FS.open('/rwdir/valve/config.cfg', 'w');
  engine.em.FS.write(persistentStream, new Uint8Array([1]), 0, 1, 0);
  assert.equal(dirtied, 1, `${variant} native persistent writes must request a framework flush`);
  assert.ok(loading.every(entry => !/required|cache(?:d|s|ing)?|select .*files/i.test(`${entry.title} ${entry.detail}`)),
    `${variant} normal loading copy must not expose provisioning instructions`);

  const expectedGame = { 'half-life': null, 'blue-shift': 'bshift', 'opposing-force': 'gearbox', 'counter-strike': 'cstrike' }[variant];
  const args = Array.from(engine.options.arguments);
  assert.deepEqual(args.slice(args.indexOf('-width'), args.indexOf('-width') + 4),
    ['-width', '1280', '-height', '720']);
  assert.deepEqual(args.slice(args.indexOf('-rodir'), args.indexOf('-rodir') + 2), ['-rodir', '/rodir']);
  if (expectedGame) assert.deepEqual(args.slice(args.indexOf('-game'), args.indexOf('-game') + 2), ['-game', expectedGame]);
  if (variant === 'counter-strike') {
    assert.equal(args.includes('+sv_cheats'), false, 'multiplayer must not enable cheats');
  } else {
    assert.deepEqual(args.slice(args.indexOf('+sv_cheats'), args.indexOf('+sv_cheats') + 2), ['+sv_cheats', '1'],
      `${variant} must enable cheats for the local single-player server`);
  }
  assert.deepEqual(args.slice(args.indexOf('+name'), args.indexOf('+name') + 2), ['+name', 'Test Player']);
  if (variant === 'opposing-force') {
    assert.equal(engine.options.libraries.client, '/artifacts/opfor-client.wasm',
      'Opposing Force must use its expansion-specific client DLL');
    assert.equal(engine.options.libraries.server, '/artifacts/hl-server.wasm',
      'Opposing Force must keep Xash\'s mandatory generic server slot on the base module');
    assert.deepEqual(Array.from(engine.options.dynamicLibraries), ['dlls/opfor_emscripten_wasm32.wasm'],
      'Opposing Force must preload its server DLL under the Gearbox liblist name');
    assert.equal(engine.options.filesMap['dlls/opfor_emscripten_wasm32.wasm'], '/artifacts/opfor-server.wasm',
      'the Gearbox liblist lookup must resolve to the Opposing Force server DLL');
  }
  if (variant === 'counter-strike') {
    assert.equal(engine.options.networked, true);
    assert.equal(engine.options.renderer, 'gles3compat',
      'Counter-Strike must use the visible WebGL2 renderer instead of the broken software blit loop');
    assert.equal(engine.options.filesMap['/persistent/goldsource/counter-strike/filesystem_stdio.wasm'],
      '/artifacts/filesystem.wasm',
      'the CS DLL dependency must resolve through the persisted /rwdir symlink without a startup error');
    assert.ok(engine instanceof MockXash);
    assert.deepEqual(Array.from(sockets[0].messages.at(-1)), [
      'v1:answer', { type: 'answer', sdp: 'test' }
    ], 'Counter-Strike must answer the versioned signaling protocol used by the dedicated host');
  }

  adapter.preferencesChanged({ playerName: 'Test; "Player"', targetFps: 90 });
  for (const command of [
    'bind w +forward', 'bind s +back', 'bind a +moveleft', 'bind d +moveright',
    'bind CTRL +duck', 'bind r +reload', 'bind b buy', 'bind m chooseteam',
    'bind 1 slot1', 'bind 2 slot2', 'bind 0 slot10',
    'bind MWHEELUP invprev', 'bind MWHEELDOWN invnext',
    'bind MOUSE1 +attack', 'bind MOUSE2 +attack2',
    '+mlook', 'lookstrafe 0', 'lookspring 0', 'm_filter 0',
    'name "Test Player"', 'fps_max 90'
  ]) assert.ok(engine.commands.includes(command), `${variant} did not apply ${command}`);
  assert.equal(engine.commands.includes('sv_cheats 1'), variant !== 'counter-strike',
    `${variant} cheat policy must match its single-player/multiplayer role`);

  nativeState = 4;
  assert.equal(adapter.readEngineState(context), 'loading');
  assert.equal(adapter.readCaptureIntent(), true);
  nativeState = 1;
  serverName = 'Test Player';
  assert.equal(adapter.readEngineState(context), 'gameplay');
  adapter.inputCaptureChanged(true, context);
  assert.equal(nativeCaptureSignals.at(-1), 1);
  assert.equal(adapter.readEngineState(context), 'gameplay');
  assert.equal(context.audioResumed, true);
  adapter.pointerMove({ captured: true, movementX: 17.4, movementY: -8.6 });
  assert.deepEqual(nativePointerDeltas.at(-1), [17, -9],
    `${variant} captured framework deltas must reach native Xash relative input`);
  assert.equal(nativePointerMoves.length, 0,
    `${variant} captured movement must never be interpreted as menu coordinates`);
  if (context.config.identity !== false) {
    assert.equal(sandbox.document.documentElement.dataset.goldsourceIdentity, 'server',
      `${variant} must verify the active server/scoreboard player name`);
  }

  const blankActions = {
    forward: 0, backward: 0, left: 0, right: 0, jump: 0, crouch: 0,
    reload: 0, weapon: 0, previousWeapon: 0, nextWeapon: 0, altAttack: 0,
    attack: 0, scoreboard: 0, menu: 0, sprint: 0, melee: 0, lookX: 0, lookY: 0
  };
  controllerActions.length = 0;
  adapter.controllerFrame({ deltaMs: 20, actions: { ...blankActions, forward: 1, attack: 1, lookX: 1 } });
  assert.ok(controllerActions.some(call => call[0] === 0 && call[1] === 1),
    `${variant} left-stick movement must reach native Xash input`);
  assert.ok(controllerActions.some(call => call[0] === 4 && call[1] === 1),
    `${variant} trigger attack must reach native Xash input`);
  assert.deepEqual(controllerMouse.at(-1), [10, 0],
    `${variant} right-stick look must reach native relative-mouse input`);
  adapter.controllerChanged({ connected: false, activeIndex: null, selection: 'auto' });
  assert.ok(controllerActions.some(call => call[0] === 0 && call[1] === 0),
    `${variant} controller removal must release held native input`);

  nativeState = 0;
  controllerActions.length = 0;
  adapter.controllerFrame({ deltaMs: 16, actions: { ...blankActions, forward: 1, jump: 1 } });
  assert.ok(controllerActions.some(call => call[0] === 17 && call[1] === 1),
    `${variant} controller movement must navigate native menus`);
  assert.ok(controllerActions.some(call => call[0] === 16 && call[1] === 1),
    `${variant} controller face button must confirm native menus`);
  adapter.controllerChanged({ connected: false, activeIndex: null, selection: 'auto' });

  nativeState = 1;
  adapter.captureLost({}, context);
  adapter.inputCaptureChanged(false, context);
  assert.equal(nativeCaptureSignals.at(-1), 0);
  assert.equal(adapter.readEngineState(context), 'paused');
  assert.ok(engine.commands.includes('togglemenu'));
  await Promise.resolve();
  assert.equal(saved, 1);

  nativeState = 3;
  assert.equal(adapter.readEngineState(context), 'debrief');
  nativeState = 1;
  const tabEvent = { key: 'Tab' };
  for (const callback of listeners.get('keyup') || []) callback(tabEvent);
  await Promise.resolve();
  assert.deepEqual(stateTransitions.at(-1), { state: 'gameplay', capture: true, event: tabEvent });

  nativeState = 0;
  const consoleEvent = { key: '`', code: 'Backquote' };
  for (const callback of listeners.get('keyup') || []) callback(consoleEvent);
  nativeState = 1;
  await Promise.resolve();
  assert.deepEqual(stateTransitions.at(-1), { state: 'gameplay', capture: true, event: consoleEvent },
    `${variant} closing the console must recapture input from the console-key gesture`);

  nativeState = 0;
  const pointerEvent = { type: 'pointerup', button: 0 };
  adapter.pointerMove({ x: 321.4, y: 210.6 });
  adapter.pointerButton({ x: 455.2, y: 312.7, pressed: false }, pointerEvent);
  assert.deepEqual(nativePointerMoves.slice(-2), [[321, 211], [455, 313]],
    `${variant} framework pointer coordinates must reach native menus`);
  nativeState = 1;
  assert.equal(adapter.readEngineState(context), 'gameplay');
  assert.deepEqual(stateTransitions.at(-1), { state: 'gameplay', capture: true, event: pointerEvent },
    `${variant} delayed gameplay must capture from the initiating pointer gesture`);
  const resumeToggles = engine.commands.filter(command => command === 'togglemenu').length;
  adapter.captureLost({}, context);
  assert.equal(engine.commands.filter(command => command === 'togglemenu').length, resumeToggles,
    `${variant} stale capture loss during Resume must not reopen the menu`);
  await Promise.resolve();
  assert.deepEqual(stateTransitions.at(-1), { state: 'gameplay', capture: true, event: pointerEvent },
    `${variant} stale Resume unlock must retry the initiating capture gesture`);

  nativeState = 1;
  adapter.inputCaptureChanged(true, context);
  adapter.contextLost({}, context);
  assert.equal(adapter.readEngineState(), 'paused');
  adapter.contextRestored({}, context);
  assert.equal(adapter.readEngineState(context), 'gameplay');
  assert.ok(engine.commands.includes('vid_restart'));
  assert.equal(sandbox.document.documentElement.dataset.goldsourceState, 'gameplay');

  const resize = {
    cssWidth: 1000, cssHeight: 600,
    pixelWidth: 1000, pixelHeight: 600,
    bufferWidth: 1000, bufferHeight: 600
  };
  assert.equal(adapter.resize(resize), resize);
  assert.deepEqual(nativeResizes.at(-1), [1000, 600],
    `${variant} must synchronize native render/menu dimensions to the framework backbuffer`);
  now += 100;
  for (const callback of listeners.get('keydown') || []) callback({ key: 'Escape' });
  const togglesBefore = engine.commands.filter(command => command === 'togglemenu').length;
  adapter.captureLost({}, context);
  assert.equal(engine.commands.filter(command => command === 'togglemenu').length, togglesBefore,
    'Escape-triggered capture loss must not toggle the menu twice');
}

console.log('Verified GoldSource adapter state, capture, controller, persistence, resize, identity, data, and PWA contracts.');
