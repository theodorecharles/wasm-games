#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const site = path.resolve(process.argv[2] || new URL('../build/site', import.meta.url).pathname);
const adapterSource = fs.readFileSync(process.env.IDTECH4_ADAPTER_SOURCE || path.join(site, 'game-adapter.js'), 'utf8');
const config = JSON.parse(fs.readFileSync(path.join(site, 'wasm-game.json'), 'utf8'));
const dataManifest = JSON.parse(fs.readFileSync(path.join(site, 'wasm-game-data.json'), 'utf8'));
const plain = value => JSON.parse(JSON.stringify(value));

assert.equal(config.displayMode, 'dynamic');
assert.equal(config.nativeManaged, true);
assert.equal(config.resizeTransition, 'immediate');
assert.equal(config.pointerWidth, 640);
assert.equal(config.pointerHeight, 480);
assert.equal(config.pointerFit, 'contain');
assert.deepEqual(config.controller, { mode: 'disabled' },
  'controller discovery and launcher controls must remain disabled');
assert.equal(config.persistence.root, '/save/{variant}');
assert.equal(config.dynamicQuality, false, 'an unavailable dynamic controller must not be offered');
assert.equal(config.fps, false, 'an unavailable FPS policy must not be offered');
for (const variant of ['doom3', 'roe', 'quake4', 'prey']) assert.equal(config.variants[variant].identity, false);
for (const variant of ['doom3-mp', 'quake4-mp']) assert.equal(config.variants[variant].identity, true);
for (const [variant, value] of Object.entries(config.variants)) {
  assert.match(value.description, /^Still in development/);
  assert.ok(value.icon && fs.existsSync(path.join(site, value.icon.slice(1))), `${variant} icon must be staged`);
  assert.ok(value.pwa?.icons?.length, `${variant} needs variant-aware PWA icons`);
  for (const icon of value.pwa.icons) assert.ok(fs.existsSync(path.join(site, icon.src.slice(1))), `${variant} PWA icon must be staged`);
}
assert.equal(new Set(Object.keys(config.variants).map(variant => config.persistence.root.replace('{variant}', variant))).size, 6,
  'every suite variant needs an isolated persistence mount');

