#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const web = path.resolve(process.argv[2] || path.join(__dirname, '../web'));
const source = fs.readFileSync(path.join(web, 'game-adapter.js'), 'utf8');
const config = JSON.parse(fs.readFileSync(path.join(web, 'wasm-game.json'), 'utf8'));
const dataManifest = JSON.parse(fs.readFileSync(path.join(web, 'wasm-game-data.json'), 'utf8'));
const expectedFiles = {
  jill1: 28,
  jill2: 27,
  jill3: 34,
  jazz: 66,
  duke1: 55,
  duke2: 7,
  gta: 89,
  nfs: 360,
  simcity2000: 30
};
const expectedControllerKeys = {
  jill1: [304, 308, 13, 27],
  jill2: [304, 308, 13, 27],
  jill3: [304, 308, 13, 27],
  jazz: [308, 32, 306, 304, 27],
  duke1: [306, 308, 13, 27],
  duke2: [306, 308, 13, 27],
  gta: [32, 306, 13, 122, 120, 9, 287],
  nfs: [32, 13, 9, 27],
  simcity2000: [13, 27]
};
const forbiddenNormalCopy = /files?|data|cache|container|browser|mount|verif|director(?:y|ies)|folders?|paths?|legal|licen[cs]|copyright|warrant/i;

assert.equal(config.identity, false);
assert.equal(config.graphics, false);
assert.equal(config.pointerLock, false);
assert.equal(config.menuCursor, 'none');
assert.equal(config.variants.simcity2000.menuCursor, 'native');
assert.equal(config.variants.nfs.pointerLock, true);
assert.equal(config.variants.nfs.menuCursor, 'native');
assert.ok(Object.entries(config.variants).every(([variant, value]) =>
  variant === 'nfs' || value.pointerLock !== true), 'only NFS requests relative pointer capture');
assert.equal(config.fullscreen, true);
assert.equal(config.displayMode, '4:3');
assert.equal(config.controller.mode, 'disabled');
assert.equal(config.persistence.root, '/persistent/dosbox/{variant}');
assert.doesNotMatch(config.description, forbiddenNormalCopy,
  'suite ready copy must stay game-focused');
const persistenceRoots = new Set();
for (const [variant, value] of Object.entries(config.variants)) {
  assert.doesNotMatch(value.description, forbiddenNormalCopy,
    `${variant} ready copy must stay game-focused`);
  assert.ok(value.icon);
  assert.ok(value.pwa?.icons?.length);
  const persistenceRoot = config.persistence.root.replace('{variant}', variant);
  assert.match(persistenceRoot, new RegExp(`/persistent/dosbox/${variant}$`));
  assert.ok(!persistenceRoots.has(persistenceRoot), `${variant} needs an isolated IDBFS root`);
  persistenceRoots.add(persistenceRoot);
  const manifest = dataManifest.variants[variant];
  assert.equal(manifest?.files.length, expectedFiles[variant], `${variant} has the curated file set`);
  assert.ok(manifest.executable);
  assert.ok(manifest.commands.includes(manifest.executable) ||
    manifest.commands.some(command => command.includes(manifest.executable)));
  assert.ok(manifest.commands.every(command => typeof command === 'string' && command.trim()));
  assert.ok(manifest.dosboxArguments.every(argument => typeof argument === 'string' && argument.trim()));
  assert.equal(new Set(manifest.files.map(file => file.key)).size, manifest.files.length);
  assert.equal(new Set(manifest.files.map(file => file.mountName || file.name)).size, manifest.files.length);
  for (const file of manifest.files) {
    assert.match(file.sha256, /^[a-f0-9]{64}$/);
    assert.ok(file.size > 0);
  }
}
assert.deepEqual(Object.keys(config.variants), Object.keys(expectedFiles));
assert.deepEqual(Object.keys(dataManifest.variants), Object.keys(expectedFiles));
assert.equal(persistenceRoots.size, 9);

