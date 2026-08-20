'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'web', 'game-adapter.js'), 'utf8');
const dataManifest = JSON.parse(fs.readFileSync(path.join(root, 'web', 'wasm-game-data.json'), 'utf8'));
assert.ok(dataManifest.variants.hl2);
assert.ok(dataManifest.variants.hl2.files.length >= 1);
assert.ok(dataManifest.variants.hl2.files.length < 32, 'browser policy must stay a stub, not the owner catalog');
assert.ok(Buffer.byteLength(JSON.stringify(dataManifest)) < 16 * 1024, 'browser wasm-game-data.json must stay small');
assert.doesNotMatch(source, /wasm-game-files\.json/);
assert.match(source, /\/owner\//);
assert.match(source, /\/owner-index/);

assert.doesNotMatch(source, /module\.exports|exports\.|require\(/);
assert.match(source, /createSourceEngineModule/);
assert.match(source, /noInitialRun:\s*true/);
assert.doesNotMatch(source, /requestPointerLock|exitPointerLock/);

const order = [];
let attachedRoot = null;
let callMainArgs = null;

function createFakeModule() {
  const native = { state: 2, intent: 0 };
  return {
    FS: {
      filesystems: { IDBFS: {} },
      mkdirTree() {},
      symlink() {},
      writeFile() {},
      createFile() {
        return { stream_ops: {}, contents: null };
      },
      createDataFile() {}
    },
    callMain(args) {
      order.push('callMain');
      callMainArgs = args;
    },
    source_wasm_read_engine_state() {
      return native.state;
    },
    source_wasm_read_capture_intent() {
      return native.intent;
    },
    source_wasm_pause() {
      order.push('pause');
      native.state = 4;
    },
    ccall() {}
  };
}

const sandbox = {
  console,
  fetch: async (url) => {
    const href = String(url);
    if (href.startsWith('/wasm-game-data.json')) {
      return { ok: true, json: async () => dataManifest };
    }
    if (href.startsWith('/owner-index')) {
      return { ok: true, json: async () => ({
        schema: 1,
        recipe: 'goty-2014-plus-legacy-shaders-v1',
        files: [['hl2/gameinfo.txt', 128]]
      }) };
    }
    throw new Error(`unexpected fetch ${url}`);
  },
  XMLHttpRequest: undefined,
  document: undefined
};
sandbox.globalThis = sandbox;
sandbox.createSourceEngineModule = async (options) => {
  assert.equal(options.noInitialRun, true);
  order.push('factory');
  return createFakeModule();
};
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: 'game-adapter.js' });

const adapter = sandbox.WasmGameAdapter;
const context = {
  variant: 'hl2',
  preferences: { playerName: 'Gordon' },
  framework: {
    createOwnerDataSet(policy) {
      assert.ok(
        policy.version === 'steam-legacy-hl2-v1'
        || policy.version === 'goty-2014-plus-legacy-shaders-v1'
      );
      return policy;
    }
  },
  persistence: {
    root: '/save/hl2',
    async attach(_fs, opts) {
      order.push('persist');
      attachedRoot = opts.root;
    }
  },
  log() {},
  showLoading() {},
  setLoading() {},
  setEngineState() {},
  showRuntime() {}
};

