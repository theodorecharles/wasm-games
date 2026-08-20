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
    if (framework.version !== '0.9.6' || framework.commit !== 'ad0226db55a2925bb250c6e31ca6786bd0dc73bd') {
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
    importScripts('/shared-shell/wasm-game-framework.js');
    if (self.WasmGameFramework?.version !== framework.version) {
      throw new Error(`Worker loaded wasm-game-framework ${self.WasmGameFramework?.version || 'unknown'}, expected ${framework.version}.`);
    }
    const audioBridge = await import('/openrct2-audio-bridge.mjs');
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
        return new URL(name, native.script).href;
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

    const hotCacheModule = await import('/openrct2-hot-cache.mjs');
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
