'use strict';

let runtime = null;
let persistenceManager = null;
let telemetryTimer = 0;
let failed = false;
let surface = null;
let persistenceRoot = '';
const inputCounters = { pointer: 0, key: 0 };
const hotCacheState = { files: 0, bytes: 0 };

function post(type, text, extra) {
  self.postMessage({ type, text: text == null ? undefined : String(text), ...(extra || {}) });
}

function describe(error) {
  if (runtime?.getExceptionMessage && (typeof error === 'number' || error instanceof WebAssembly.Exception)) {
    try {
      const [type, message] = runtime.getExceptionMessage(error);
      return `${type || 'C++ exception'}${message ? `: ${message}` : ''}`;
    } catch (_) {
      // Preserve the original thrown value if Emscripten cannot decode it.
    }
  }
  return error instanceof Error ? error.stack || error.message : String(error);
}

function ensureDirectory(FS, directory) {
  if (typeof FS.mkdirTree === 'function') {
    FS.mkdirTree(directory);
    return;
  }
  let parent = '/';
  for (const segment of directory.split('/').filter(Boolean)) {
    const current = `${parent === '/' ? '' : parent}/${segment}`;
    try {
      FS.createPath(parent, segment, true, true);
    } catch (error) {
      try { FS.stat(current); } catch (_) { throw error; }
    }
    parent = current;
  }
}

async function stampBundledObjects(FS) {
  // The preload package has no source mtimes: MEMFS assigns Date.now() on
  // every launch. Native FileIndex checks whole-second mtimes, so those
  // otherwise identical objects invalidate the persisted index each time.
  // Give only bundled, indexed files stable content-derived version stamps.
  // Keep native path/size/date validation and all private/user mtimes intact.
  const stats = { files: 0, bytes: 0 };
  async function visit(directory) {
    for (const name of FS.readdir(directory)) {
      if (name === '.' || name === '..') continue;
      const path = `${directory}/${name}`;
      const stat = FS.lstat(path);
      if (FS.isDir(stat.mode)) {
        await visit(path);
      } else if (FS.isFile(stat.mode) && /\.(dat|pob|json|parkobj)$/i.test(name)) {
        const bytes = FS.readFile(path);
        const digest = await crypto.subtle.digest('SHA-256', bytes);
        // FileIndex's date checksum is 32-bit. Preserve all 32 stamp bits in
        // seconds; FS.utime takes milliseconds. Zero is a valid timestamp.
        const seconds = new DataView(digest).getUint32(0, false);
        FS.utime(path, stat.atime.getTime(), seconds * 1000);
        stats.files++;
        stats.bytes += bytes.byteLength;
      }
    }
  }
  await visit('/OpenRCT2/object');
  return stats;
}

function mountInstallationObjects(FS, workerFs, groups, hotCache) {
  // Native ObjectRepository indexes OpenRCT2/object and user/object, not the
  // original RCT2 ObjData directory. Self-contained private .parkobj additions
  // need an indexed mount too; leave the original DAT/image source untouched.
  const files = groups.filter(group => group.directory === 'ObjData')
    .flatMap(group => group.files).filter(file => /\.parkobj$/i.test(file.name));
  if (!files.length) return 0;
  const names = new Set();
  for (const file of files) {
    if (!file.name || /[/\\]/.test(file.name) || names.has(file.name)) {
      throw new Error(`Invalid or duplicate installation object: ${file.name}`);
    }
    names.add(file.name);
  }
  const root = '/OpenRCT2/object/installed';
  ensureDirectory(FS, root);
  const mounted = FS.mount(workerFs, { files }, root);
  hotCache.markTree(mounted);
  return files.length;
}

function stateName(value) {
  if (value === 1) return 'menu';
  if (value === 2) return 'gameplay';
  if (value === 3) return 'paused';
  return 'loading';
}

function installEventShims(canvas) {
  const eventTarget = {
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() { return true; }
  };
  canvas.addEventListener = eventTarget.addEventListener;
  canvas.removeEventListener = eventTarget.removeEventListener;
  self.window = {
    ...eventTarget,
    innerWidth: canvas.width,
    innerHeight: canvas.height,
    outerWidth: canvas.width,
    outerHeight: canvas.height,
    pageXOffset: 0,
    pageYOffset: 0
  };
  self.document = {
    ...eventTarget,
    body: { ...eventTarget, clientWidth: canvas.width, clientHeight: canvas.height },
    documentElement: { ...eventTarget },
    querySelector() { return null; },
    getElementById() { return null; },
    title: 'OpenRCT2'
  };
}