async function exercise(variant, { existingSound, soundStatus = 200, sourceOverride = source, keyboardProbe, basePath = '/' } = {}) {
  const publicUrl = value => value.startsWith(basePath) && basePath !== '/'
    ? value : basePath + value.replace(/^\//, '');
  const transitions = [];
  const launches = [];
  const nativeInput = [];
  const loading = [];
  let createdPolicy;
  let loadedPolicy;
  let moduleOptions;
  let dirtyCount = 0;
  const canvasListeners = new Map();
  const documentListeners = new Map();
  const windowListeners = new Map();
  const persistenceRoot = `/persistent/dosbox/${variant}`;
  const gameRoot = `${persistenceRoot}/game`;
  const soundPath = `${gameRoot}/GTADOS/DIG.INI`;
  const files = new Map(existingSound === undefined ? [] : [[soundPath, existingSound]]);
  const configRoot = `${persistenceRoot}/.dosbox`;
  function element(type) {
    const listeners = new Map(), attributes = new Map();
    return {
      tagName: type.toUpperCase(), children: [], style: {}, listeners,
      addEventListener(name, listener) { listeners.set(name, listener); },
      setAttribute(name, value) { attributes.set(name, value); },
      getAttribute(name) { return attributes.get(name); },
      appendChild(child) { this.children.push(child); },
      focus() {
        if (document.activeElement === canvas) canvasListeners.get('blur')?.();
        document.activeElement = this;
      }
    };
  }
  const canvas = {
    width: 640,
    height: 400,
    addEventListener(type, listener) { canvasListeners.set(type, listener); },
    focus() { document.activeElement = canvas; launches.push(['focus']); }
  };
  const nativeWrite = (stream, buffer) => {
    launches.push(['write', stream.path, buffer.length]);
    return buffer.length;
  };
  const module = {
    FS: {
      chdir(directory) { launches.push(['chdir', directory]); },
      chmod(file, mode) { launches.push(['chmod', file, mode]); },
      writeFile(file, contents) { files.set(file, contents); launches.push(['writeFile', file, contents]); },
      analyzePath(file) { return { exists: files.has(file) }; },
      getPath(node) { return node.path; },
      write: nativeWrite
    },
    ccall(name, returnType, argumentTypes, arguments_) {
      launches.push(['ccall', name, returnType, Array.from(argumentTypes), Array.from(arguments_)]);
    },
    callMain(arguments_) { launches.push(['callMain', Array.from(arguments_)]); throw 'unwind'; },
    _DOSBox_WasmControllerKey(code, pressed) { nativeInput.push(['key', code, pressed]); },
    _DOSBox_WasmControllerMouse(x, y) { nativeInput.push(['mouse', x, y]); },
    _DOSBox_WasmControllerButton(button, pressed) { nativeInput.push(['button', button, pressed]); },
    _DOSBox_WasmCanvasWidth() { return 640; },
    _DOSBox_WasmCanvasHeight() { return 400; }
  };
  const document = {
    visibilityState: 'visible',
    addEventListener(type, listener) { documentListeners.set(type, listener); },
    createElement: element,
    head: {
      appendChild(script) {
        assert.equal(script.src, basePath + 'dosbox.js');
        sandbox.createDosBoxModule = async options => { moduleOptions = options; return module; };
        queueMicrotask(script.onload);
      }
    }
  };
  const sandbox = {
    console, document, WasmGameFramework: { publicUrl },
    addEventListener(type, listener) { windowListeners.set(type, listener); },
    setTimeout(callback) { callback(); return 1; },
    crypto: { subtle: { digest: async () => new ArrayBuffer(32) } },
    fetch: async request => {
      if (request === basePath + 'gta-sound.ini') return {
        ok: soundStatus === 200, status: soundStatus,
        text: async () => fs.readFileSync(path.join(web, 'gta-sound.ini'), 'utf8')
      };
      if (request === basePath + 'browser-pointer.conf') return {
        ok: true,
        text: async () => fs.readFileSync(path.join(web, 'browser-pointer.conf'), 'utf8')
      };
      assert.equal(request, basePath + 'wasm-game-data.json');
      return { ok: true, json: async () => dataManifest };
    }
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(sourceOverride, sandbox, { filename: 'game-adapter.js' });
  const adapter = sandbox.WasmGameAdapter;
  const context = {
    variant,
    config: config.variants[variant],
    elements: { canvas, runtime: element('section') },
    framework: {
      createOwnerDataSet(policy) { createdPolicy = policy; return policy; },
      async mountOwnerFiles(currentModule, data, options) {
        assert.equal(currentModule, module);
        assert.equal(data.policy, createdPolicy);
        assert.equal(options.root, gameRoot);
        assert.equal(options.preservePaths, dataManifest.variants[variant].preservePaths === true);
        launches.push(['mount', options.root]);
      }
    },
    persistence: {
      root: persistenceRoot,
      async attach(FS, options) {
        assert.equal(FS, module.FS);
        assert.equal(options.root, persistenceRoot);
        launches.push(['attach', options.root]);
      },
      markDirty() { dirtyCount++; }
    },
    dataClient: {
      async load(policy, options) {
        loadedPolicy = policy;
        await assert.rejects(
          policy.files[0].validate({ arrayBuffer: async () => new ArrayBuffer(0) }),
          /failed SHA-256 verification/
        );
        options.onProgress({ phase: 'checking-cache', key: policy.files[0].key });
        options.onProgress({ phase: 'downloading', key: policy.files[0].key, received: 1, total: 2 });
        options.onProgress({ phase: 'restored', key: policy.files[0].key });
        return { policy, entries: policy.files.map(file => ({ policy: file })) };
      }
    },
    shell: { async resumeAudio() {} },
    setLoading(...detail) { loading.push(detail); }, log() {},
    setEngineState(state) { transitions.push(state); },
    showRuntime(state) { transitions.push(state); }
  };

  assert.equal(adapter.readEngineState(), 'launcher');
  await adapter.init(context);
  const modeButton = context.elements.runtime.children[0]?.children[0];
  const hasMode = ['jill1', 'jill2', 'jill3', 'jazz', 'duke1', 'duke2'].includes(variant);
  assert.equal(Boolean(modeButton), hasMode, `${variant}: scope movement controls to six platformers`);
  if (hasMode) {
    assert.equal(modeButton.disabled, true, 'mode control must wait until the game starts');
    assert.equal(modeButton.type, 'button');
    assert.equal(modeButton.getAttribute('aria-pressed'), 'false');
    assert.match(modeButton.textContent, /Off/);
    assert.match(modeButton.title, /Arrow keys work in either mode/);
    assert.match(config.variants[variant].description, /Turn it off for menus and save names/);
  }
  const pending = adapter.start(context);
  assert.equal(adapter.readEngineState(), 'loading');
  if (variant === 'gta' && existingSound === undefined && soundStatus !== 200) {
    await assert.rejects(pending, /GTA sound configuration failed with HTTP 503/);
    assert.equal(adapter.readEngineState(), 'launcher');
    assert.ok(!launches.some(call => call[0] === 'callMain'));
    return;
  }
  await pending;
  assert.equal(createdPolicy.namespace, dataManifest.variants[variant].namespace);
  assert.deepEqual(createdPolicy.files.map(file => file.mountName),
    dataManifest.variants[variant].files.map(file => file.mountName || file.name));
  assert.equal(loadedPolicy, createdPolicy);
  moduleOptions.setStatus('Mounting owner data from cache');
  assert.doesNotMatch(loading.flat().join('\n'), forbiddenNormalCopy,
    'normal loading copy must remain title-focused');
  assert.equal(adapter.readEngineState(), 'gameplay');
  assert.equal(moduleOptions.keyboardListeningElement, canvas,
    'SDL must not capture keys used on HTML controls');
  if (hasMode) assert.equal(modeButton.disabled, false);
  if (keyboardProbe) await keyboardProbe({ canvasListeners, modeButton, module });
  const enterEvent = {
    code: 'Enter', repeat: false,
    stopImmediatePropagation() {}, preventDefault() {}
  };
  canvasListeners.get('keydown')(enterEvent);
  canvasListeners.get('keyup')(enterEvent);
  assert.deepEqual(nativeInput.slice(-2), [['key', 13, 1], ['key', 13, 0]],
    `${variant} must explicitly queue browser Enter into native DOSBox`);
  for (const [code, value] of [['ArrowLeft', 276], ['ArrowRight', 275], ['KeyA', 97], ['Backspace', 8]]) {
    const event = { ...enterEvent, code };
    canvasListeners.get('keydown')(event);
    canvasListeners.get('keyup')(event);
    assert.deepEqual(nativeInput.slice(-2), [['key', value, 1], ['key', value, 0]],
      `${variant} must forward ${code} press and release`);
  }
  checkKeyboardPolicy({ variant, adapter, context, canvasListeners, documentListeners, windowListeners,
    document, modeButton, nativeInput });
  const pointerStart = nativeInput.length;
  adapter.pointerMove({ captured: false, movementX: 20, movementY: 30 }, null, context);
  if (variant === 'nfs') {
    const mouseEvent = { ...enterEvent, button: 0 };
    let suppressed = 0;
    canvasListeners.get('mousemove')({ stopImmediatePropagation() { suppressed++; } });
    assert.equal(suppressed, 1, 'NFS must suppress the duplicate SDL DOM mouse path');
    canvasListeners.get('pointerdown')();
    document.pointerLockElement = canvas;
    adapter.inputCaptureChanged(true, context);
    canvasListeners.get('mousedown')(mouseEvent);
    canvasListeners.get('mouseup')(mouseEvent);
    assert.equal(nativeInput.length, pointerStart, 'the acquisition click must not select a native menu item');

    adapter.pointerMove({ captured: true, movementX: 0.6, movementY: -0.4 }, null, context);
    adapter.pointerMove({ captured: true, movementX: 0.6, movementY: -0.4 }, null, context);
    adapter.pointerMove({ captured: true, movementX: 0.1, movementY: -0.4 }, null, context);
    assert.deepEqual(nativeInput.slice(pointerStart), [['mouse', 1, 0], ['mouse', 0, -1]],
      'captured NFS motion must be queued once, retaining fractional deltas');
    canvasListeners.get('pointerdown')();
    canvasListeners.get('mousedown')(mouseEvent);
    canvasListeners.get('mousedown')(mouseEvent);
    canvasListeners.get('mouseup')(mouseEvent);
    assert.deepEqual(nativeInput.slice(-2), [['button', 0, 1], ['button', 0, 0]],
      'captured NFS button changes must be delivered exactly once');

    canvasListeners.get('mousedown')(mouseEvent);
    canvasListeners.get('keydown')({ ...enterEvent, code: 'ArrowUp' });
    document.pointerLockElement = null;
    adapter.inputCaptureChanged(false, context);
    assert.deepEqual(nativeInput.slice(-2), [['key', 273, 0], ['button', 0, 0]],
      'capture loss must release held NFS keys and buttons');
    adapter.captureLost({}, context);
    assert.deepEqual(nativeInput.slice(-2), [['key', 27, 1], ['key', 27, 0]],
      'capture loss must return control to the native pause/menu UI');
    const paused = nativeInput.length;
    adapter.captureLost({}, context);
    assert.equal(nativeInput.length, paused, 'repeated loss notification must not inject Escape twice');
    const released = nativeInput.length;
    canvasListeners.get('mousedown')(mouseEvent);
    adapter.pointerMove({ captured: false, movementX: 50, movementY: 60 }, null, context);
    adapter.pointerMove({ captured: true, movementX: 0.8, movementY: -0.8 }, null, context);
    assert.equal(nativeInput.length, released, 'released motion/buttons are ignored and capture loss clears fractional motion');
    adapter.inputCaptureChanged(false, context);
    adapter.inputCaptureChanged(true, context);
    canvasListeners.get('keydown')({ ...enterEvent, code: 'Escape' });
    canvasListeners.get('keyup')({ ...enterEvent, code: 'Escape' });
    const escaped = nativeInput.length;
    adapter.inputCaptureChanged(false, context);
    adapter.captureLost({}, context);
    assert.equal(nativeInput.length, escaped, 'a delivered Escape must not be doubled by capture loss');
  } else {
    adapter.pointerMove({ captured: true, movementX: 20, movementY: 30 }, null, context);
    adapter.inputCaptureChanged(false, context);
    assert.equal(nativeInput.length, pointerStart, `${variant}: NFS relative mouse policy must not leak`);
    assert.ok(!canvasListeners.has('mousedown'), `${variant}: native SDL mouse input must remain installed`);
  }
  assert.deepEqual(transitions, ['loading', 'gameplay']);
  const invocation = launches.find(call => call[0] === 'callMain');
  assert.ok(invocation);
  const absolutePointer = variant === 'nfs' || variant === 'simcity2000';
  assert.deepEqual(invocation[1], [
    ...dataManifest.variants[variant].dosboxArguments,
    '-userconf',
    ...(absolutePointer ? ['-conf', '/browser-pointer.conf'] : []),
    ...dataManifest.variants[variant].commands.flatMap(command => [
      '-c', command.replaceAll('/game', gameRoot)
    ])
  ]);
  const operations = launches.map(call => call[0]);
  assert.ok(operations.indexOf('attach') < operations.indexOf('mount'));
  assert.ok(operations.indexOf('mount') < operations.indexOf('callMain'));
  const configWrites = launches.filter(call => call[0] === 'writeFile');
  const seedSound = variant === 'gta' && existingSound === undefined;
  assert.deepEqual(configWrites, absolutePointer ? [[
    'writeFile', '/browser-pointer.conf', fs.readFileSync(path.join(web, 'browser-pointer.conf'), 'utf8')
  ]] : seedSound ? [[
    'writeFile', soundPath, fs.readFileSync(path.join(web, 'gta-sound.ini'), 'utf8')
  ]] : [], `${variant} must only apply its intended defaults`);
  if (variant === 'gta') {
    assert.equal(files.get(soundPath), existingSound ?? fs.readFileSync(path.join(web, 'gta-sound.ini'), 'utf8'));
    if (seedSound) {
      assert.match(files.get(soundPath), /^DRIVER\s+SB16\.DIG$/m);
      assert.ok(operations.indexOf('writeFile') < operations.indexOf('callMain'));
    }
  }
  if (absolutePointer) {
    assert.match(configWrites[0][2], /^autolock=false$/m);
    assert.match(configWrites[0][2], /^sensitivity=100$/m);
    assert.ok(operations.indexOf('writeFile') < operations.indexOf('callMain'));
  }
  assert.deepEqual(launches.find(call => call[0] === 'ccall'), [
    'ccall', 'DOSBox_WasmSetHome', null, ['string'], [persistenceRoot]
  ]);
  assert.ok(launches.some(call => call[0] === 'chdir' && call[1] === gameRoot));
  assert.equal(launches.filter(call => call[0] === 'chmod').length,
    dataManifest.variants[variant].files.length);
  assert.ok(launches.filter(call => call[0] === 'chmod').every(call =>
    call[1].startsWith(`${gameRoot}/`) && call[2] === 0o600));
  assert.ok(moduleOptions && moduleOptions.canvas === canvas);
  assert.equal(moduleOptions.locateFile('dosbox.wasm'), basePath + 'dosbox.wasm');
  assert.equal(moduleOptions.locateFile('/dosbox.wasm'), basePath + 'dosbox.wasm');
  assert.equal(moduleOptions.locateFile(basePath + 'dosbox.wasm'), basePath + 'dosbox.wasm');

  module.FS.write({ path: `${configRoot}/dosbox-0.74-3.conf` }, new Uint8Array(4));
  module.FS.write({ node: { path: `${gameRoot}/SAVE.DAT` } }, new Uint8Array(8));
  module.FS.write({ path: '/tmp/not-persistent' }, new Uint8Array(2));
  assert.equal(dirtyCount, 2 + Number(seedSound), `${variant} config and save writes mark IDBFS dirty`);

  const actions = {
    forward: 1, backward: 1, left: 1, right: 1,
    jump: 1, attack: 1, altAttack: 1, weapon: 1,
    previousWeapon: 1, nextWeapon: 1, scoreboard: 1,
    menu: 1, sprint: 1, lookX: 0.8, lookY: -0.6
  };
  adapter.controllerFrame({ actions, deltaMs: 20 }, context);
  for (const code of [273, 274, 275, 276, ...expectedControllerKeys[variant]]) {
    assert.ok(nativeInput.some(call => call[0] === 'key' && call[1] === code && call[2] === 1),
      `${variant} controller must press SDL key ${code}`);
  }
  if (variant === 'simcity2000') {
    assert.ok(nativeInput.some(call => call[0] === 'mouse' && call[1] && call[2]));
    assert.ok(nativeInput.some(call => call[0] === 'button' && call[1] === 0 && call[2] === 1));
    assert.ok(nativeInput.some(call => call[0] === 'button' && call[1] === 1 && call[2] === 1));
  }
  adapter.controllerChanged({ connected: false });
  assert.ok(nativeInput.some(call => call[0] === 'key' && call[2] === 0),
    `${variant} disconnect must release native held keys`);
  if (variant === 'simcity2000') {
    assert.ok(nativeInput.some(call => call[0] === 'button' && call[2] === 0),
      'SimCity 2000 disconnect must release native mouse buttons');
  }

  moduleOptions.onAbort('diagnostic stop');
  if (hasMode) assert.equal(modeButton.disabled, true);
  assert.equal(adapter.readEngineState(), 'crashed');
  assert.equal(transitions.at(-1), 'crashed');
}

function checkKeyboardPolicy({ variant, adapter, context, canvasListeners, documentListeners, windowListeners,
  document, modeButton, nativeInput }) {
  const dispatch = (type, code, extra = {}) => {
    let stopped = false, prevented = false;
    canvasListeners.get(type)({ code, repeat: false, ...extra,
      stopImmediatePropagation() { stopped = true; }, preventDefault() { prevented = true; }
    });
    assert.ok(stopped && prevented, `${variant}: ${type} ${code} must not fall through to SDL`);
  };
  const down = (code, extra) => dispatch('keydown', code, extra);
  const up = code => dispatch('keyup', code);
  const tap = code => { down(code); up(code); };
  const equalSince = (index, expected, why) => assert.deepEqual(nativeInput.slice(index), expected, `${variant}: ${why}`);
  const keys = [['KeyW', 119, 273], ['KeyA', 97, 276], ['KeyS', 115, 274], ['KeyD', 100, 275]];
  for (const [physical, value] of keys) {
    const index = nativeInput.length;
    tap(physical);
    equalSince(index, [['key', value, 1], ['key', value, 0]], 'original mode must preserve WASD letters');
  }
  for (const [left, right, value] of [
    ['ShiftLeft', 'ShiftRight', 304], ['ControlLeft', 'ControlRight', 306],
    ['AltLeft', 'AltRight', 308], ['Enter', 'NumpadEnter', 13]
  ]) {
    const index = nativeInput.length;
    down(left); down(right); up(left);
    equalSince(index, [['key', value, 1]], 'physical aliases must keep their own ownership');
    up(right);
    equalSince(index, [['key', value, 1], ['key', value, 0]], 'last physical alias releases the DOS key');
  }
  let index = nativeInput.length;
  down('KeyS'); down('KeyS'); down('KeyS', { repeat: true }); up('KeyS'); up('KeyS');
  equalSince(index, [['key', 115, 1], ['key', 115, 0]], 'repeats, duplicates and unmatched releases are consumed');
  const controller = actions => adapter.controllerFrame({ actions, deltaMs: 20 }, context);
  for (const keyboardReleasesFirst of [true, false]) {
    index = nativeInput.length;
    down('ArrowUp'); controller({ forward: 1 });
    if (keyboardReleasesFirst) up('ArrowUp');
    else adapter.controllerChanged({ connected: false });
    equalSince(index, [['key', 273, 1]], 'keyboard and controller must not release each other');
    if (keyboardReleasesFirst) adapter.controllerChanged({ connected: false });
    else up('ArrowUp');
    equalSince(index, [['key', 273, 1], ['key', 273, 0]], 'last input source releases the DOS key');
  }
  if (modeButton) {
    const toggle = () => modeButton.listeners.get('click')();
    toggle();
    assert.equal(modeButton.getAttribute('aria-pressed'), 'true');
    assert.match(modeButton.textContent, /On/);
    assert.equal(document.activeElement, context.elements.canvas, 'mode toggle restores game focus');
    for (const [physical, , value] of keys) {
      index = nativeInput.length;
      tap(physical);
      equalSince(index, [['key', value, 1], ['key', value, 0]], 'WASD mode must send native arrow keys');
    }
    for (const [physical, value] of [['ArrowUp', 273], ['ArrowDown', 274], ['ArrowLeft', 276], ['ArrowRight', 275],
      ['KeyQ', 113], ['Digit9', 57], ['Backspace', 8], ['Tab', 9], ['Escape', 27]]) {
      index = nativeInput.length;
      tap(physical);
      equalSince(index, [['key', value, 1], ['key', value, 0]], 'WASD mode must preserve other keys and arrows');
    }
    for (const first of ['KeyW', 'ArrowUp']) {
      const second = first === 'KeyW' ? 'ArrowUp' : 'KeyW';
      index = nativeInput.length;
      down(first); down(second); up(first);
      equalSince(index, [['key', 273, 1]], 'W and Up must not release each other');
      up(second);
      equalSince(index, [['key', 273, 1], ['key', 273, 0]], 'last movement alias releases Up');
    }
    index = nativeInput.length;
    down('KeyW'); toggle();
    equalSince(index, [['key', 273, 1], ['key', 273, 0]], 'mode change releases the original translated key');
    down('KeyW', { repeat: true }); up('KeyW');
    equalSince(index, [['key', 273, 1], ['key', 273, 0]], 'held key must not turn into text after switching modes');
    assert.equal(modeButton.getAttribute('aria-pressed'), 'false');
    index = nativeInput.length;
    for (const physical of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Digit9', 'Digit0', 'Digit6', 'Backspace', 'Digit6', 'Enter']) tap(physical);
    equalSince(index, [119, 97, 115, 100, 57, 48, 54, 8, 54, 13].flatMap(value => [
      ['key', value, 1], ['key', value, 0]
    ]), 'switching off restores save-name characters, Backspace and Enter');
    index = nativeInput.length;
    down('KeyA'); toggle(); up('KeyA');
    equalSince(index, [['key', 97, 1], ['key', 97, 0]], 'switching on releases a held letter without a phantom arrow');
    index = nativeInput.length;
    down('KeyW'); down('ShiftLeft'); down('Tab', { shiftKey: true });
    equalSince(index, [['key', 273, 1], ['key', 304, 1], ['key', 273, 0], ['key', 304, 0]],
      'Shift+Tab releases movement/modifiers and never sends Tab to DOS');
    assert.equal(document.activeElement, modeButton, 'Shift+Tab must reach the visible control');
    let prevented = false;
    modeButton.listeners.get('keydown')({ code: 'Escape', preventDefault() { prevented = true; } });
    assert.ok(prevented);
    assert.equal(document.activeElement, context.elements.canvas, 'Escape leaves controls without a native menu action');
    for (const loss of ['blur', 'window-blur', 'visibilitychange']) {
      index = nativeInput.length;
      down('KeyW'); down('ArrowUp'); down('KeyD');
      if (loss === 'blur') canvasListeners.get('blur')();
      else if (loss === 'window-blur') windowListeners.get('blur')();
      else {
        document.visibilityState = 'hidden';
        documentListeners.get('visibilitychange')();
        document.visibilityState = 'visible';
      }
      for (const code of ['KeyW', 'ArrowUp', 'KeyD']) up(code);
      equalSince(index, [['key', 273, 1], ['key', 275, 1], ['key', 273, 0], ['key', 275, 0]],
        `${loss} releases held movement exactly once`);
    }
    toggle();
    assert.equal(modeButton.getAttribute('aria-pressed'), 'false');
  } else {
    index = nativeInput.length;
    down('Tab', { shiftKey: true }); up('Tab');
    equalSince(index, [['key', 9, 1], ['key', 9, 0]], 'platformer focus shortcut must not leak to other games');
  }
}

if (require.main === module) (async () => {
  for (const variant of Object.keys(config.variants)) await exercise(variant);
  for (const variant of Object.keys(config.variants)) await exercise(variant, { basePath: `/${variant}/` });
  await exercise('gta', { existingSound: 'DEVICE None\nDRIVER NULL\n' });
  await exercise('gta', { existingSound: '' });
  await exercise('gta', { soundStatus: 503 });
  for (const [name, original, replacement, expected] of [
    ['missing movement translation', 'runtime.wasd ? (wasdKeys[event.code] || original) : original',
      'original', /WASD mode must send native arrow keys/],
    ['blanket letter remap', 'runtime.wasd ? (wasdKeys[event.code] || original) : original',
      '(wasdKeys[event.code] || original)', /must forward KeyA/],
    ['unowned alias release', 'if (wasDown !== isDown) nativeKey(code, isDown);',
      'nativeKey(code, pressed);', /physical aliases must keep their own ownership/],
    ['held key across toggle', 'if (button.disabled) return;\n      releaseKeyboard();',
      'if (button.disabled) return;', /mode change releases the original translated key/]
  ]) {
    const changed = source.replace(original, replacement);
    assert.notEqual(changed, source, `${name}: negative control must alter the real adapter`);
    await assert.rejects(exercise('jill1', { sourceOverride: changed }), expected, name);
  }
  const oldRepeat = source.replace('if (!original || !runtime.started) return;',
    'if (!original || !runtime.started || (pressed && event.repeat)) return;');
  assert.notEqual(oldRepeat, source);
  await assert.rejects(exercise('jill1', { sourceOverride: oldRepeat }), /must not fall through to SDL/);
  console.log('DOSBox adapter persistence, controller, loading, gameplay, abort, display, and PWA contracts passed for 9 variants');
  console.log('WASD/typing policy, physical/controller ownership, focus/repeat cleanup and 5 negative controls passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

module.exports = { exercise };
