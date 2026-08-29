'use strict';

let persistenceManager = null;
let runtime = null;
let started = false;
let failed = false;

function post(type, text, extra) {
  self.postMessage({ type, text: text == null ? undefined : String(text), ...(extra || {}) });
}

function call(name, ...arguments_) {
  const fn = runtime && runtime[`_${name}`];
  if (typeof fn === 'function') return fn(...arguments_);
  return 0;
}

async function launch(message) {
  if (started) return;
  started = true;
  failed = false;
  const { canvas, entries = [], variant, width, height, playerName, engineArguments = [], persistence = {} } = message;
  const roe = variant === 'roe';
  try {
    // Emscripten's SDL screen-size shim reads the Window-only `screen` global.
    // Supply its worker equivalent from the framework-owned OffscreenCanvas.
    if (!self.screen) {
      self.screen = {
        width: Number(width || canvas?.width || 1280),
        height: Number(height || canvas?.height || 720),
        availWidth: Number(width || canvas?.width || 1280),
        availHeight: Number(height || canvas?.height || 720)
      };
    }
    // SDL names the Emscripten target `#canvas`.  In a worker there is no DOM
    // lookup, so resolve that one target directly to the transferred canvas.
    // Input is intentionally delivered by the framework instead of DOM events.
    try { if (!canvas.id) canvas.id = 'canvas'; } catch (_) {}
    const canvasRect = () => ({
      x: 0, y: 0, left: 0, top: 0,
      right: Number(canvas.width || width || 1280),
      bottom: Number(canvas.height || height || 720),
      width: Number(canvas.width || width || 1280),
      height: Number(canvas.height || height || 720)
    });
    try { canvas.getBoundingClientRect = canvasRect; } catch (_) {}
    try { canvas.addEventListener = () => {}; } catch (_) {}
    try { canvas.removeEventListener = () => {}; } catch (_) {}
    try { if (!canvas.style) canvas.style = {}; } catch (_) {}
    self.document = {
      querySelector: selector => selector === '#canvas' || selector === 'canvas' ? canvas : null,
      getElementById: id => id === 'canvas' ? canvas : null,
      addEventListener() {},
      removeEventListener() {}
    };
    post('status', `Loading ${roe ? 'Resurrection of Evil' : 'Doom 3'} engine…`);
    if (persistence.frameworkScript !== '/shared-shell/wasm-game-framework.js' || persistence.frameworkVersion !== '0.9.6') {
      throw new Error('Doom 3 requires the exact wasm-game-framework 0.9.6 worker persistence contract.');
    }
    importScripts(persistence.frameworkScript);
    if (self.WasmGameFramework?.version !== persistence.frameworkVersion) {
      throw new Error(`Doom 3 loaded wasm-game-framework ${self.WasmGameFramework?.version || 'unknown'}, expected ${persistence.frameworkVersion}.`);
    }
    persistenceManager = self.WasmGameFramework.createPersistenceManager({
      namespace: persistence.namespace,
      root: persistence.root,
      debounceMs: persistence.debounceMs,
      intervalMs: persistence.intervalMs,
      requestDurability: persistence.requestDurability,
      onError: error => post('log', `Save/config persistence warning: ${error?.message || error}`)
    });
    self.idtech4PersistenceDirty = () => persistenceManager?.markDirty();
    self.idtech4PersistenceSave = () => {
      persistenceManager?.markDirty();
      void persistenceManager?.save().catch(error => post('log', `Save/config persistence warning: ${error?.message || error}`));
    };
    const nativeArguments = [
      '+set', 'fs_basepath', '/owner-data',
      '+set', 'fs_cdpath', '/owner-data',
      '+set', 'fs_savepath', persistence.root,
      '+set', 'fs_configpath', persistence.root,
      '+set', 'r_fullscreen', '0',
      '+set', 'r_mode', '-1',
      '+set', 'r_customWidth', String(width || 1280),
      '+set', 'r_customHeight', String(height || 720),
      '+set', 'ui_name', String(playerName || 'Marine').slice(0, 32),
      ...engineArguments,
      ...(roe ? ['+set', 'fs_game', 'd3xp'] : [])
    ];
    self.Module = runtime = {
      canvas,
      noInitialRun: true,
      locateFile: path => new URL(path.endsWith('.wasm') ? `dhewm3-${roe ? 'roe' : 'base'}.wasm` : path, self.location.href).href,
      preRun: [() => {
        FS.mkdir('/owner-data');
        FS.mount(WORKERFS, { blobs: entries.map(entry => ({ name: entry.path, data: entry.file })) }, '/owner-data');
      }],
      print: line => post('log', line),
      printErr: line => post('log', `ERR: ${line}`),
      onRuntimeInitialized: () => {
        void (async () => {
          await persistenceManager.attach(runtime.FS);
          post('persistence-ready', null, { root: persistenceManager.root, namespace: persistenceManager.namespace });
          post('status', 'Initializing the Doom 3 renderer and menus…');
          runtime.callMain(nativeArguments);
        })().catch(reason => {
          failed = true;
          post('error', reason instanceof Error ? reason.stack || reason.message : reason);
        });
      },
      onExit: status => {
        if (status !== 0) {
          failed = true;
          post('error', `Doom 3 exited during initialization (status ${status}).`);
        }
      },
      onAbort: reason => {
        failed = true;
        post('error', reason);
      }
    };
    importScripts(`/dhewm3-${roe ? 'roe' : 'base'}.js`);
  } catch (reason) {
    started = false;
    failed = true;
    post('error', reason instanceof Error ? reason.stack || reason.message : reason);
  }
}

self.onerror = (message, source, lineno, colno, error) => {
  failed = true;
  const location = source ? ` (${source}:${lineno || 0}:${colno || 0})` : '';
  const detail = error?.stack || error?.message || message || 'Uncaught worker error';
  post('error', `${detail}${location}`);
  return true;
};

self.onmessage = event => {
  const message = event.data || {};
  if (message.type === 'start') { void launch(message); return; }
  if (message.type === 'persist') {
    void persistenceManager?.save().catch(error => post('log', `Save/config persistence warning: ${error?.message || error}`));
    return;
  }
  if (!runtime || failed) return;
  if (message.type === 'resize') call('D3WASM_BrowserResize', message.width | 0, message.height | 0);
  if (message.type === 'open-menu') call('D3WASM_BrowserOpenMenu');
  if (message.type === 'capture') call('D3WASM_BrowserCapture', message.captured ? 1 : 0);
  if (message.type === 'pointer-absolute') call('D3WASM_BrowserPointer', message.x | 0, message.y | 0, 0);
  if (message.type === 'pointer-relative') call('D3WASM_BrowserPointer', message.dx | 0, message.dy | 0, 1);
  if (message.type === 'pointer-button') call('D3WASM_BrowserPointerButton', message.button | 0, message.down ? 1 : 0);
  if (message.type === 'key') call('D3WASM_BrowserKey', message.scan | 0, message.key | 0, message.down ? 1 : 0, message.repeat ? 1 : 0);
  if (message.type === 'text') call('D3WASM_BrowserText', message.codepoint | 0);
  if (message.type === 'command') {
    const text = String(message.text || '');
    if (!text) return;
    const bytes = lengthBytesUTF8(text) + 1;
    const pointer = _malloc(bytes);
    try {
      stringToUTF8(text, pointer, bytes);
      call('D3WASM_BrowserCommand', pointer);
    } finally {
      _free(pointer);
    }
  }
};