function publishState() {
  if (!runtime || failed) return;
  const drawCount = Number(runtime._OpenRCT2Wasm_DrawCount?.() || 0);
  const framebufferVariation = Number(runtime._OpenRCT2Wasm_FramebufferVariation?.() || 0);
  const state = stateName(Number(runtime._OpenRCT2Wasm_RuntimeState?.() || 0));
  let configBytes = 0;
  let indexBytes = 0;
  try { configBytes = Number(runtime.FS.stat(`${persistenceRoot}/config.ini`).size || 0); } catch (_) {}
  for (const name of ['objects.idx', 'tracks.idx', 'scenarios.idx']) {
    try { indexBytes += Number(runtime.FS.stat(`${persistenceRoot}/${name}`).size || 0); } catch (_) {}
  }
  post('state', null, {
    state,
    drawCount,
    framebufferVariation,
    cursorX: Number(runtime._OpenRCT2Wasm_CursorX?.() || 0),
    cursorY: Number(runtime._OpenRCT2Wasm_CursorY?.() || 0),
    contextWidth: Number(runtime._OpenRCT2Wasm_ContextWidth?.() || 0),
    contextHeight: Number(runtime._OpenRCT2Wasm_ContextHeight?.() || 0),
    windowScale: Number(runtime._OpenRCT2Wasm_WindowScale?.() || 1),
    canvasWidth: Number(surface?.width || 0),
    canvasHeight: Number(surface?.height || 0),
    configBytes,
    indexBytes,
    pointerEvents: inputCounters.pointer,
    keyEvents: inputCounters.key,
    hotCacheFiles: hotCacheState.files,
    hotCacheBytes: hotCacheState.bytes
  });
}

async function launch(message) {
  if (runtime || failed) return;
  const { canvas, groups = [], native = {}, persistence = {}, framework = {} } = message;
  try {
    if (!(canvas instanceof OffscreenCanvas)) throw new Error('OpenRCT2 requires a transferred OffscreenCanvas.');
    surface = canvas;
    if (framework.version !== '0.9.6' || framework.commit !== 'ebb1ebe35ad8224a9080279a6529414db42d3284') {
      throw new Error('OpenRCT2 requires the exact wasm-game-framework 0.9.6 contract.');
    }
    canvas.width = Math.max(2, Number(message.width) || 1280);
    canvas.height = Math.max(2, Number(message.height) || 720);
    // SDL queries the browser Screen API while constructing a window. A
    // dedicated Worker has no Screen object, so expose the canvas dimensions
    // as its single virtual display without pretending this is a DOM Window.
    self.screen = {
      width: canvas.width,
      height: canvas.height,
      availWidth: canvas.width,
      availHeight: canvas.height,
      colorDepth: 24,
      pixelDepth: 24
    };
    self.devicePixelRatio = 1;
    canvas.style = {
      cursor: '',
      removeProperty(name) { delete this[name]; },
      setProperty(name, value) { this[name] = value; }
    };

    post('status', null, { title: 'Starting OpenRCT2…', detail: 'Loading the native runtime.', progress: 58 });
    const basePath = message.basePath;
    if (typeof basePath !== 'string' || !/^\/(?:[a-zA-Z0-9_-]+\/)*$/.test(basePath)) {
      throw new Error('OpenRCT2 requires a canonical public base path.');
    }
    self.WASM_GAME_BASE_PATH = basePath;
    importScripts(`${basePath}shared-shell/wasm-game-framework.js`);
    if (self.WasmGameFramework?.version !== framework.version) {
      throw new Error(`Worker loaded wasm-game-framework ${self.WasmGameFramework?.version || 'unknown'}, expected ${framework.version}.`);
    }
    if (typeof self.WasmGameFramework.publicUrl !== 'function') throw new Error('Framework public URL support is required.');
    const publicUrl = self.WasmGameFramework.publicUrl;
    const audioBridge = await import(publicUrl('/openrct2-audio-bridge.mjs'));
    audioBridge.installWorkerAudioBridge({
      target: self,
      sampleRate: message.audioSampleRate,
      send(payload, transfer) { self.postMessage(payload, transfer || []); }
    });
    importScripts(native.script);
    const factory = self[native.factory];
    if (typeof factory !== 'function') throw new Error(`${native.script} did not register ${native.factory}().`);
    const moduleConfig = {
      noInitialRun: true,
      canvas,
      mainScriptUrlOrBlob: new URL(native.script, self.location.href).href,
      locateFile(name) {
        if (name.endsWith('.wasm')) return native.wasm;
        if (name.endsWith('.data')) return native.data;
        return new URL(name, new URL(native.script, self.location.href)).href;
      },
      print: line => post('log', line),
      printErr: line => post('log', line),
      wasmGamePersistenceChanged(immediate) {
        persistenceManager?.markDirty();
        if (immediate) void persistenceManager?.save().catch(error => post('log', `Save/config persistence warning: ${error?.message || error}`));
      }
    };
    runtime = await factory(moduleConfig);
    if (!runtime?.FS || typeof runtime.callMain !== 'function') {
      throw new Error('Native runtime does not expose the required FS and callMain seams.');
    }
    installEventShims(canvas);

    // Run before mounting any private installation or persistent user files.
    const bundledObjects = await stampBundledObjects(runtime.FS);
    post('log', `[openrct2-wasm] Stable content timestamps applied to ${bundledObjects.files} bundled index files (${bundledObjects.bytes} bytes)`);

    const hotCacheModule = await import(publicUrl('/openrct2-hot-cache.mjs'));
    const workerFs = runtime.FS.filesystems.WORKERFS;
    const hotCache = hotCacheModule.createWorkerFsHotCache(workerFs, detail => {
      hotCacheState.files = detail.files;
      hotCacheState.bytes = detail.bytes;
    });

    post('status', null, { title: 'Starting OpenRCT2…', detail: 'Mounting the installation.', progress: 70 });
    for (const group of groups) {
      const root = `/RCT/${group.directory}`;
      ensureDirectory(runtime.FS, root);
      const mountRoot = runtime.FS.mount(workerFs, { files: group.files }, root);
      if (hotCacheModule.shouldCacheDirectory(group.directory)) hotCache.markTree(mountRoot);
    }
    const installedObjects = mountInstallationObjects(runtime.FS, workerFs, groups, hotCache);
    if (installedObjects) post('log', `[openrct2-wasm] ${installedObjects} private installation park objects mounted for native indexing`);

    persistenceManager = self.WasmGameFramework.createPersistenceManager({
      namespace: persistence.namespace,
      root: persistence.root,
      debounceMs: persistence.debounceMs,
      intervalMs: persistence.intervalMs,
      requestDurability: persistence.requestDurability,
      onStatus: status => post('persistence', null, { status }),
      onError: error => post('log', `Save/config persistence warning: ${error?.message || error}`)
    });
    const persistent = await persistenceManager.attach(runtime.FS, { root: persistence.root });
    persistenceRoot = persistent.root;
    runtime.wasmGamePersistenceRoot = persistent.root;
    for (const name of ['save', 'track', 'screenshot', 'landscape']) {
      ensureDirectory(runtime.FS, `${persistent.root}/${name}`);
    }

    post('status', null, { title: 'Starting OpenRCT2…', detail: 'Initializing the engine.', progress: 85 });
    const launchArguments = [
      `--user-data-path=${persistent.root}`,
      '--openrct2-data-path=/OpenRCT2',
      '--rct2-data-path=/RCT'
    ];
    if (groups.some(group => group.directory.startsWith('RCT1/'))) launchArguments.push('--rct1-data-path=/RCT/RCT1');
    runtime.callMain(launchArguments);
    // OpenRCT2 builds its object, track and scenario indexes before installing
    // the browser main loop. Persist that first-run work immediately so later
    // launches can restore the indexes instead of rebuilding them.
    persistenceManager.markDirty();
    void persistenceManager.save().catch(error => post('log', `Startup index persistence warning: ${error?.message || error}`));
    telemetryTimer = setInterval(publishState, 250);
    publishState();
  } catch (error) {
    failed = true;
    post('error', describe(error));
  }
}

