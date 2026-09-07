#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const site = path.resolve(process.argv[2] || new URL('../build/site', import.meta.url).pathname);
const fixtures = [
  { worker: 'd3-worker.js', variant: 'doom3', engine: '/dhewm3-base.js' },
  { worker: 'd3-worker.js', variant: 'doom3-mp', engine: '/dhewm3-base.js' },
  { worker: 'd3-worker.js', variant: 'roe', engine: '/dhewm3-roe.js' },
  { worker: 'q4-worker.js', variant: 'quake4', engine: '/openQ4-client_wasm32.js' },
  { worker: 'prey-worker.js', variant: 'prey', engine: '/prey06.js' }
];

async function settleUntil(predicate) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (predicate()) return;
    await new Promise(resolve => setImmediate(resolve));
  }
  throw new Error('worker fixture did not enter native main');
}

for (const fixture of fixtures) {
  const source = fs.readFileSync(fixture.worker === 'q4-worker.js' && process.env.IDTECH4_Q4_WORKER_SOURCE ||
    fixture.worker === 'd3-worker.js' && process.env.IDTECH4_D3_WORKER_SOURCE || path.join(site, fixture.worker), 'utf8');
  assert.doesNotMatch(source, /FS\.mount\(IDBFS|FS\.syncfs\(/,
    `${fixture.worker} must delegate IDBFS lifecycle to framework 0.9.6`);
  assert.match(source, /noInitialRun:\s*true/,
    `${fixture.worker} must prevent native main before persistence restoration`);
  if (fixture.worker === 'q4-worker.js') {
    assert.doesNotMatch(source, /arrayBuffer\(|FS\.writeFile\('\/baseoq4\/pak[01]\.pk4/,
      'Quake 4 source packages must not be copied whole into the wasm heap');
    assert.match(source, /FS\.mount\(WORKERFS,[\s\S]*'pak1\.pk4'/,
      'Quake 4 source packages must remain Blob-backed WORKERFS files');
  }

  const order = [];
  const messages = [];
  const managerCalls = [];
  const focusCalls = [];
  let managerOptions;
  let nativeModule;
  let networkDisposals = 0;
  const fakeFs = {
    filesystems: { IDBFS: {} },
    mkdir() {},
    mount() {},
    writeFile() {}
  };
  const sandbox = {
    URL,
    Blob,
    Uint8Array,
    console,
    // Worker animation/persistence timers are outside this contract test and
    // must not keep the Node fixture alive after native-main ordering passes.
    setTimeout() { return 0; },
    clearTimeout() {},
    setInterval() { return 0; },
    clearInterval() {},
    location: { href: 'https://idtech4.test/' },
    postMessage(message) { messages.push(message); },
    fetch: async () => ({
      ok: true,
      status: 200,
      async blob() { return new Blob(['fixture']); },
      async text() { return 'fixture'; },
      async arrayBuffer() { return new ArrayBuffer(8); }
    })
  };
  sandbox.self = sandbox;
  sandbox.importScripts = url => {
    order.push(`import:${url}`);
    if (url === '/d3-managed-network.js') {
      sandbox.createD3ManagedNetwork = options => {
        assert.equal(options.pageUrl, sandbox.location.href);
        return {kind: 'managed-datagram-fixture', closeAll() { networkDisposals++; }};
      };
      return;
    }
    if (url === '/shared-shell/wasm-game-framework.js') {
      sandbox.WasmGameFramework = {
        version: '0.9.6',
        createPersistenceManager(options) {
          managerOptions = options;
          return {
            namespace: options.namespace,
            root: options.root,
            async attach(FS) {
              assert.equal(FS, fakeFs);
              managerCalls.push('attach');
              order.push('persistence-attached');
              return {};
            },
            markDirty() { managerCalls.push('dirty'); },
            async save() { managerCalls.push('save'); }
          };
        }
      };
      return;
    }
    nativeModule = sandbox.Module;
    sandbox.FS = fakeFs;
    sandbox.WORKERFS = { stream_ops: { read() { return 0; } } };
    nativeModule.FS = fakeFs;
    nativeModule._Q4WASM_BrowserFocus = focused => {
      order.push(`focus:${focused}`);
      focusCalls.push(focused);
    };
    nativeModule.callMain = args => {
      order.push('native-main');
      nativeModule.nativeArguments = args;
    };
    for (const callback of nativeModule.preRun || []) callback();
    nativeModule.onRuntimeInitialized();
  };

  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: fixture.worker });
  sandbox.onmessage({ data: {
    type: 'start',
    focused: true,
    canvas: {},
    entries: [{ path: 'base/pak000.pk4', file: new Blob(['owner']) }],
    variant: fixture.variant,
    ...(fixture.variant === 'doom3-mp' ? {managedMultiplayer: true} : {}),
    width: 1280,
    height: 720,
    playerName: 'Fixture',
    engineArguments: [],
    persistence: {
      namespace: `idtech4-${fixture.variant}`,
      root: `/save/${fixture.variant}`,
      debounceMs: 750,
      intervalMs: 5000,
      requestDurability: true,
      frameworkScript: '/shared-shell/wasm-game-framework.js',
      frameworkVersion: '0.9.6'
    }
  } });
  if (fixture.worker === 'q4-worker.js') {
    sandbox.onmessage({ data: { type: 'focus', focused: false } });
    assert.equal(focusCalls.length, 0, 'focus received during fetch must wait for native initialization');
  }
  await settleUntil(() => order.includes('native-main'));
  if (fixture.worker === 'q4-worker.js') {
    assert.deepEqual(focusCalls, [0], 'latest pre-main focus overrides startup focus');
    assert.ok(order.indexOf('focus:0') < order.indexOf('native-main'));
    sandbox.onmessage({ data: { type: 'focus', focused: true } });
    sandbox.onmessage({ data: { type: 'focus', focused: false } });
    assert.deepEqual(focusCalls, [0, 1, 0], 'native focus must follow page lifecycle changes');
  }

  assert.equal(nativeModule.noInitialRun, true);
  if (fixture.variant === 'doom3-mp') {
    assert.equal(nativeModule.d3ManagedNetwork.kind, 'managed-datagram-fixture');
    assert.deepEqual(Array.from(nativeModule.nativeArguments.slice(-2)), ['+connect', '127.0.0.1:27666']);
  } else {
    assert.equal(nativeModule.d3ManagedNetwork, undefined);
    assert.equal(nativeModule.nativeArguments.includes('+connect'), false);
  }
  assert.ok(order.indexOf('import:/shared-shell/wasm-game-framework.js') < order.indexOf(`import:${fixture.engine}`));
  assert.ok(order.indexOf('persistence-attached') < order.indexOf('native-main'),
    `${fixture.worker} must restore persistence before native main`);
  assert.equal(managerOptions.namespace, `idtech4-${fixture.variant}`);
  assert.equal(managerOptions.root, `/save/${fixture.variant}`);
  assert.ok(nativeModule.nativeArguments.includes(`/save/${fixture.variant}`),
    `${fixture.worker} must point native save/config lookup at the framework mount`);
  assert.ok(messages.some(message => message.type === 'persistence-ready' && message.root === `/save/${fixture.variant}`));

  sandbox.idtech4PersistenceDirty();
  sandbox.idtech4PersistenceSave();
  sandbox.onmessage({ data: { type: 'persist' } });
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(managerCalls.includes('dirty'), `${fixture.worker} must accept native dirty notifications`);
  assert.ok(managerCalls.filter(call => call === 'save').length >= 2,
    `${fixture.worker} must flush high-value saves and lifecycle requests`);
  if (fixture.worker === 'd3-worker.js') {
    const expectsPeer = fixture.variant === 'doom3-mp';
    assert.equal(networkDisposals, 0, 'healthy worker keeps its managed peer');
    nativeModule.onAbort('fixture abort');
    assert.equal(networkDisposals, expectsPeer ? 1 : 0, 'native abort releases managed peer');
    sandbox.onerror('fixture error', '/engine.js', 1, 2);
    assert.equal(networkDisposals, expectsPeer ? 2 : 0, 'uncaught worker error releases managed peer');
    nativeModule.onExit(0);
    assert.equal(networkDisposals, expectsPeer ? 3 : 0, 'normal native exit releases managed peer');
    nativeModule.onExit(1);
    assert.equal(networkDisposals, expectsPeer ? 5 : 0, 'failed native exit releases managed peer idempotently');
  }
  if (fixture.worker === 'q4-worker.js') {
    sandbox.onerror('shader failure', '/engine.js', 12, 34, { stack: 'Error: shader failure\n    at drawScene (engine.js:12:34)' });
    assert.match(messages.at(-1).text, /at drawScene/,
      'WorkerGlobalScope.onerror must retain the fifth-argument exception stack');
    sandbox.onerror('range failure', '/engine.js', 56, 78);
    assert.equal(messages.at(-1).text, 'range failure (/engine.js:56:78)');
    sandbox.onerror({ message: 'event failure', filename: '/worker.js', lineno: 4, colno: 5 });
    assert.equal(messages.at(-1).text, 'event failure (/worker.js:4:5)');
  }
}

console.log('id Tech 4 worker-local framework persistence, pre-main restore, native save hooks, and Blob-backed PK4 contracts passed');