(async () => {
  await adapter.init(context);
  assert.equal(adapter.readEngineState(), 'launcher');
  await adapter.start(context);
  assert.deepEqual(order, ['factory', 'persist', 'callMain']);
  assert.equal(attachedRoot, '/save/hl2');
  assert.ok(callMainArgs.includes('-game'));
  assert.ok(callMainArgs.includes('hl2'));
  assert.ok(callMainArgs.includes('-novid'));
  assert.equal(adapter.readEngineState(), 'menu');
  adapter.captureLost();
  assert.equal(adapter.readEngineState(), 'paused');
  process.stdout.write('adapter unit: persist-before-main, native factory, honest state\n');

  const codes = { 0: 'launcher', 1: 'loading', 2: 'menu', 3: 'gameplay', 6: 'crashed' };
  for (const [code, expected] of Object.entries(codes)) {
    const coded = {
      FS: createFakeModule().FS,
      callMain() {},
      source_wasm_read_engine_state() { return Number(code); },
      ccall() {}
    };
    const codeSandbox = { console, fetch: sandbox.fetch, XMLHttpRequest: undefined, document: undefined };
    codeSandbox.globalThis = codeSandbox;
    codeSandbox.createSourceEngineModule = async () => coded;
    vm.createContext(codeSandbox);
    vm.runInContext(source, codeSandbox, { filename: 'game-adapter.js' });
    const codedAdapter = codeSandbox.WasmGameAdapter;
    await codedAdapter.init(context);
    await codedAdapter.start(context);
    assert.equal(codedAdapter.readEngineState(), expected);
  }
  process.stdout.write('adapter unit: native codes decode menu/loading/crashed only from export\n');

  const noExportOrder = [];
  const noExportSandbox = {
    console,
    fetch: sandbox.fetch,
    XMLHttpRequest: undefined,
    document: undefined
  };
  noExportSandbox.globalThis = noExportSandbox;
  noExportSandbox.createSourceEngineModule = async (options) => {
    assert.equal(options.noInitialRun, true);
    noExportOrder.push('factory');
    return {
      FS: {
        filesystems: { IDBFS: {} },
        mkdirTree() {},
        symlink() {},
        writeFile() {},
        createFile() { return { stream_ops: {}, contents: null }; },
        createDataFile() {}
      },
      callMain() { noExportOrder.push('callMain'); },
      ccall() {}
    };
  };
  vm.createContext(noExportSandbox);
  vm.runInContext(source, noExportSandbox, { filename: 'game-adapter.js' });
  const noExportAdapter = noExportSandbox.WasmGameAdapter;
  await noExportAdapter.init(context);
  assert.equal(noExportAdapter.readEngineState(), 'launcher');
  await noExportAdapter.start(context);
  const noExportState = noExportAdapter.readEngineState();
  assert.notEqual(noExportState, 'gameplay');
  assert.notEqual(noExportState, 'menu');
  assert.ok(noExportState === 'loading' || noExportState === 'launcher');
  process.stdout.write('adapter unit: missing native export is not fake gameplay\n');

  async function runOwnerMountScenario({ failWhole = false } = {}) {
    const nodes = new Map();
    const heap = new Uint8Array(128);
    const rangeRequests = [];
    const FS = {
      filesystems: { IDBFS: {} },
      mkdirTree() {},
      symlink() {},
      unlink(filePath) { nodes.delete(filePath); },
      createDataFile(parent, name, bytes) {
        const filePath = `${parent}/${name}`.replace('//', '/');
        nodes.set(filePath, { contents: new Uint8Array(bytes) });
      },
      createFile(parent, name) {
        const filePath = `${parent}/${name}`.replace('//', '/');
        const node = { stream_ops: {}, contents: null };
        nodes.set(filePath, node);
        return node;
      }
    };
    const module = {
      FS,
      HEAPU8: heap,
      callMain() {},
      source_wasm_read_engine_state() { return 2; },
      ccall() {}
    };
    const ownerManifest = {
      variants: {
        hl2: {
          namespace: 'source-hl2',
          version: 'goty-2014-plus-legacy-shaders-v1',
          files: [{ key: 'gameinfo', path: 'hl2/gameinfo.txt', size: 8 }]
        }
      }
    };
    const index = {
      schema: 1,
      recipe: 'goty-2014-plus-legacy-shaders-v1',
      files: [
        ['hl2/gameinfo.txt', 8],
        ['hl2/steam.inf', 8],
        ['hl2/materials/Console/case-test.vtf', 8],
        ['hl2/whole.bin', 6],
        ['hl2/range.bin', 16 * 1024 * 1024]
      ]
    };
    const eager = {
      '/owner/hl2/gameinfo.txt': Buffer.from('gameinfo'),
      '/owner/hl2/steam.inf': Buffer.from('steaminf')
    };
    const ownerFetch = async (url) => {
      const href = String(url);
      if (href.startsWith('/wasm-game-data.json')) {
        return { ok: true, json: async () => ownerManifest };
      }
      if (href === '/owner-index') return { ok: true, json: async () => index };
      if (eager[href]) {
        return { ok: true, arrayBuffer: async () => eager[href].buffer.slice(eager[href].byteOffset, eager[href].byteOffset + eager[href].byteLength) };
      }
      throw new Error(`unexpected async owner fetch ${href}`);
    };
    class FakeXHR {
      open(_method, url) { this.url = String(url); }
      setRequestHeader(name, value) { this[name.toLowerCase()] = String(value); }
      overrideMimeType() {}
      send() {
        if (this.url.endsWith('/whole.bin')) {
          this.status = failWhole ? 503 : 200;
          this.responseText = failWhole ? '' : 'abcdef';
          return;
        }
        if (this.url.endsWith('/case-test.vtf')) {
          this.status = 200;
          this.responseText = 'case-test';
          return;
        }
        const match = /^bytes=(\d+)-(\d+)$/.exec(this.range || '');
        if (!this.url.endsWith('/range.bin') || !match) {
          this.status = 500;
          this.responseText = '';
          return;
        }
        const start = Number(match[1]);
        const end = Number(match[2]);
        rangeRequests.push([start, end]);
        this.status = 206;
        const bytes = Buffer.alloc(end - start + 1);
        for (let i = 0; i < bytes.length; i += 1) bytes[i] = (start + i) & 0xff;
        this.responseText = bytes.toString('latin1');
      }
    }
    const mountSandbox = {
      console,
      fetch: ownerFetch,
      XMLHttpRequest: FakeXHR,
      document: undefined
    };
    mountSandbox.globalThis = mountSandbox;
    mountSandbox.createSourceEngineModule = async () => module;
    vm.createContext(mountSandbox);
    vm.runInContext(source, mountSandbox, { filename: 'game-adapter.js' });
    const mountAdapter = mountSandbox.WasmGameAdapter;
    const mountContext = {
      variant: 'hl2',
      preferences: {},
      framework: { createOwnerDataSet(value) { return value; } },
      setEngineState() {},
      showLoading() {},
      setLoading() {},
      showRuntime() {},
      log() {}
    };
    await mountAdapter.init(mountContext);
    if (failWhole) {
      await mountAdapter.start(mountContext);
      const failed = nodes.get('/game/hl2/whole.bin');
      assert.throws(() => failed.stream_ops.read({}, heap, 24, 4, 0), /HTTP 503/);
      return;
    }
    await mountAdapter.start(mountContext);
    assert.equal(Buffer.from(nodes.get('/game/hl2/gameinfo.txt').contents).toString(), 'gameinfo');
    assert.equal(Buffer.from(nodes.get('/game/hl2/steam.inf').contents).toString(), 'steaminf');
    const caseOriginal = nodes.get('/game/hl2/materials/Console/case-test.vtf');
    const caseFolded = nodes.get('/game/hl2/materials/console/case-test.vtf');
    assert.ok(caseOriginal && caseFolded, 'case-folded owner aliases must both be mounted');
    assert.equal(caseOriginal.stream_ops.read({}, heap, 60, 9, 0), 9);
    assert.equal(Buffer.from(heap.subarray(60, 69)).toString(), 'case-test');

    const whole = nodes.get('/game/hl2/whole.bin');
    assert.ok(whole && whole.stream_ops && typeof whole.stream_ops.read === 'function');
    let read = whole.stream_ops.read({}, heap, 24, 10, 2);
    assert.equal(read, 4, 'whole-file lazy reads must short-read at EOF');
    assert.deepEqual([...heap.subarray(24, 28)], [...Buffer.from('cdef')]);
    assert.equal(whole.stream_ops.read({}, heap, 24, 4, 6), 0);

    const range = nodes.get('/game/hl2/range.bin');
    assert.ok(range && range.stream_ops && typeof range.stream_ops.read === 'function');
    read = range.stream_ops.read({}, heap, 40, 5, 1024);
    assert.equal(read, 5);
    assert.deepEqual([...heap.subarray(40, 45)], [0, 1, 2, 3, 4]);
    read = range.stream_ops.read({}, heap, 48, 4, 1024 * 1024 - 2);
    assert.equal(read, 4, 'range reads must span adjacent chunks');
    assert.deepEqual([...heap.subarray(48, 52)], [254, 255, 0, 1]);
    assert.deepEqual(rangeRequests, [[0, 1024 * 1024 - 1], [1024 * 1024, 2 * 1024 * 1024 - 1]]);
  }

  await runOwnerMountScenario();
  await runOwnerMountScenario({ failWhole: true });
  process.stdout.write('adapter unit: eager/whole/range owner mounts, heap offsets, short reads, and HTTP failure\n');

  const patchScript = fs.readFileSync(path.join(root, 'scripts', 'apply-source-patches.mjs'), 'utf8');
  assert.match(patchScript, /SourceWasm_SafeLockMesh/);
  assert.match(patchScript, /SourceWasm_SafeUnlockMesh/);
  assert.match(patchScript, /SourceWasm_SafeSetPrimitiveType/);
  assert.match(patchScript, /startup_graphic_restore_plaque/);
  const exportsCpp = fs.readFileSync(path.join(root, 'patches', 'files', 'source_wasm_exports.cpp'), 'utf8');
  assert.match(exportsCpp, /source_wasm_client_cmd/);
  const linkFlags = fs.readFileSync(path.join(root, 'patches', 'files', 'source_wasm.py'), 'utf8');
  assert.match(linkFlags, /INITIAL_MEMORY=2147483648/);
  assert.match(linkFlags, /MAXIMUM_MEMORY=4294901760/);
  assert.ok(callMainArgs.includes('+mem_max_heapsize'));
  process.stdout.write('adapter unit: IMesh LockMesh/Draw dispatch is patched\n');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
