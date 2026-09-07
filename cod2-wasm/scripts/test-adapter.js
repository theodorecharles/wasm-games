#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const site = path.resolve(process.argv[2] || path.join(__dirname, '../site'));
const source = fs.readFileSync(path.join(site, 'game-adapter.js'), 'utf8');
const dataManifest = JSON.parse(fs.readFileSync(path.join(site, 'wasm-game-data.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(site, 'wasm-game.json'), 'utf8'));
assert.equal(manifest.runtimeReady, false);
assert.equal(manifest.runtimeStatus, 'diagnostic-only');

async function checkPrefix(basePath) {
const publicUrl = value => basePath + value.replace(/^\/+/, '');
const drawn = [];
const transitions = [];
const loading = [];
let createdPolicy;
let loadedPolicy;
let factoryCalls = 0;

async function runDiagnostic(options) {
  factoryCalls += 1;
  assert.equal(options.locateFile('cod2_core_probe.wasm'), publicUrl('/cod2_core_probe.wasm'));
  options.print('[cod2-wasm] native MD4 block checksum: 9028dc2c');
  options.print('[cod2-wasm] native keyed checksum: 4cdcd263');
  options.print('[cod2-wasm] probe complete; engine unavailable; status is Still in development');
}

const sandbox = {
  console,
  fetch: async request => {
    assert.equal(request, publicUrl('/wasm-game-data.json'));
    return { ok: true, json: async () => dataManifest };
  },
  document: {
    createElement(tag) { assert.equal(tag, 'script'); return {}; },
    head: {
      appendChild(script) {
        assert.equal(script.src, publicUrl('/cod2_core_probe.js'));
        sandbox.createCod2Diagnostic = runDiagnostic;
        script.onload();
      }
    }
  }
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: 'game-adapter.js' });

const context = {
  variant: 'cod2-mp',
  elements: { canvas: {
    width: 1280,
    height: 720,
    getContext(type) {
      assert.equal(type, '2d');
      return {
        fillStyle: '', font: '', fillRect() {},
        fillText(text) { drawn.push(String(text)); }
      };
    }
  } },
  framework: {
    publicUrl,
    createOwnerDataSet(policy) { createdPolicy = policy; return policy; }
  },
  dataClient: {
    async load(policy, options) {
      loadedPolicy = policy;
      options.onProgress({ phase: 'restored', key: policy.files[0].key });
      return { entries: [] };
    }
  },
  setEngineState(state) { transitions.push(state); },
  showRuntime(state) { transitions.push(state); },
  setLoading(...detail) { loading.push(detail); },
  log() {}
};

  const adapter = sandbox.WasmGameAdapter;
  assert.equal(adapter.readEngineState(), 'launcher');
  await adapter.init(context);
  assert.equal(createdPolicy.namespace, 'cod2-mp-steam-audit-diagnostic');
  assert.equal(createdPolicy.files.length, 1, 'diagnostic must not download the 3.7 GB archive set');
  assert.equal(createdPolicy.files[0].key, 'localized-english-iw11');

  const first = adapter.start(context);
  assert.equal(adapter.readEngineState(), 'loading');
  await first;
  assert.equal(loadedPolicy, createdPolicy);
  assert.equal(adapter.readEngineState(), 'crashed');
  assert.deepEqual(transitions, ['loading', 'crashed']);
  assert.equal(factoryCalls, 1);
  assert.ok(loading.some(detail => String(detail[0]).includes('native checksum diagnostic')));
  assert.ok(drawn.includes('Status: Still in development'));
  assert.ok(drawn.some(text => text.includes('cannot link for WebAssembly')));
  assert.doesNotMatch(drawn.join('\n'), /game data|files?|cache|container|directory|folder|upload|download/i);

  await adapter.start(context);
  assert.equal(factoryCalls, 1, 'repeat start must not create a second diagnostic runtime');
  assert.equal(adapter.readEngineState(), 'crashed');
}

(async () => {
  for (const prefix of ['/', '/cod2-mp/', '/games/cod2-mp/']) await checkPrefix(prefix);
  console.log('Call of Duty 2 root/single/nested-prefix diagnostic assets, honest state, cache boundary and repeat-start contracts passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