self.addEventListener('error', event => {
  failed = true;
  post('error', `${event.message || 'Uncaught worker error'} (${event.filename || 'worker'}:${event.lineno || 0}:${event.colno || 0})`);
});

self.addEventListener('unhandledrejection', event => {
  failed = true;
  post('error', describe(event.reason));
});

self.addEventListener('message', event => {
  const message = event.data || {};
  if (message.type === 'start') { void launch(message); return; }
  if (!runtime || failed) return;
  if (message.type === 'persist') {
    persistenceManager?.markDirty();
    void persistenceManager?.save().catch(error => post('log', `Save/config persistence warning: ${error?.message || error}`));
    return;
  }
  if (message.type === 'resize') {
    self.screen.width = self.screen.availWidth = message.width;
    self.screen.height = self.screen.availHeight = message.height;
    self.window.innerWidth = self.window.outerWidth = message.width;
    self.window.innerHeight = self.window.outerHeight = message.height;
    self.document.body.clientWidth = message.width;
    self.document.body.clientHeight = message.height;
    runtime.setCanvasSize?.(message.width, message.height, false);
    runtime._OpenRCT2Wasm_Resize?.(message.width, message.height);
    publishState();
    return;
  }
  if (message.type === 'pointer-move') {
    runtime._OpenRCT2Wasm_PointerMove?.(message.x, message.y);
    inputCounters.pointer++;
  }
  if (message.type === 'pointer-button') {
    runtime._OpenRCT2Wasm_PointerButton?.(message.button, message.pressed, message.x, message.y);
    inputCounters.pointer++;
  }
  if (message.type === 'pointer-wheel') {
    runtime._OpenRCT2Wasm_PointerWheel?.(message.deltaX, message.deltaY);
    inputCounters.pointer++;
  }
  if (message.type === 'key') {
    runtime._OpenRCT2Wasm_Key?.(message.scancode, message.pressed, message.modifiers || 0);
    inputCounters.key++;
  }
  if (message.type === 'text-input' && message.text) {
    runtime.ccall('OpenRCT2Wasm_TextInput', null, ['string'], [String(message.text)]);
  }
});
