#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const web = path.resolve(process.argv[2] || path.join(__dirname, '../web/dist'));
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

async function exercise(variant) {
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
  const persistenceRoot = `/persistent/dosbox/${variant}`;
  const gameRoot = `${persistenceRoot}/game`;
  const configRoot = `${persistenceRoot}/.dosbox`;
  const canvas = {
    width: 640,
    height: 400,
    addEventListener(type, listener) { canvasListeners.set(type, listener); },
    focus() { launches.push(['focus']); }
  };
  const nativeWrite = (stream, buffer) => {
    launches.push(['write', stream.path, buffer.length]);
    return buffer.length;
  };
  const module = {
    FS: {
      chdir(directory) { launches.push(['chdir', directory]); },
      chmod(file, mode) { launches.push(['chmod', file, mode]); },
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
    createElement(type) { assert.equal(type, 'script'); return {}; },
    head: {
      appendChild(script) {
        assert.equal(script.src, '/dosbox.js');
        sandbox.createDosBoxModule = async options => { moduleOptions = options; return module; };
        queueMicrotask(script.onload);
      }
    }
  };
  const sandbox = {
    console, document,
    setTimeout(callback) { callback(); return 1; },
    crypto: { subtle: { digest: async () => new ArrayBuffer(32) } },
    fetch: async request => {
      assert.equal(request, '/wasm-game-data.json');
      return { ok: true, json: async () => dataManifest };
    }
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'game-adapter.js' });
  const adapter = sandbox.WasmGameAdapter;
  const context = {
    variant,
    config: config.variants[variant],
    elements: { canvas },
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
  const pending = adapter.start(context);
  assert.equal(adapter.readEngineState(), 'loading');
  await pending;
  assert.equal(createdPolicy.namespace, dataManifest.variants[variant].namespace);
  assert.deepEqual(createdPolicy.files.map(file => file.mountName),
    dataManifest.variants[variant].files.map(file => file.mountName || file.name));
  assert.equal(loadedPolicy, createdPolicy);
  moduleOptions.setStatus('Mounting owner data from cache');
  assert.doesNotMatch(loading.flat().join('\n'), forbiddenNormalCopy,
    'normal loading copy must remain title-focused');
  assert.equal(adapter.readEngineState(), 'gameplay');
  const enterEvent = {
    code: 'Enter', repeat: false,
    stopImmediatePropagation() {}, preventDefault() {}
  };
  canvasListeners.get('keydown')(enterEvent);
  canvasListeners.get('keyup')(enterEvent);
  assert.deepEqual(nativeInput.slice(-2), [['key', 13, 1], ['key', 13, 0]],
    `${variant} must explicitly queue browser Enter into native DOSBox`);
  assert.deepEqual(transitions, ['loading', 'gameplay']);
  const invocation = launches.find(call => call[0] === 'callMain');
  assert.ok(invocation);
  assert.deepEqual(invocation[1], [
    ...dataManifest.variants[variant].dosboxArguments,
    '-userconf',
    ...dataManifest.variants[variant].commands.flatMap(command => [
      '-c', command.replaceAll('/game', gameRoot)
    ])
  ]);
  const operations = launches.map(call => call[0]);
  assert.ok(operations.indexOf('attach') < operations.indexOf('mount'));
  assert.ok(operations.indexOf('mount') < operations.indexOf('callMain'));
  assert.deepEqual(launches.find(call => call[0] === 'ccall'), [
    'ccall', 'DOSBox_WasmSetHome', null, ['string'], [persistenceRoot]
  ]);
  assert.ok(launches.some(call => call[0] === 'chdir' && call[1] === gameRoot));
  assert.equal(launches.filter(call => call[0] === 'chmod').length,
    dataManifest.variants[variant].files.length);
  assert.ok(launches.filter(call => call[0] === 'chmod').every(call =>
    call[1].startsWith(`${gameRoot}/`) && call[2] === 0o600));
  assert.ok(moduleOptions && moduleOptions.canvas === canvas);

  module.FS.write({ path: `${configRoot}/dosbox-0.74-3.conf` }, new Uint8Array(4));
  module.FS.write({ node: { path: `${gameRoot}/SAVE.DAT` } }, new Uint8Array(8));
  module.FS.write({ path: '/tmp/not-persistent' }, new Uint8Array(2));
  assert.equal(dirtyCount, 2, `${variant} config and save writes mark IDBFS dirty`);

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
  assert.equal(adapter.readEngineState(), 'crashed');
  assert.equal(transitions.at(-1), 'crashed');
}

(async () => {
  for (const variant of Object.keys(config.variants)) await exercise(variant);
  console.log('DOSBox adapter persistence, controller, loading, gameplay, abort, display, and PWA contracts passed for 9 variants');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