async function exercise(variant, wakeFailure) {
  const listeners = new Map();
  const globalListeners = new Map();
  const canvasListeners = new Map();
  const messages = [];
  const requests = [];
  const transitions = [];
  const captureRequests = [];
  const userActivation = { isActive: true };
  const loading = [];
  const audioContexts = [];
  const audioSources = [];
  const audioParam = () => ({ value: 1, setValueAtTime(value) { this.value = value; } });
  class FakeAudioContext {
    constructor() {
      this.state = 'running'; this.currentTime = 0; this.destination = {};
      this.listener = { setPosition() {}, setOrientation() {} };
      audioContexts.push(this);
    }
    createGain() { return { gain: audioParam(), connect() {}, disconnect() {} }; }
    createPanner() { return { connect() {}, disconnect() {}, setPosition() {} }; }
    createBuffer(channels, frames, rate) {
      const values = Array.from({ length: channels }, () => new Float32Array(frames));
      return { duration: frames / rate, getChannelData: index => values[index] };
    }
    createBufferSource() {
      const node = {
        playbackRate: audioParam(), connect() {}, disconnect() {}, addEventListener() {},
        start() { this.started = true; }, stop() { this.stopped = true; }
      };
      audioSources.push(node);
      return node;
    }
    resume() { this.state = 'running'; return Promise.resolve(); }
  }
  let createdPolicy;
  let loadedPolicy;
  let canvasTransfers = 0;
  const canvas = {
    id: '', width: 1280, height: 720,
    addEventListener(type, listener) { canvasListeners.set(type, listener); },
    transferControlToOffscreen() { canvasTransfers++; return { kind: 'offscreen' }; }
  };
  const document = {
    visibilityState: 'visible',
    focused: true,
    hasFocus() { return this.focused; },
    location: { search: `?proof=adapter-${variant}` },
    pointerLockElement: null,
    documentElement: { dataset: {} },
    addEventListener(type, listener) { listeners.set(type, listener); }
  };
  class FakeWorker {
    constructor(source) { this.source = source; FakeWorker.instance = this; }
    postMessage(message) { messages.push(message); }
  }
  const sandbox = {
    console, document, navigator: { userActivation }, Worker: FakeWorker, AudioContext: FakeAudioContext,
    location: { search: `?proof=adapter-${variant}` },
    URLSearchParams, AbortSignal,
    addEventListener(type, listener) { globalListeners.set(type, listener); },
    fetch: async (source, options) => {
      requests.push({source, options});
      if (source === '/api/doom3/wake') {
        assert.equal(variant, 'doom3-mp');
        assert.equal(options.method, 'POST');
        assert.equal(messages.length, 0, 'wake must complete before the worker starts');
        if (wakeFailure === 'unauthorized') return {ok: false, status: 401};
        if (wakeFailure === 'failed') return {ok: false, status: 503};
        if (wakeFailure === 'sleeping') return {ok: true, json: async () => ({state: 'sleeping', connect: '127.0.0.1:27666'})};
        if (wakeFailure === 'foreign') return {ok: true, json: async () => ({state: 'running', connect: '8.8.8.8:27666'})};
        return {ok: true, json: async () => ({state: 'running', connect: '127.0.0.1:27666', map: 'game/mp/d3dm1'})};
      }
      assert.equal(source, '/wasm-game-data.json');
      return { ok: true, json: async () => dataManifest };
    }
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(adapterSource, sandbox, { filename: 'game-adapter.js' });
  const adapter = sandbox.WasmGameAdapter;
  assert.equal(sandbox.__idtech4Proof.schemaVersion, 1);
  assert.equal(sandbox.__idtech4Proof.proofId, `adapter-${variant}`);
  assert.equal(JSON.parse(document.documentElement.dataset.idtech4Proof).proofId, `adapter-${variant}`,
    'proof telemetry must be readable through shared DOM state');
  const context = {
    variant,
    config: { ...config, ...config.variants[variant] },
    framework: {
      createOwnerDataSet(policy) { createdPolicy = policy; return policy; }
    },
    persistence: { namespace: `idtech4-${variant}`, root: `/save/${variant}` },
    shell: { resumeAudio() {}, engineState() { return transitions.at(-1) || 'launcher'; } },
    dataClient: {
      async load(policy, options) {
        loadedPolicy = policy;
        options.onProgress({ phase: 'checking-cache', key: policy.files[0].key });
        options.onProgress({ phase: 'downloading', key: policy.files[0].key, received: 1, total: 2 });
        options.onProgress({ phase: 'restored', key: policy.files[0].key });
        return { entries: policy.files.map(file => ({ cached: true, file: {}, policy: { path: file.path, mountName: file.mountName } })) };
      }
    },
    elements: { canvas },
    preferences: { values: () => ({ playerName: 'Browser Marine', qualityProfile: 'ultra' }) },
    setLoading(...detail) { loading.push(detail); }, log() {}, setStatus() {},
    setEngineState(state, options) { transitions.push(state); if (options?.capture) captureRequests.push(options.event); },
    showRuntime(state) { transitions.push(state); }
  };

  await adapter.init(context);
  assert.equal(sandbox.__idtech4Proof.variant, variant);
  assert.equal(sandbox.__idtech4Proof.lifecycle.at(-1).name, 'initialized');
  assert.equal(adapter.readEngineState(), 'menu');
  assert.equal(adapter.readCaptureIntent(), false);
  assert.equal(createdPolicy.namespace, dataManifest.variants[variant].namespace || dataManifest.namespace);
  if (wakeFailure) {
    await assert.rejects(adapter.start(context), /match startup failed|match is not ready/);
    assert.equal(messages.length, 0, 'failed managed wake must not start a native worker');
    assert.equal(canvasTransfers, 0, 'failed wake must preserve canvas for retry');
    return;
  }
  await adapter.start(context);
  assert.equal(sandbox.__idtech4Proof.lifecycle.at(-1).name, 'worker-started');
  assert.equal(sandbox.__idtech4Proof.workerMessages['out:start'], 1);
  assert.equal(loadedPolicy, createdPolicy);
  FakeWorker.instance.onmessage({ data: { type: 'status', text: 'Mounting owner data from cache' } });
  assert.doesNotMatch(loading.flat().join('\n'), /files?|data|cache|container|browser|mount|verif|directory|folder|path|module|engine/i,
    'normal loading copy must remain title-focused');
  const expectedWorker = variant.startsWith('quake4') ? '/q4-worker.js' : variant === 'prey' ? '/prey-worker.js' : '/d3-worker.js';
  assert.equal(FakeWorker.instance.source, expectedWorker);
  const hasWorkerAudio = true;
  assert.equal(audioContexts.length, hasWorkerAudio ? 1 : 0, `${variant}: create the expected page audio bridge`);
  if (hasWorkerAudio) {
    const sendAudio = data => FakeWorker.instance.onmessage({ data });
    sendAudio({ type: 'audio-init' });
    sendAudio({ type: 'audio-create-source', id: 1 });
    sendAudio({ type: 'audio-buffer', id: 1, format: 0x1101, frequency: 8000,
      data: new Int16Array([0, 8192, -8192, 0]).buffer });
    sendAudio({ type: 'audio-source-int', id: 1, param: 0x1009, value: 1 });
    sendAudio({ type: 'audio-source-action', id: 1, action: 1 });
    assert.equal(audioSources.length, 1);
    assert.ok(audioSources[0].started, `${variant}: native audio must reach a real page-side source operation`);
    assert.deepEqual(Array.from(audioSources[0].buffer.getChannelData(0)), [0, 0.25, -0.25, 0]);
    sendAudio({ type: 'audio-source-action', id: 1, action: 0 });
    assert.ok(audioSources[0].stopped);
    assert.equal(sandbox.__idtech4Proof.audio.starts, 1);
  }
  const start = messages.find(message => message.type === 'start');
  assert.ok(start);
  assert.equal(start.variant, variant);
  assert.equal(start.managedMultiplayer, variant === 'doom3-mp' ? true : undefined);
  assert.equal(requests.filter(request => request.source === '/api/doom3/wake').length, variant === 'doom3-mp' ? 1 : 0);
  assert.equal(start.playerName, 'Browser Marine');
  assert.deepEqual(plain(start.persistence), {
    namespace: `idtech4-${variant}`,
    root: `/save/${variant}`,
    debounceMs: 750,
    intervalMs: 5000,
    requestDurability: true,
    frameworkScript: '/shared-shell/wasm-game-framework.js',
    frameworkVersion: '0.9.6'
  });
  assert.equal(start.entries[0].path, createdPolicy.files[0].mountName);
  if (variant === 'prey') {
    assert.match(createdPolicy.files[0].path, /^prey\/base\//, 'Prey container data must use its isolated namespace');
    assert.match(start.entries[0].path, /^base\//, 'Prey files must mount at the engine-visible base path');
  }
  assert.deepEqual(Array.from(start.engineArguments), [
    '+set', 'com_machineSpec', '3', '+set', 'image_useCompression', '0',
    '+set', 'image_usePrecompressedTextures', '1', '+set', 'r_multiSamples', '4'
  ]);

  document.visibilityState = 'hidden';
  listeners.get('visibilitychange')();
  globalListeners.get('blur')();
  document.focused = false;
  document.visibilityState = 'visible';
  listeners.get('visibilitychange')();
  document.focused = true;
  globalListeners.get('focus')();
  if (variant === 'quake4' || variant === 'quake4-mp') {
    assert.equal(start.focused, true, 'Quake 4 startup must include actual page focus');
    assert.deepEqual(messages.filter(message => message.type === 'focus').map(message => message.focused),
      [false, false, false, true], 'hidden or blurred pages must mute, and genuine focus must restore sound');
  } else {
    assert.equal(start.focused, undefined);
    assert.equal(messages.filter(message => message.type === 'focus').length, 0,
      'Quake 4 focus forwarding must not change other engine workers');
  }
  globalListeners.get('pagehide')();
  assert.ok(messages.filter(message => message.type === 'persist').length >= 2,
    'visibility and page-exit lifecycle edges must request a worker-local flush');

  FakeWorker.instance.onmessage({ data: { type: 'engine-state', state: 'gameplay', inputMode: 'gameplay' } });
  assert.equal(sandbox.__idtech4Proof.states.at(-1).state, 'gameplay');
  assert.equal(adapter.readEngineState(), 'gameplay');
  assert.equal(adapter.readCaptureIntent(), true);
  assert.equal(transitions.at(-1), 'gameplay');

  const controllerActions = {
    forward: 1, backward: 0, left: 0, right: 0,
    lookX: 0.75, lookY: -0.25, jump: 1, crouch: 0, reload: 1,
    weapon: 0, previousWeapon: 0, nextWeapon: 1, altAttack: 0,
    attack: 1, scoreboard: 0, menu: 0, sprint: 1, melee: 0
  };
  adapter.controllerFrame({ actions: controllerActions, deltaMs: 16.667 });
  assert.ok(messages.some(message => message.type === 'key' && message.scan === 26 && message.down),
    'controller forward must enter the native key queue');
  assert.ok(messages.some(message => message.type === 'key' && message.scan === 44 && message.down),
    'controller jump must enter the native key queue');
  assert.ok(messages.some(message => message.type === 'pointer-button' && message.button === 0 && message.down),
    'controller attack must enter the native pointer queue');
  assert.ok(messages.some(message => message.type === 'pointer-relative' && message.dx > 0 && message.dy < 0),
    'controller look must enter the native relative pointer queue');
  adapter.controllerChanged({ activeIndex: null, selection: 'disabled' });
  assert.ok(messages.some(message => message.type === 'key' && message.scan === 26 && !message.down),
    'controller disable/hot-unplug must release held native actions');
  assert.ok(messages.some(message => message.type === 'pointer-button' && message.button === 0 && !message.down));

  FakeWorker.instance.onmessage({ data: { type: 'engine-state', state: 'menu' } });
  adapter.controllerFrame({ actions: controllerActions, deltaMs: 16.667 });
  assert.ok(messages.some(message => message.type === 'key' && message.scan === 82 && message.down),
    'menu controller movement must use the native arrow-key seam');
  assert.ok(messages.some(message => message.type === 'key' && message.scan === 40 && message.down),
    'menu controller accept must use the native Enter seam');
  adapter.controllerChanged({ activeIndex: null, selection: 'disabled' });

  FakeWorker.instance.onmessage({ data: { type: 'engine-state', state: 'gameplay' } });

  adapter.inputCaptureChanged(true);
  const beforeAbsolute = messages.length;
  adapter.pointerMove({ x: 100, y: 200 });
  assert.equal(messages.length, beforeAbsolute, 'captured relative input must not also emit absolute motion');
  document.pointerLockElement = canvas;
  const beforeProofRelative = sandbox.__idtech4Proof.input.pointerRelative;
  const beforeProofDx = sandbox.__idtech4Proof.input.pointerDx;
  const beforeProofDy = sandbox.__idtech4Proof.input.pointerDy;
  canvasListeners.get('pointermove')({ movementX: 7, movementY: -3 });
  assert.deepEqual(plain(messages.at(-1)), { type: 'pointer-relative', dx: 7, dy: -3 });
  assert.equal(sandbox.__idtech4Proof.input.pointerRelative, beforeProofRelative + 1);
  assert.equal(sandbox.__idtech4Proof.input.pointerDx, beforeProofDx + 7);
  assert.equal(sandbox.__idtech4Proof.input.pointerDy, beforeProofDy - 3);
  listeners.get('pointerdown')({ type: 'pointerdown', button: 0, preventDefault() {} });
  assert.deepEqual(plain(messages.at(-1)), { type: 'pointer-button', button: 0, down: true });
  listeners.get('pointerup')({ type: 'pointerup', button: 0, preventDefault() {} });
  assert.deepEqual(plain(messages.at(-1)), { type: 'pointer-button', button: 0, down: false });

  listeners.get('pointerdown')({ type: 'pointerdown', button: 0, preventDefault() {} });
  assert.deepEqual(plain(messages.at(-1)), { type: 'pointer-button', button: 0, down: true });

  adapter.inputCaptureChanged(false);
  assert.deepEqual(plain(messages.at(-2)), { type: 'pointer-button', button: 0, down: false },
    'capture loss must release any physical mouse button still held by the native queue');
  assert.deepEqual(plain(messages.at(-1)), { type: 'capture', captured: false });
  document.pointerLockElement = null;
  const beforeUncapturedGameplay = messages.length;
  adapter.pointerMove({ x: 321, y: 123 });
  adapter.pointerButton({ button: 0, pressed: true, x: 321, y: 123 });
  assert.equal(messages.length, beforeUncapturedGameplay,
    'uncaptured gameplay must drop absolute mouse motion and button presses');

  FakeWorker.instance.onmessage({ data: {
    type: 'engine-state', state: 'paused', inputMode: 'console', resumeAvailable: true
  } });
  adapter.pointerMove({ x: 321, y: 123 });
  assert.deepEqual(plain(messages.at(-1)), { type: 'pointer-absolute', x: 321, y: 123 });
  adapter.pointerButton({ button: 0, pressed: true, x: 321, y: 123 });
  assert.deepEqual(plain(messages.at(-1)), { type: 'pointer-button', button: 0, down: true, x: 321, y: 123 });
  adapter.pointerButton({ button: 0, pressed: false, x: 321, y: 123 });
  assert.deepEqual(plain(messages.at(-1)), { type: 'pointer-button', button: 0, down: false, x: 321, y: 123 });

  listeners.get('keydown')({ code: 'Backquote', key: '`', ctrlKey: false, metaKey: false, altKey: false, repeat: false,
    preventDefault() {} });
  if (variant.startsWith('quake4')) {
    assert.equal(adapter.readEngineState(), 'paused', 'Quake 4 must wait for actual native resume');
    const before = captureRequests.length;
    FakeWorker.instance.onmessage({ data: { type: 'engine-state', state: 'gameplay', inputMode: 'gameplay' } });
    assert.equal(captureRequests.length, before + 1);
  }
  assert.equal(adapter.readEngineState(), 'gameplay', 'closing the in-game console must restore gameplay state immediately');
  assert.equal(adapter.readCaptureIntent(), true, 'closing the in-game console must request capture on the trusted key gesture');
  assert.equal(transitions.at(-1), 'gameplay');

  if (variant.startsWith('quake4')) {
    const native = (state, inputMode, resumeAvailable) => FakeWorker.instance.onmessage({data:{type:'engine-state',state,inputMode,resumeAvailable}});
    const key = (code, value = code) => {
      const event = {code,key:value,isTrusted:true,repeat:false,ctrlKey:false,metaKey:false,altKey:false,preventDefault(){}};
      listeners.get('keydown')(event);
      return event;
    };
    let before = captureRequests.length;
    native('paused','menu',true);
    const escape = key('Escape');
    assert.equal(adapter.readEngineState(),'paused');
    native('paused','menu',false); // Exit animation still owns the native GUI.
    assert.equal(captureRequests.length,before);
    native('gameplay','gameplay',false);
    assert.equal(captureRequests.length,before+1);
    assert.equal(captureRequests.at(-1),escape);
    native('gameplay','gameplay',false);
    assert.equal(captureRequests.length,before+1,'duplicate reports must not capture twice');

    before = captureRequests.length;
    native('paused','menu',false);
    key('Escape');
    native('gameplay','gameplay',false);
    assert.equal(captureRequests.length,before,'submenu back is not a resume gesture');
    native('paused','console',true);
    key('Escape');
    native('paused','menu',true);
    assert.equal(captureRequests.length,before,'console Escape that opens a menu must not capture');
    native('paused','console',true);
    const consoleEscape = key('Escape');
    assert.equal(captureRequests.length,before,'console Escape must wait for native acknowledgement');
    native('gameplay','gameplay',false);
    assert.equal(captureRequests.length,++before,'a cinematic may consume Escape after closing the console');
    assert.equal(captureRequests.at(-1),consoleEscape);
    native('gameplay','gameplay',false);
    assert.equal(captureRequests.length,before,'console Escape handoff is consumed exactly once');
    native('paused','console',false);
    key('Backquote','`');
    native('gameplay','gameplay',false);
    assert.equal(captureRequests.length,before,'console over a GUI does not resume the world');

    native('paused','continue',false);
    key('Enter');
    native('gameplay','gameplay',false);
    assert.equal(captureRequests.length,before,'stale-input Continue guard cannot request capture');
    for (const ignored of ['CapsLock','ScrollLock','PrintScreen','AltRight']) {
      native('paused','continue',true);
      key(ignored);
      native('gameplay','gameplay',false);
      assert.equal(captureRequests.length,before,`${ignored} does not continue the native gate`);
    }
    native('paused','continue',true);
    const enter = key('Enter');
    assert.equal(captureRequests.length,before);
    native('gameplay','gameplay',false);
    assert.equal(captureRequests.at(-1),enter);
    assert.equal(captureRequests.length,++before);

    native('paused','continue',true);
    const pointer = {isTrusted:true,type:'pointerup'};
    adapter.pointerButton({button:0,pressed:true,x:100,y:200},{isTrusted:true,type:'pointerdown'});
    adapter.pointerButton({button:0,pressed:false,x:100,y:200},pointer);
    assert.equal(messages.at(-1).type,'pointer-button','Continue still receives its physical button pair');
    native('gameplay','gameplay',false);
    assert.equal(captureRequests.at(-1),pointer);
    assert.equal(captureRequests.length,++before);

    native('paused','menu',true);
    const inactiveGesture = key('Escape');
    userActivation.isActive = false;
    native('gameplay','gameplay',false);
    assert.equal(captureRequests.length,++before,'the browser owns permission, including inactive re-locks after API release');
    assert.equal(captureRequests.at(-1),inactiveGesture);
    userActivation.isActive = true;
    native('gameplay','gameplay',false);
    assert.equal(captureRequests.length,before,'a consumed gesture must not retry after activation changes');

    native('paused','menu',true);
    key('Escape');
    globalListeners.get('blur')();
    native('gameplay','gameplay',false);
    assert.equal(captureRequests.length,before,'blur cancels pending capture');

    native('paused','menu',true);
    adapter.pointerButton({button:0,pressed:true,x:100,y:200},{isTrusted:true});
    adapter.pointerButton({button:0,pressed:false,x:100,y:200},pointer);
    native('paused','menu',false); // The click entered Settings instead of resuming.
    key('Tab');
    native('gameplay','gameplay',false);
    assert.equal(captureRequests.length,before,'a later unrelated action cancels an old menu click');
    listeners.get('pointerlockerror')({isTrusted:true,message:'fixture failure'});
    assert.equal(sandbox.__idtech4Proof.capture.at(-1).kind,'error');
    assert.equal(sandbox.__idtech4Proof.capture.at(-1).locked,false);
  }
  adapter.resize({ requestedWidth: 1536, requestedHeight: 864 });
  assert.deepEqual(plain(messages.at(-1)), { type: 'resize', width: 1536, height: 864 });
  adapter.captureLost();
  assert.deepEqual(plain(messages.at(-1)), { type: 'open-menu' });

  let prevented = false;
  listeners.get('keydown')({ code: 'Slash', key: '/', ctrlKey: false, metaKey: false, altKey: false, repeat: false,
    preventDefault() { prevented = true; } });
  assert.equal(messages.at(-2).scan, 56);
  assert.deepEqual(plain(messages.at(-1)), { type: 'text', codepoint: 47 });
  assert.equal(prevented, false, 'the framework owns browser-key suppression only while captured');
  listeners.get('keydown')({ code: 'F12', key: 'F12', ctrlKey: false, metaKey: false, altKey: false, repeat: false,
    preventDefault() {} });
  assert.equal(messages.at(-1).scan, 69);

  // A physical modifier is itself a bindable game key (Doom 3's CTRL is
  // _attack). Its DOM keydown already has ctrlKey/altKey set. Keep browser
  // shortcut letters suppressed without dropping that modifier's down edge.
  for (const [code, key, scan] of [
    ['ControlLeft', 'Control', 224], ['ControlRight', 'Control', 228],
    ['AltLeft', 'Alt', 226], ['AltRight', 'Alt', 230]
  ]) {
    for (let flags = 0; flags < 8; flags++) {
      let suppressed = false;
      const event = {code, key, ctrlKey: Boolean(flags & 1), altKey: Boolean(flags & 2),
        metaKey: Boolean(flags & 4), repeat: false, preventDefault() { suppressed = true; }};
      const before = messages.length;
      listeners.get('keydown')(event);
      assert.deepEqual(plain(messages.slice(before)), event.metaKey ? [] : [
        {type: 'key', scan, key: 0, down: true, repeat: false}
      ], `${variant}: ${code} modifier flags ${flags} must retain the physical down edge unless Meta is held`);
      listeners.get('keyup')(event);
      assert.deepEqual(plain(messages.at(-1)), {type: 'key', scan, key: 0, down: false},
        'modifier release must always reach the native queue, including after shortcut/focus changes');
      assert.equal(suppressed, false, 'modifier forwarding must not capture browser shortcuts');
    }
  }
  for (const [code, key] of [['KeyL', 'l'], ['KeyW', 'w'], ['KeyR', 'r'], ['Tab', 'Tab'], ['F4', 'F4']]) {
    for (let flags = 1; flags < 8; flags++) {
      const before = messages.length;
      let suppressed = false;
      listeners.get('keydown')({code, key, ctrlKey: Boolean(flags & 1), altKey: Boolean(flags & 2),
        metaKey: Boolean(flags & 4), repeat: false, preventDefault() { suppressed = true; }});
      assert.equal(messages.length, before, `${variant}: browser shortcut ${code}/${flags} must not reach the game`);
      assert.equal(suppressed, false, 'browser shortcuts must retain their native browser behavior');
    }
  }

  FakeWorker.instance.onmessage({ data: { type: 'error', text: 'renderer checkpoint' } });
  assert.equal(adapter.readEngineState(), 'crashed');
  assert.equal(transitions.at(-1), 'crashed');
}

for (const variant of Object.keys(config.variants)) await exercise(variant);
for (const failure of ['unauthorized', 'failed', 'sleeping', 'foreign']) await exercise('doom3-mp', failure);
console.log('id Tech 4 adapter state, identity, input, disabled-controller, persistence, pointer, resize, profile, and PWA contracts passed');
