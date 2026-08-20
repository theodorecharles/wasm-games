#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const site = path.resolve(process.argv[2] || new URL('../build/site', import.meta.url).pathname);
const adapterSource = fs.readFileSync(path.join(site, 'game-adapter.js'), 'utf8');
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

async function exercise(variant) {
  const listeners = new Map();
  const globalListeners = new Map();
  const canvasListeners = new Map();
  const messages = [];
  const transitions = [];
  const loading = [];
  let createdPolicy;
  let loadedPolicy;
  const canvas = {
    id: '', width: 1280, height: 720,
    addEventListener(type, listener) { canvasListeners.set(type, listener); },
    transferControlToOffscreen() { return { kind: 'offscreen' }; }
  };
  const document = {
    pointerLockElement: null,
    documentElement: { dataset: {} },
    addEventListener(type, listener) { listeners.set(type, listener); }
  };
  class FakeWorker {
    constructor(source) { this.source = source; FakeWorker.instance = this; }
    postMessage(message) { messages.push(message); }
  }
  const sandbox = {
    console, document, Worker: FakeWorker,
    addEventListener(type, listener) { globalListeners.set(type, listener); },
    fetch: async source => {
      assert.equal(source, '/wasm-game-data.json');
      return { ok: true, json: async () => dataManifest };
    }
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(adapterSource, sandbox, { filename: 'game-adapter.js' });
  const adapter = sandbox.WasmGameAdapter;
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
    setEngineState(state) { transitions.push(state); },
    showRuntime(state) { transitions.push(state); }
  };

  await adapter.init(context);
  assert.equal(adapter.readEngineState(), 'menu');
  assert.equal(adapter.readCaptureIntent(), false);
  assert.equal(createdPolicy.namespace, dataManifest.variants[variant].namespace || dataManifest.namespace);
  await adapter.start(context);
  assert.equal(loadedPolicy, createdPolicy);
  FakeWorker.instance.onmessage({ data: { type: 'status', text: 'Mounting owner data from cache' } });
  assert.doesNotMatch(loading.flat().join('\n'), /files?|data|cache|container|browser|mount|verif|directory|folder|path|module|engine/i,
    'normal loading copy must remain title-focused');
  const expectedWorker = variant.startsWith('quake4') ? '/q4-worker.js' : variant === 'prey' ? '/prey-worker.js' : '/d3-worker.js';
  assert.equal(FakeWorker.instance.source, expectedWorker);
  const start = messages.find(message => message.type === 'start');
  assert.ok(start);
  assert.equal(start.variant, variant);
  assert.equal(start.playerName, 'Browser Marine');
  assert.deepEqual(plain(start.persistence), {
    namespace: `idtech4-${variant}`,
    root: `/save/${variant}`,
    debounceMs: 750,
    intervalMs: 5000,
    requestDurability: true,
    frameworkScript: '/shared-shell/wasm-game-framework.js',
    frameworkVersion: '0.9.2'
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
  globalListeners.get('pagehide')();
  assert.ok(messages.filter(message => message.type === 'persist').length >= 2,
    'visibility and page-exit lifecycle edges must request a worker-local flush');

  FakeWorker.instance.onmessage({ data: { type: 'engine-state', state: 'gameplay' } });
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
  canvasListeners.get('pointermove')({ movementX: 7, movementY: -3 });
  assert.deepEqual(plain(messages.at(-1)), { type: 'pointer-relative', dx: 7, dy: -3 });

  adapter.inputCaptureChanged(false);
  document.pointerLockElement = null;
  adapter.pointerMove({ x: 321, y: 123 });
  assert.deepEqual(plain(messages.at(-1)), { type: 'pointer-absolute', x: 321, y: 123 });
  adapter.pointerButton({ button: 0, pressed: true, x: 321, y: 123 });
  assert.deepEqual(plain(messages.at(-1)), { type: 'pointer-button', button: 0, down: true, x: 321, y: 123 });
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

  FakeWorker.instance.onmessage({ data: { type: 'error', text: 'renderer checkpoint' } });
  assert.equal(adapter.readEngineState(), 'crashed');
  assert.equal(transitions.at(-1), 'crashed');
}

for (const variant of Object.keys(config.variants)) await exercise(variant);
console.log('id Tech 4 adapter state, identity, input, disabled-controller, persistence, pointer, resize, profile, and PWA contracts passed');
