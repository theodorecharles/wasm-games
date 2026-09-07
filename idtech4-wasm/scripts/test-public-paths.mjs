import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { publicPathRuntime } from './public-path-runtime.mjs';

assert.ok(process.argv[2], 'Provide the actual staged/extracted site directory.');
const site = path.resolve(process.argv[2]);
const allVariants = ['doom3', 'doom3-mp', 'roe', 'quake4', 'quake4-mp', 'prey'];
const variants = process.env.IDTECH4_TEST_VARIANTS?.split(',') || allVariants;
assert.ok(variants.length && variants.every(value => allVariants.includes(value)));
const checks = [];
const botFile = path.join(site, 'bots/d3_sabot_a7.pk4');
const botBytes = fs.existsSync(botFile) ? fs.readFileSync(botFile) : null;
async function run(variant, origin, prefix, invalidFramework) {
  const worker = variant.startsWith('quake4') ? 'q4-worker.js' : variant === 'prey' ? 'prey-worker.js' : 'd3-worker.js';
  const engine = variant.startsWith('quake4') ? 'openQ4-client_wasm32.js' : variant === 'prey' ? 'prey06.js' : `dhewm3-${variant === 'roe' ? 'roe' : 'base'}.js`;
  const source = fs.readFileSync(path.join(site, worker), 'utf8');
  const usesBots = variant === 'doom3-mp' && source.includes('d3_sabot_a7.pk4');
  const absolute = name => origin + prefix + name;
  const messages = [], requests = [], imports = [], mounts = [], order = [];
  let nativeArguments, managerOptions, attachDone;
  const restore = new Promise(resolve => { attachDone = resolve; });
  const fakeFs = { mkdir() {}, mount(type, options, root) { mounts.push({options, root}); } };
  const sandbox = { URL, Blob, Uint8Array, crypto: crypto.webcrypto, console,
    location: { href: absolute(worker) + '?ignored=/outside/' },
    postMessage: message => messages.push(message),
    setTimeout() {}, clearTimeout() {}, setInterval() {}, clearInterval() {},
    async fetch(url) {
      assert.equal(typeof url, 'string');
      requests.push(url);
      assert.ok(url.startsWith(absolute('')), 'worker fetch cannot escape game prefix');
      if (url === absolute('bots/d3_sabot_a7.pk4')) {
        assert.ok(botBytes, 'SABot worker requires the real packaged bot archive');
        return {ok: true, status: 200, blob: async () => new Blob([botBytes])};
      }
      assert.ok(variant.startsWith('quake4'));
      assert.ok(['pak0.pk4', 'pak1.pk4', 'mod.json', `game-${variant === 'quake4-mp' ? 'mp' : 'sp'}_wasm32.wasm`]
        .some(file => url === absolute('baseoq4/' + file)), url);
      return {ok: true, status: 200, blob: async () => new Blob(['fixture source asset'])};
    }
  };
  sandbox.self = sandbox;
  sandbox.importScripts = value => {
    const url = new URL(value, sandbox.location.href).href;
    imports.push(url);
    assert.ok(url.startsWith(absolute('')), 'worker script cannot escape game prefix');
    if (url === absolute('d3-managed-network.js')) {
      sandbox.createD3ManagedNetwork = options => {
        assert.equal(options.pageUrl, sandbox.location.href);
        return {closeAll() {}};
      };
    } else if (url === absolute('shared-shell/wasm-game-framework.js')) {
      sandbox.WasmGameFramework = {version: '0.9.6', createPersistenceManager(options) {
        managerOptions = options;
        return {...options, async attach(FS) { assert.equal(FS, fakeFs); order.push('restore-start'); await restore; order.push('restored'); }, markDirty() {}, async save() {}};
      }};
    } else {
      assert.equal(url, absolute(engine));
      const mod = sandbox.Module;
      sandbox.FS = mod.FS = fakeFs;
      sandbox.WORKERFS = {stream_ops: {read() { return 0; }}};
      mod.callMain = args => { order.push('native-main'); nativeArguments = Array.from(args); };
      for (const callback of mod.preRun) callback();
      mod.onRuntimeInitialized();
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, {filename: worker});
  sandbox.onmessage({data: {type: 'start', variant, canvas: {width: 1280, height: 720}, width: 1280, height: 720,
    managedMultiplayer: variant === 'doom3-mp', focused: true, playerName: 'Fixture', engineArguments: ['+set', 'r_multiSamples', '2'],
    entries: [{path: variant === 'prey' ? 'base/pak000.pk4' : 'base/pak000.pk4', file: new Blob(['owner'])}],
    persistence: {root: '/save/' + variant, namespace: 'idtech4-' + variant,
      frameworkScript: invalidFramework || prefix + 'shared-shell/wasm-game-framework.js', frameworkVersion: '0.9.6'}}});
  const until = async predicate => {
    const deadline = Date.now() + 5000;
    while (!predicate() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 2));
    assert.ok(predicate(), JSON.stringify(messages.filter(m => m.type === 'error')));
  };
  await until(() => order.includes('restore-start') || messages.some(m => m.type === 'error'));
  assert.equal(nativeArguments, undefined, 'restoration must finish before native main');
  if (invalidFramework) {
    assert.ok(messages.some(m => m.type === 'error' && /exact wasm-game-framework/.test(m.text)));
    assert.ok(!imports.includes(absolute(engine)));
    checks.push(`${variant} ${prefix}: rejects foreign/escaping framework URL`);
    return;
  }
  attachDone();
  await until(() => Boolean(nativeArguments));
  assert.ok(order.indexOf('restored') < order.indexOf('native-main'));
  assert.equal(messages.filter(m => m.type === 'error').length, 0);
  assert.equal(managerOptions.root, '/save/' + variant);
  assert.equal(managerOptions.namespace, 'idtech4-' + variant);
  assert.ok(nativeArguments.includes('/save/' + variant));
  assert.ok(nativeArguments.includes('r_multiSamples'));
  assert.equal(nativeArguments.includes('+connect'), variant === 'doom3-mp');
  const wasm = engine.replace(/\.js$/, '.wasm');
  assert.equal(sandbox.Module.locateFile(wasm), absolute(wasm));
  if (variant.startsWith('quake4')) {
    assert.equal(requests.length, 4);
    assert.equal(sandbox.Module.locateFile('/baseoq4/game-sp_wasm32.wasm'), absolute('baseoq4/game-sp_wasm32.wasm'));
    assert.equal(mounts.find(m => m.root === '/baseoq4').options.blobs.length, 4);
  } else assert.equal(requests.length, usesBots ? 1 : 0);
  assert.deepEqual(Array.from(mounts[0].options.blobs, b => b.name), usesBots ? ['base/pak000.pk4', 'base/zz_sabot.pk4'] : ['base/pak000.pk4']);
  checks.push(`${variant} ${origin}${prefix}: imports, data, engine, module, profile and restore ordering`);
}
for (const origin of ['http://127.0.0.1:8088', 'https://games.test']) {
  for (const prefix of ['/', '/doom3/', '/nested/game/']) {
    for (const variant of variants) await run(variant, origin, prefix);
    if (variants.some(value => ['doom3', 'doom3-mp', 'roe'].includes(value))) {
    const context = vm.createContext({URL, ArrayBuffer, Uint8Array});
    vm.runInContext(fs.readFileSync(path.join(site, 'd3-managed-network.js'), 'utf8'), context);
    let endpoint;
    const network = context.createD3ManagedNetwork({pageUrl: origin + prefix + 'd3-worker.js?destination=foreign',
      WebSocket: class {constructor(url) {endpoint = url;} close() {}}});
    network.open();
    assert.equal(endpoint, origin.replace(/^http/, 'ws') + prefix + 'api/doom3/socket');
    network.closeAll();
    checks.push(`${origin}${prefix}: fixed same-origin WS/WSS endpoint`);
    }
  }
}
for (const variant of variants) for (const bad of ['https://foreign.test/shared-shell/wasm-game-framework.js', '/shared-shell/wasm-game-framework.js']) {
  await run(variant, 'https://games.test', '/nested/game/', bad);
}
// Unknown or already-transformed inputs cannot silently pass the build.
const checked = new Set(['game-adapter.js', ...variants.flatMap(value => value.startsWith('quake4') ? ['q4-worker.js']
  : value === 'prey' ? ['prey-worker.js'] : ['d3-worker.js', 'd3-managed-network.js'])]);
for (const name of checked) {
  assert.throws(() => publicPathRuntime(name, fs.readFileSync(path.join(site, name), 'utf8')), /unexpected integration input/);
}
console.log(JSON.stringify({scope: 'Executed actual staged worker/transport JavaScript with instrumented native/FS fixtures, not browser gameplay or IndexedDB durability.', checks, repeatOverlayRefused: true, passed: true}, null, 2));
