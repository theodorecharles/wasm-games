#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const site = path.resolve(process.argv[2] || new URL('../build/site', import.meta.url).pathname);
const fixtures = [
  { worker: 'd3-worker.js', variant: 'doom3', engine: '/dhewm3-base.js' },
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
  const source = fs.readFileSync(path.join(site, fixture.worker), 'utf8');
  assert.doesNotMatch(source, /FS\.mount\(IDBFS|FS\.syncfs\(/,
    `${fixture.worker} must delegate IDBFS lifecycle to framework 0.9.2`);
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
  let managerOptions;
  let nativeModule;
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
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
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
    if (url === '/shared-shell/wasm-game-framework.js') {
      sandbox.WasmGameFramework = {
        version: '0.9.2',
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
    sandbox.WORKERFS = {};
    nativeModule.FS = fakeFs;
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
    canvas: {},
    entries: [{ path: 'base/pak000.pk4', file: new Blob(['owner']) }],
    variant: fixture.variant,
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
      frameworkVersion: '0.9.2'
    }
  } });
  await settleUntil(() => order.includes('native-main'));

  assert.equal(nativeModule.noInitialRun, true);
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
}

console.log('id Tech 4 worker-local framework persistence, pre-main restore, native save hooks, and Blob-backed PK4 contracts passed');
