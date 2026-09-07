'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../games/quake3/site/game-adapter.js'), 'utf8');
const cleanup = "      if (next === 'gameplay') setCvar('ui_joinGameStatus', '');";
assert.equal(source.split(cleanup).length, 2);

async function createAdapter(adapterSource) {
  const cvars = new Map();
  const bytes = new Uint8Array(1024 * 1024);
  let offset = 8;
  const allocate = length => { const address = offset; offset += length; return address; };
  const string = address => new TextDecoder().decode(bytes.subarray(address, bytes.indexOf(0, address)));
  const store = value => {
    const encoded = new TextEncoder().encode(`${value}\0`);
    const address = allocate(encoded.length);
    bytes.set(encoded, address);
    return address;
  };
  const timers = [];
  const canvas = { width: 1280, height: 720, addEventListener() {} };
  let wakeResolve;
  let wakeReject;
  let wakeCalls = 0;
  const env = {
    TextEncoder, TextDecoder, File, performance,
    location: { hostname: 'localhost', port: '8083', protocol: 'http:' },
    HEAPU8: bytes, Pointer_stringify: string, FS: {}, SYSC: {}, SYS: {},
    setInterval(callback) { timers.push(callback); return timers.length; },
    clearInterval() {},
    window: { addEventListener() {} },
    document: {
      documentElement: { dataset: {} }, pointerLockElement: null,
      addEventListener() {}, createElement() { return {}; },
      head: { appendChild(script) {
        Object.assign(env.ioq3, {
          _malloc: allocate, _free() {}, callMain() {},
          _Cvar_Set: (name, value) => cvars.set(string(name), string(value)),
          _Cvar_VariableString: name => store(cvars.get(string(name)) || '')
        });
        script.onload();
      } }
    },
    fetch: async () => ({ ok: true, json: async () => ({}), blob: async () => new Blob([]) })
  };
  const context = {
    elements: { canvas, runtime: {} },
    log() {}, setLoading() {}, showRuntime() {},
    setEngineState(state) { context.state = state; },
    persistence: { root: '/save/quake3', attach: async () => {} },
    preferences: { values: () => ({ playerName: 'JoinProof', qualityProfile: 'balanced', targetFps: 60 }) },
    dataClient: { load: async () => ({ entries: [] }) },
    framework: {
      createOwnerDataSet: () => ({}),
      createWakeClient: () => ({ ensureRunning() {
        wakeCalls++;
        return new Promise((resolve, reject) => { wakeResolve = resolve; wakeReject = reject; });
      } }),
      createQualityController: () => ({ start() {} })
    }
  };
  vm.runInNewContext(adapterSource, env, { filename: 'game-adapter.js' });
  await env.WasmGameAdapter.init(context);
  await env.WasmGameAdapter.start();
  return {
    cvars, context,
    async tick(values = {}) {
      for (const [name, value] of Object.entries(values)) cvars.set(name, String(value));
      for (const callback of timers) callback();
      await Promise.resolve();
    },
    async wake(error = null) {
      if (error) wakeReject(error);
      else wakeResolve({ state: 'running', map: 'q3dm11' });
      await Promise.resolve();
    },
    wakeCalls: () => wakeCalls
  };
}

async function successfulJoin(adapterSource) {
  const game = await createAdapter(adapterSource);
  await game.tick({ ui_nativeMenu: 1, ui_captureIntent: 0, cg_wasmActive: 0 });
  assert.equal(game.context.state, 'menu');
  await game.tick({ ui_joinGameRequested: 1, ui_captureIntent: 1 });
  assert.equal(game.context.state, 'loading');
  assert.equal(game.cvars.get('ui_joinGameStatus'), 'WAKING ARENA...');
  await game.tick({ ui_joinGameRequested: 1 });
  assert.equal(game.wakeCalls(), 1, 'duplicate pending requests must not wake twice');
  await game.wake();
  assert.equal(game.cvars.get('ui_joinGameStatus'), 'JOINING Q3DM11...');
  assert.equal(game.cvars.get('ui_joinGameReady'), '1');
  assert.equal(game.cvars.get('ui_joinGameAddress'), 'localhost:8083');
  assert.equal(game.cvars.get('name'), 'JoinProof');
  await game.tick({ ui_nativeMenu: 0, ui_joinGameIssued: 1 });
  assert.equal(game.context.state, 'loading');
  assert.equal(game.cvars.get('ui_joinGameStatus'), 'JOINING Q3DM11...');
  await game.tick({ cg_wasmActive: 1 });
  assert.equal(game.context.state, 'gameplay');
  assert.equal(game.cvars.get('ui_joinGameStatus'), '', 'successful join must retire the pending label');
  assert.equal(game.cvars.get('ui_captureIntent'), '1', 'status cleanup must not pretend capture succeeded');
  await game.tick({ ui_nativeMenu: 1, cl_paused: 1, ui_captureIntent: 0 });
  assert.equal(game.context.state, 'paused');
  await game.tick({ ui_nativeMenu: 0, cl_paused: 0, ui_captureIntent: 1 });
  assert.equal(game.context.state, 'gameplay');
  await game.tick({ cg_wasmActive: 0, ui_nativeMenu: 1, ui_captureIntent: 0 });
  assert.equal(game.context.state, 'menu');
  assert.equal(game.cvars.get('ui_joinGameStatus'), '', 'disconnected menu must not still say JOINING');
  await game.tick({ ui_joinGameRequested: 1, ui_captureIntent: 1 });
  assert.equal(game.cvars.get('ui_joinGameStatus'), 'WAKING ARENA...');
  assert.equal(game.wakeCalls(), 2);
  await game.wake();
  assert.equal(game.cvars.get('ui_joinGameStatus'), 'JOINING Q3DM11...');
  await game.tick({ ui_nativeMenu: 0, cg_wasmActive: 1 });
  assert.equal(game.cvars.get('ui_joinGameStatus'), '');
}

async function failedJoin() {
  const game = await createAdapter(source);
  await game.tick({ ui_nativeMenu: 1, ui_joinGameRequested: 1, ui_captureIntent: 1, cg_wasmActive: 0 });
  await game.wake(new Error('test arena unavailable'));
  await game.tick();
  assert.equal(game.context.state, 'menu');
  assert.equal(game.cvars.get('ui_joinGameStatus'), 'ARENA UNAVAILABLE');
  assert.equal(game.cvars.get('ui_captureIntent'), '0');
  await game.tick({ ui_nativeMenu: 0 });
  await game.tick({ ui_nativeMenu: 1 });
  assert.equal(game.cvars.get('ui_joinGameStatus'), 'ARENA UNAVAILABLE', 'menu transitions must retain wake errors');
  await game.tick({ ui_joinGameRequested: 1, ui_captureIntent: 1 });
  await game.wake();
  await game.tick({ ui_nativeMenu: 0, cg_wasmActive: 1 });
  assert.equal(game.cvars.get('ui_joinGameStatus'), '', 'successful retry retires only the completed status');
}

(async () => {
  await successfulJoin(source);
  await failedJoin();
  await assert.rejects(successfulJoin(source.replace(cleanup, '')), /successful join must retire the pending label/);
  console.log('Quake III wake, snapshot, resume, disconnect and retry status contract passed; old cleanup rejected');
})().catch(error => { console.error(error); process.exitCode = 1; });
