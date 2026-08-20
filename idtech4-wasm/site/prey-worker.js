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
  const { canvas, entries = [], width, height, playerName, engineArguments = [], persistence = {} } = message;
  try {
    post('status', 'Loading Prey engine…');
    if (persistence.frameworkScript !== '/shared-shell/wasm-game-framework.js' || persistence.frameworkVersion !== '0.9.2') {
      throw new Error('Prey requires the exact wasm-game-framework 0.9.2 worker persistence contract.');
    }
    importScripts(persistence.frameworkScript);
    if (self.WasmGameFramework?.version !== persistence.frameworkVersion) {
      throw new Error(`Prey loaded wasm-game-framework ${self.WasmGameFramework?.version || 'unknown'}, expected ${persistence.frameworkVersion}.`);
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
      '+set', 'ui_name', String(playerName || 'Tommy').slice(0, 32),
      ...engineArguments
    ];
    self.Module = runtime = {
      canvas,
      noInitialRun: true,
      locateFile: path => new URL(path.endsWith('.wasm') ? 'prey06.wasm' : path, self.location.href).href,
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
          post('status', 'Initializing the Prey renderer and menus…');
          runtime.callMain(nativeArguments);
        })().catch(reason => {
          failed = true;
          post('error', reason instanceof Error ? reason.stack || reason.message : reason);
        });
      },
      onExit: status => {
        if (status !== 0) {
          failed = true;
          post('error', `Prey exited during initialization (status ${status}).`);
        }
      },
      onAbort: reason => {
        failed = true;
        post('error', reason);
      }
    };
    importScripts('/prey06.js');
  } catch (reason) {
    started = false;
    failed = true;
    post('error', reason instanceof Error ? reason.stack || reason.message : reason);
  }
}

self.onerror = event => {
  failed = true;
  const location = event.filename ? ` (${event.filename}:${event.lineno || 0}:${event.colno || 0})` : '';
  post('error', `${event.message || 'Uncaught worker error'}${location}`);
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
  if (message.type === 'resize') call('PREYWASM_BrowserResize', message.width | 0, message.height | 0);
  if (message.type === 'open-menu') call('PREYWASM_BrowserOpenMenu');
  if (message.type === 'capture') call('PREYWASM_BrowserCapture', message.captured ? 1 : 0);
  if (message.type === 'pointer-absolute') call('PREYWASM_BrowserPointer', message.x | 0, message.y | 0, 0);
  if (message.type === 'pointer-relative') call('PREYWASM_BrowserPointer', message.dx | 0, message.dy | 0, 1);
  if (message.type === 'pointer-button') call('PREYWASM_BrowserPointerButton', message.button | 0, message.down ? 1 : 0);
  if (message.type === 'key') call('PREYWASM_BrowserKey', message.scan | 0, message.key | 0, message.down ? 1 : 0, message.repeat ? 1 : 0);
  if (message.type === 'text') call('PREYWASM_BrowserText', message.codepoint | 0);
};
