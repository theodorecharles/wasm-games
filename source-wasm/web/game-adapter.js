/* global WasmGameAdapter */
'use strict';

(function (global) {
  const STATE_CODES = Object.freeze({
    0: 'launcher',
    1: 'loading',
    2: 'menu',
    3: 'gameplay',
    4: 'paused',
    5: 'debrief',
    6: 'crashed'
  });

  const PROFILE_CVARS = Object.freeze({
    default: { mat_picmip: '0', r_rootlod: '0', mat_reducefillrate: '0' },
    quality: { mat_picmip: '-1', r_rootlod: '0', mat_reducefillrate: '0' },
    performance: { mat_picmip: '2', r_rootlod: '2', mat_reducefillrate: '1' }
  });

  const LAZY_MIN_BYTES = 16 * 1024 * 1024;
  const RANGE_CHUNK_BYTES = 1024 * 1024;
  const HEAP_GUARD_BYTES = 16;
  const KNOWN_OWNER_RECIPES = Object.freeze([
    'goty-2014-plus-legacy-shaders-v1',
    'steam-legacy-hl2-v1',
    'steam-legacy-loose-v1',
    'steam-portal-v1'
  ]);
  const VARIANT_TITLES = Object.freeze({
    hl2: 'Half-Life 2',
    portal: 'Portal'
  });
  const PREFETCH_PREFIXES = Object.freeze([
    'materials/debug/',
    'materials/console/',
    'materials/vgui/',
    'materials/engine/',
    'materials/dev/',
    'shaders/',
    'vgui/',
    'resource/',
    'hl2/resource/',
    'portal/resource/',
    'platform/resource/'
  ]);

  let engineState = 'launcher';
  let captureIntent = false;
  let started = false;
  let starting = null;
  let nativeModule = null;
  let persistAttached = false;
  let ownerData = null;
  let manifest = null;
  let lastPreferences = null;
  let preferencesPending = true;
  let lastPointer = { x: 0, y: 0, captured: false };
  let debugNativeStateReported = false;
  const workerBridges = new WeakMap();
  const lazyByPath = new Map();
  let publicUrl = value => value;

  function sanitizePlayerName(name) {
    const raw = String(name == null ? '' : name);
    const stripped = raw.replace(/[^\x20-\x7E]/g, '').replace(/[<>"`]/g, '').trim();
    return stripped.slice(0, 32) || 'Player';
  }

  function decodeEngineState(code) {
    return STATE_CODES[code] || 'crashed';
  }

  function nativeFn(mod, name) {
    if (!mod) return null;
    if (typeof mod[name] === 'function') return mod[name];
    const underscored = `_${name}`;
    if (typeof mod[underscored] === 'function') return mod[underscored];
    // cwrap creates a callable wrapper even when the native export is absent.
    // Optional diagnostics must not probe that wrapper and abort the runtime.
    return null;
  }

  function readNativeState(mod) {
    if (threadedSideRuntime(mod)) return workerBridges.get(mod)?.state || 'loading';
    const fn = nativeFn(mod, 'source_wasm_read_engine_state');
    if (!fn) return engineState === 'launcher' ? 'loading' : engineState;
    const raw = fn();
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.dataset.debugNativeState = String(raw);
      const phaseFn = nativeFn(mod, 'source_wasm_read_map_phase');
      if (phaseFn) {
        try {
          document.documentElement.dataset.debugNativeMapPhase = String(phaseFn());
        } catch (error) {
          document.documentElement.dataset.debugNativeMapPhase = `error:${String(error && error.message ? error.message : error)}`;
        }
      }
      const countFn = nativeFn(mod, 'source_wasm_read_map_phase_history_count');
      const historyFn = nativeFn(mod, 'source_wasm_read_map_phase_history');
      if (countFn && historyFn) {
        try {
          const traceCount = countFn();
          const trace = [];
          const first = Math.max(0, traceCount - 32);
          for (let i = first; i < traceCount; i += 1) {
            trace.push(historyFn(i));
          }
          document.documentElement.dataset.debugNativePhaseTrace = trace.join(',');
        } catch (_) {}
      }
    }
    if (!debugNativeStateReported && typeof console !== 'undefined') {
      debugNativeStateReported = true;
      console.log(`[source-wasm-debug] native state raw=${raw}`);
    }
    return decodeEngineState(raw);
  }

  function readNativeCaptureIntent(mod) {
    if (threadedSideRuntime(mod)) return workerBridges.get(mod)?.captureIntent === true;
    const fn = nativeFn(mod, 'source_wasm_read_capture_intent');
    if (!fn) return false;
    return !!fn();
  }

  function nativePause(mod) {
    if (threadedSideRuntime(mod)) return workerBridges.get(mod)?.pause() || false;
    const fn = nativeFn(mod, 'source_wasm_pause');
    if (fn) fn();
  }

  function applyIdentity(mod, values) {
    const name = sanitizePlayerName(values && values.playerName);
    if (nativeFn(mod, 'source_wasm_set_player_name') && typeof mod.ccall === 'function') {
      try { mod.ccall('source_wasm_set_player_name', null, ['string'], [name]); } catch (_) {}
    }
    return name;
  }

  function applyGraphics(mod, values) {
    const profile = values && values.profile && PROFILE_CVARS[values.profile]
      ? values.profile
      : 'default';
    if (nativeFn(mod, 'source_wasm_set_cvar') && typeof mod.ccall === 'function') {
      for (const [name, value] of Object.entries(PROFILE_CVARS[profile])) {
        try { mod.ccall('source_wasm_set_cvar', null, ['string', 'string'], [name, value]); } catch (_) {}
      }
    }
    return profile;
  }

  function applyReadyPreferences(mod, state) {
    if (!preferencesPending || !['menu', 'gameplay', 'paused', 'debrief'].includes(state)) return;
    if (threadedSideRuntime(mod)) {
      const values = lastPreferences || {};
      const profile = Object.prototype.hasOwnProperty.call(PROFILE_CVARS, values.profile) ? values.profile : 'default';
      if (workerBridges.get(mod)?.enqueue(2, `${sanitizePlayerName(values.playerName)}\n${profile}`)) preferencesPending = false;
      return;
    }
    applyIdentity(mod, lastPreferences || {});
    applyGraphics(mod, lastPreferences || {});
    preferencesPending = false;
  }

  function loadFactory() {
    if (typeof global.createSourceEngineModule === 'function') {
      return Promise.resolve(global.createSourceEngineModule);
    }
    if (typeof document === 'undefined') {
      return Promise.reject(new Error('Source engine factory is missing'));
    }
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = assetUrl('source-engine.js');
      script.onload = () => {
        if (typeof global.createSourceEngineModule === 'function') resolve(global.createSourceEngineModule);
        else reject(new Error('Source engine factory is missing'));
      };
      script.onerror = () => reject(new Error('Source engine factory failed to load'));
      document.head.appendChild(script);
    });
  }

  // A test/build cache key is supplied as ?cb=... while iterating on the
  // native binary. Keep the JavaScript loader and its wasm companion on the
  // same key so a headed browser cannot silently execute an older build.
  function assetUrl(name) {
    const resource = publicUrl(`/${name}`);
    if (typeof location === 'undefined') return resource;
    const key = new URL(location.href).searchParams.get('cb');
    return key ? `${resource}?cb=${encodeURIComponent(key)}` : resource;
  }

  function ensureEngineCanvas() {
    if (typeof document === 'undefined') return undefined;
    let canvas = document.querySelector('#canvas')
      || document.querySelector('[data-shell-canvas]')
      || document.querySelector('canvas');
    if (!canvas) {
      canvas = document.createElement('canvas');
      const host = document.querySelector('[data-wasm-game], #runtime, main, #app, body') || document.body;
      if (host) host.appendChild(canvas);
    }
    canvas.id = 'canvas';
    // Match the native window before the game pthread takes canvas ownership.
    // The shell only sizes CSS; resizing HTMLCanvasElement after transfer throws.
    if (canvas.width !== 1280) canvas.width = 1280;
    if (canvas.height !== 720) canvas.height = 720;
    const runtime = document.querySelector('#runtime');
    if (runtime) runtime.hidden = false;
    return canvas;
  }

  function createNativeModule(context, onAbort, onPrepared) {
    return loadFactory().then(factory => factory({
      noInitialRun: true,
      // Emscripten forwards this handler from pthreads only when it is
      // present while the worker pool is created, before the factory resolves.
      onAbort,
      preRun: [module => onPrepared?.(module)],
      print: (text) => {
        const line = String(text);
        // Native startup can report one font line per mounted VGUI object;
        // keep the browser console usable for actual engine diagnostics.
        if (typeof console !== 'undefined' && !line.startsWith('Found font:')) console.log(line);
        if (context && context.log) context.log(line);
      },
      printErr: (text) => {
        const line = String(text);
        if (typeof console !== 'undefined' && !line.startsWith('Found font:')) console.error(line);
        if (context && context.log) context.log(line);
      },
      locateFile: (name) => assetUrl(name),
      canvas: ensureEngineCanvas()
    }));
  }

  function ownerPathUrl(rel) {
    return publicUrl(`/owner/${String(rel || '').replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/')}`);
  }

  function ensureParent(FS, filePath) {
    const slash = filePath.lastIndexOf('/');
    const directory = slash > 0 ? filePath.slice(0, slash) : '/';
    if (typeof FS.mkdirTree === 'function') {
      try { FS.mkdirTree(directory); } catch (_) {}
    }
  }

  function liveHeapU8(mod) {
    if (mod && typeof mod.updateMemoryViews === 'function') {
      try { mod.updateMemoryViews(); } catch (_) {}
    }
    if (mod && mod.HEAPU8 && mod.HEAPU8.buffer) return mod.HEAPU8;
    return null;
  }

  function ownerReadTarget(module, buffer, offset) {
    if (!Number.isSafeInteger(offset) || offset < 0 || !buffer || buffer.BYTES_PER_ELEMENT !== 1) {
      throw new Error(`invalid owner-file destination ${offset}`);
    }
    // Decide before synchronous HTTP I/O: a native memory growth during the
    // read may detach this view. FS.readFile also supplies independent JS
    // buffers, where offset zero is valid and must never address native memory.
    const heap = module.HEAPU8;
    const heapOffset = heap && buffer.buffer === heap.buffer ? buffer.byteOffset + offset : null;
    return { module, buffer, offset, heapOffset };
  }

  function writeOwnerRead(target, bytes) {
    if (!bytes || !bytes.length) return 0;
    const native = target.heapOffset !== null;
    const offset = native ? target.heapOffset : target.offset;
    if (native && offset < HEAP_GUARD_BYTES) {
      throw new Error(`refusing heap write of ${bytes.length} bytes at ${offset}`);
    }
    const destination = native ? liveHeapU8(target.module) : target.buffer;
    if (!destination || typeof destination.set !== 'function') {
      throw new Error('no writable destination for owner-file read');
    }
    if (offset + bytes.length > destination.length) {
      throw new Error(`owner-file write ${offset}+${bytes.length} exceeds ${destination.length}`);
    }
    destination.set(bytes, offset);
    return bytes.length;
  }

  function absoluteOwnerUrl(url) {
    if (typeof location === 'undefined') return url;
    try { return new URL(url, location.href).href; } catch (_) { return url; }
  }

  function bytesFromBinaryString(text) {
    const out = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i += 1) out[i] = text.charCodeAt(i) & 0xff;
    return out;
  }

  function checkedOwnerBytes(bytes, expected, url) {
    if (bytes.length !== expected) {
      throw new Error(`Owner-file byte count mismatch for ${url}: expected ${expected}, received ${bytes.length}.`);
    }
    return bytes;
  }

  function syncFetchFile(url, size) {
    const bytes = new Uint8Array(size);
    for (let start = 0; start < size; start += RANGE_CHUNK_BYTES) {
      const end = Math.min(start + RANGE_CHUNK_BYTES, size) - 1;
      bytes.set(syncFetchRange(url, start, end), start);
    }
    return bytes;
  }

  function syncFetchRange(url, start, end) {
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)
      || start < 0 || end < start || end - start >= RANGE_CHUNK_BYTES) {
      throw new Error(`Invalid owner-file range ${start}-${end}.`);
    }
    if (typeof XMLHttpRequest !== 'function') {
      throw new Error(`Cannot fetch ${url} bytes ${start}-${end} (no XMLHttpRequest).`);
    }
    // Binary over sync XHR is only possible via responseText, whose decode the
    // browser content-sniffs (some byte patterns come back UTF-16 = corrupt).
    // Request base64 (pure ASCII, always lossless) and decode locally.
    const sep = url.includes('?') ? '&' : '?';
    const xhr = new XMLHttpRequest();
    xhr.open('GET', `${absoluteOwnerUrl(url)}${sep}b64=1`, false);
    xhr.setRequestHeader('Range', `bytes=${start}-${end}`);
    if (xhr.overrideMimeType) xhr.overrideMimeType('text/plain; charset=us-ascii');
    xhr.send(null);
    if (xhr.status !== 206 && xhr.status !== 200) {
      throw new Error(`Downloading ${url} bytes ${start}-${end} failed with HTTP ${xhr.status}.`);
    }
    if (typeof atob !== 'function') throw new Error('Base64 decoding is required for owner-file reads.');
    const encoded = String(xhr.responseText || '').replace(/\s+/g, '');
    if (encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) {
      throw new Error(`Invalid base64 owner-file response for ${url}.`);
    }
    return checkedOwnerBytes(bytesFromBinaryString(atob(encoded)), end - start + 1, url);
  }

  async function asyncFetchRange(url, start, end) {
    const response = await fetch(absoluteOwnerUrl(url), {
      headers: { Range: `bytes=${start}-${end}` },
      credentials: 'same-origin',
      cache: 'force-cache'
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} fetching ${url} bytes ${start}-${end}.`);
    return checkedOwnerBytes(new Uint8Array(await response.arrayBuffer()), end - start + 1, url);
  }

  function createRangeLazyContents(url, size) {
    const chunks = [];
    const inflight = [];
    const chunkSize = RANGE_CHUNK_BYTES;
    return {
      url,
      length: size,
      byteLength: size,
      chunkSize,
      async prefetchChunk(index) {
        if (chunks[index]) return chunks[index];
        if (inflight[index]) return inflight[index];
        const from = index * chunkSize;
        if (from >= size) {
          chunks[index] = new Uint8Array(0);
          return chunks[index];
        }
        const to = Math.min(from + chunkSize, size) - 1;
        inflight[index] = asyncFetchRange(url, from, to).then(bytes => {
          chunks[index] = bytes;
          return bytes;
        }).finally(() => {
          inflight[index] = null;
        });
        return inflight[index];
      },
      ensureChunk(index) {
        if (chunks[index]) return chunks[index];
        const from = index * chunkSize;
        if (from >= size) return new Uint8Array(0);
        const to = Math.min(from + chunkSize, size) - 1;
        chunks[index] = syncFetchRange(url, from, to);
        return chunks[index];
      },
      subarray(start, end) {
        const from = Math.min(size, Math.max(0, start || 0));
        const to = Math.min(size, Math.max(from, end == null ? size : end));
        const out = new Uint8Array(Math.max(0, to - from));
        let written = 0;
        while (written < out.length) {
          const abs = from + written;
          const index = (abs / chunkSize) | 0;
          const chunk = this.ensureChunk(index);
          const offset = abs % chunkSize;
          const n = Math.min(chunk.length - offset, out.length - written);
          if (n <= 0) {
            throw new Error(`range-lazy read stalled for ${url} at chunk ${index}`);
          }
          out.set(chunk.subarray(offset, offset + n), written);
          written += n;
        }
        return out;
      }
    };
  }

  function mountLazyOwnerFile(module, dest, url, size, source) {
    const FS = module.FS;
    const parent = dest.slice(0, dest.lastIndexOf('/')) || '/game';
    const name = dest.slice(dest.lastIndexOf('/') + 1);
    try { FS.unlink(dest); } catch (_) {}
    const node = FS.createFile(parent, name, { isDevice: false }, true, true);
    node.contents = source;
    node.usedBytes = size;
    // Native caches may chmod, truncate, append to or mmap an owner file.
    // Keep ordinary MEMFS sizes and materialize a private copy before any
    // operation that requires mutable contiguous storage. HTTP owner data is
    // never modified; untouched nodes continue to fetch only on demand.
    function materialize(keep = node.usedBytes) {
      if (!source) return;
      const bytes = keep ? checkedOwnerBytes(source.subarray(0, keep), keep, url) : new Uint8Array(0);
      node.contents = bytes;
      node.usedBytes = keep;
      source = null;
      lazyByPath.delete(dest);
    }
    const nodeOps = Object.assign({}, node.node_ops);
    const setattr = nodeOps.setattr;
    if (typeof setattr === 'function') {
      nodeOps.setattr = function ownerSetattr(target, attr) {
        if (attr.size !== undefined && attr.size !== target.usedBytes) {
          materialize(Math.min(target.usedBytes, attr.size));
        }
        return setattr(target, attr);
      };
    }
    node.node_ops = nodeOps;
    const ops = Object.assign({}, node.stream_ops);
    ops.read = function ownerRead(stream, buffer, offset, length, position) {
      if (position < 0 || length <= 0 || position >= node.usedBytes) return 0;
      const target = ownerReadTarget(module, buffer, offset);
      const end = Math.min(position + length, node.usedBytes);
      return writeOwnerRead(target, node.contents.subarray(position, end));
    };
    const write = ops.write;
    if (typeof write === 'function') {
      ops.write = function ownerWrite(stream, buffer, offset, length, position, canOwn) {
        if (!length) return 0;
        if (source) {
          // Snapshot native source bytes before synchronous I/O can invalidate
          // a heap view, then let MEMFS perform its normal write semantics.
          buffer = new Uint8Array(buffer.subarray(offset, offset + length));
          offset = 0;
          materialize();
        }
        return write(stream, buffer, offset, length, position, canOwn);
      };
    }
    for (const name of ['allocate', 'mmap', 'msync']) {
      const operation = ops[name];
      if (typeof operation !== 'function') continue;
      ops[name] = function ownerStorageOperation(...args) {
        materialize();
        return operation(...args);
      };
    }
    node.stream_ops = ops;
    return node;
  }

  function mountRangeLazyFile(module, dest, url, size) {
    const lazy = createRangeLazyContents(url, size);
    const node = mountLazyOwnerFile(module, dest, url, size, lazy);
    lazyByPath.set(dest, lazy);
    return node;
  }

  function mountLazyWholeFile(module, dest, url, size) {
    let cached = null;
    return mountLazyOwnerFile(module, dest, url, size, {
      length: size,
      subarray(start, end) {
        if (!cached) cached = syncFetchFile(url, size);
        return cached.subarray(start, end);
      }
    });
  }

  function writeOwnerBytes(FS, dest, bytes) {
    const parent = dest.slice(0, dest.lastIndexOf('/')) || '/game';
    const name = dest.slice(dest.lastIndexOf('/') + 1);
    if (typeof FS.createDataFile === 'function') {
      try { FS.unlink(dest); } catch (_) {}
      FS.createDataFile(parent, name, bytes, true, false, true);
    } else if (typeof FS.writeFile === 'function') {
      FS.writeFile(dest, bytes);
    } else {
      throw new Error('Emscripten FS cannot write owner data.');
    }
  }

  function blockedOwnerRel(rel) {
    const base = String(rel || '').split('/').pop() || '';
    return /glshaders\.cfg$/i.test(base) || /\.(dll|exe|so|dylib|asi)(?:$|[_-]\d+$)/i.test(base);
  }

  async function mountOwnerFilesFromHttp(module, onProgress, variant) {
    const FS = module && module.FS;
    if (!FS) throw new Error('An Emscripten FS instance is required to mount owner data.');
    if (typeof FS.mkdirTree === 'function') FS.mkdirTree('/game');
    const rangeOk = typeof XMLHttpRequest === 'function' && typeof FS.createFile === 'function';
    if (!rangeOk) throw new Error('This browser/runtime cannot mount the required owner files.');

    const index = await fetch(publicUrl('/owner-index'), { cache: 'no-store', credentials: 'same-origin' }).then((response) => {
      if (!response.ok) throw new Error(`Owner index failed with HTTP ${response.status}.`);
      return response.json();
    });
    if (!index || typeof index !== 'object' || !Array.isArray(index.files)) {
      throw new Error('Owner index has an invalid schema.');
    }
    if (index.schema !== 1 || !KNOWN_OWNER_RECIPES.includes(index.recipe)) {
      throw new Error('Owner index is not a pinned source-wasm recipe.');
    }
    const files = index.files;
    const total = files.length;
    const exactPaths = new Set(files.map(row => String(Array.isArray(row) ? row[0] : (row.path || '')).replace(/^\/+/, '')));
    const mountedPaths = new Set();
    for (let i = 0; i < files.length; i += 1) {
      const row = files[i];
      const relative = String(Array.isArray(row) ? row[0] : (row.path || '')).replace(/^\/+/, '');
      if (!relative || blockedOwnerRel(relative)) continue;
      const folded = relative.toLowerCase();
      // Saves belong to this browser session. Never import another install's
      // saves through the writable-directory symlink.
      if (folded.startsWith(`${variant}/save/`)) continue;
      const writableConfig = folded.startsWith(`${variant}/cfg/`);
      const size = Number(Array.isArray(row) ? row[1] : row.size);
      if (!Number.isSafeInteger(size) || size < 0) throw new Error(`Owner index has an invalid size for ${relative}.`);
      if (onProgress && (i % 256 === 0 || i + 1 === total)) {
        onProgress({ index: i, total, key: relative, url: ownerPathUrl(relative) });
      }
      // Localization tables are UTF-16 text files read synchronously by the
      // native VGUI loader during menu construction. Keep these small tables
      // in the eager set so the browser filesystem presents the same complete
      // file to AddFile that native code expects (rather than a lazy/ranged
      // placeholder during the first menu frame).
      const eager = writableConfig || /gameinfo\.txt$|steam\.inf$|\.ttf$|\/resource\/(?:gameui|valve|hl2|portal|platform|vgui)_[^/]+\.txt$/i.test(relative);
      let eagerBytes = null;
      const paths = folded !== relative && !exactPaths.has(folded)
        ? [relative, folded]
        : [relative];
      for (const mountedRelative of paths) {
        if (mountedPaths.has(mountedRelative)) continue;
        mountedPaths.add(mountedRelative);
        const dest = `/game/${mountedRelative}`;
        const url = ownerPathUrl(relative);
        ensureParent(FS, dest);
        // Restored cfg wins, including intentionally empty files. New defaults
        // must be ordinary writable MEMFS/IDBFS bytes, never lazy owner nodes:
        // IDBFS serializes node.contents directly.
        if (writableConfig && FS.analyzePath(dest).exists) continue;
        if (eager) {
          if (!eagerBytes) {
            const response = await fetch(url, { cache: 'no-store', credentials: 'same-origin' });
            if (!response.ok) throw new Error(`Downloading ${relative} failed with HTTP ${response.status}.`);
            eagerBytes = checkedOwnerBytes(new Uint8Array(await response.arrayBuffer()), size, url);
          }
          if (writableConfig) FS.writeFile(dest, eagerBytes);
          else writeOwnerBytes(FS, dest, eagerBytes);
          continue;
        }
        if (size >= LAZY_MIN_BYTES) mountRangeLazyFile(module, dest, url, size);
        else mountLazyWholeFile(module, dest, url, size);
      }
    }
    return { root: '/game', mode: 'http-index', files: total };
  }

  function filePolicies(value) {
    return value.files.map(file => ({ ...file, mountName: file.path }));
  }

  function threadedSideRuntime(module) {
    return module && module.sourceWasmRuntime === 'pthread-side-module-v1';
  }

  function watchWorkerFailures(module, onFailure) {
    const pool = threadedSideRuntime(module) && module.PThread;
    if (!pool) return () => {};
    let active = true;
    const workers = new Map(), methods = [];
    function observe(worker) {
      if (!active || !worker || workers.has(worker) || typeof worker.addEventListener !== 'function') return;
      const listener = event => {
        if (active) onFailure(`Source worker failed: ${event.message || event.error?.message || 'Uncaught worker error'}`);
      };
      worker.addEventListener('error', listener);
      workers.set(worker, listener);
    }
    function observePool() {
      for (const worker of [...(pool.unusedWorkers || []), ...(pool.runningWorkers || []), ...Object.values(pool.pthreads || {})]) observe(worker);
    }
    // Keep SDK message/error handlers intact. The prepared pool and workers
    // allocated later need the same independent browser ErrorEvent listener.
    for (const name of ['allocateUnusedWorker', 'loadWasmModuleToWorker']) {
      const original = pool[name];
      if (typeof original !== 'function') continue;
      const wrapper = function (...args) {
        if (name === 'loadWasmModuleToWorker') observe(args[0]);
        const result = original.apply(this, args);
        observePool();
        return result;
      };
      pool[name] = wrapper;
      methods.push({ name, original, wrapper });
    }
    observePool();
    return () => {
      active = false;
      for (const [worker, listener] of workers) worker.removeEventListener('error', listener);
      workers.clear();
      for (const { name, original, wrapper } of methods) if (pool[name] === wrapper) pool[name] = original;
    };
  }

  function sharedLockHeap(module) {
    const heap = module.HEAP32;
    if (!heap || Object.prototype.toString.call(heap) !== '[object Int32Array]'
      || Object.prototype.toString.call(heap.buffer) !== '[object SharedArrayBuffer]'
      || typeof Atomics === 'undefined' || typeof Atomics.store !== 'function' || typeof Atomics.notify !== 'function') {
      throw new Error('Threaded Source runtime requires a shared Int32 heap and atomic notifications.');
    }
    return heap;
  }

  function installWorkerBridge(module, context) {
    if (!threadedSideRuntime(module)) return;
    const bytes = 32 + 16 * 512;
    const pending = new Map();
    let base = null, observedSequence = null, saves = null;
    const bridge = {
      active: true, state: 'loading', captureIntent: false,
      enqueue(type, text) {
        if (!bridge.active || base === null || ![1, 2].includes(type)) return false;
        const payload = new TextEncoder().encode(String(text));
        if (!payload.length || payload.length >= 504 || payload.includes(0)) return false;
        const heap = mailboxHeap();
        if (!heap) return false;
        const write = Atomics.load(heap, base + 4) >>> 0;
        const read = Atomics.load(heap, base + 5) >>> 0;
        if (((write - read) >>> 0) >= 16) return false;
        const slot = base + 8 + (write % 16) * 128;
        const output = new Uint8Array(heap.buffer, heap.byteOffset);
        output.set(payload, (slot + 2) * 4);
        heap[slot] = type;
        heap[slot + 1] = payload.length;
        const next = (write + 1) >>> 0;
        pending.set(next, type);
        // Publish only after the complete payload and header are visible.
        Atomics.store(heap, base + 4, next | 0);
        return true;
      },
      pause() {
        if (!bridge.active || base === null) return false;
        const heap = mailboxHeap();
        if (!heap) return false;
        Atomics.store(heap, base + 6, 1);
        return true;
      },
      destroy() { bridge.active = false; pending.clear(); base = null; saves?.destroy(); }
    };
    function mailboxHeap() {
      const heap = sharedLockHeap(module);
      if (base === null || base + bytes / 4 > heap.length) return null;
      return heap;
    }
    workerBridges.set(module, bridge);
    saves = createNativeSavePersistence(module, context, bridge);
    bridge.saves = saves;
    module.sourceWasmBridgeReady = (address, size, version) => {
      if (!bridge.active) return false;
      const heap = sharedLockHeap(module);
      if (base !== null || version !== 1 || size !== bytes || !Number.isSafeInteger(address)
          || address < HEAP_GUARD_BYTES || address % 4 || address + bytes > heap.byteLength) {
        context.log('[source-wasm] Invalid native command mailbox registration.');
        return false;
      }
      const offset = address / 4;
      if ((Atomics.load(heap, offset) >>> 0) !== 0x53574231 || Atomics.load(heap, offset + 1) !== 1
          || Atomics.load(heap, offset + 2) !== 16 || Atomics.load(heap, offset + 3) !== 512
          || Atomics.load(heap, offset + 4) !== Atomics.load(heap, offset + 5)) {
        context.log('[source-wasm] Unsupported native command mailbox layout.');
        return false;
      }
      base = offset;
      applyReadyPreferences(module, bridge.state);
      return true;
    };
    module.sourceWasmState = (sequence, state, intent) => {
      if (!bridge.active || base === null || !Number.isInteger(sequence) || sequence < 0 || sequence > 0xffffffff
          || ![1, 2, 3, 4, 6].includes(state) || ![0, 1].includes(intent) || (intent && state !== 3)) return false;
      if (observedSequence !== null) {
        const delta = (sequence - observedSequence) >>> 0;
        if (!delta || delta >= 0x80000000) return false;
      }
      observedSequence = sequence;
      bridge.state = STATE_CODES[state];
      bridge.captureIntent = intent === 1;
      engineState = bridge.state;
      captureIntent = bridge.captureIntent;
      if (state === 6) bridge.destroy();
      else applyReadyPreferences(module, bridge.state);
      context.setEngineState(bridge.state);
      return true;
    };
    module.sourceWasmCommandResult = (sequence, accepted) => {
      if (!bridge.active || !Number.isInteger(sequence) || !pending.has(sequence) || ![0, 1].includes(accepted)) return false;
      pending.delete(sequence);
      if (!accepted) context.log(`[source-wasm] Native command ${sequence} was rejected.`);
      // A full ring may have deferred newer preference values. Retry only
      // when an acknowledgement frees capacity, never spin on the UI thread.
      applyReadyPreferences(module, bridge.state);
      return true;
    };
  }

  function createNativeSavePersistence(module, context, bridge) {
    const records = new Map();
    let active = true, latest = null, committed = null, inFlight = false, deadlineTimer = 0;
    let state = 'idle', lastError = '', panel = null, label = null, retryButton = null;
    const timeoutMs = 60000;
    const newer = (a, b) => b === null || ((a - b) >>> 0) > 0 && ((a - b) >>> 0) < 0x80000000;
    const ready = record => record?.filename && record.core && (!record.thumbnail || record.image);
    function status() { return Object.freeze({ state, generation: latest, committedGeneration: committed, error: lastError }); }
    function render() {
      if (typeof document === 'undefined') return;
      const data = document.documentElement?.dataset;
      if (data) {
        data.sourceSaveState = state;
        data.sourceSaveGeneration = latest === null ? '' : String(latest);
        data.sourceSaveCommitted = committed === null ? '' : String(committed);
        data.sourceSaveError = lastError;
      }
      if (!panel && state !== 'idle' && typeof document.createElement === 'function') {
        const runtime = document.getElementById?.('runtime');
        if (runtime) {
          panel = document.createElement('div');
          panel.id = 'source-save-status';
          panel.setAttribute('role', 'status'); panel.setAttribute('aria-live', 'polite');
          Object.assign(panel.style, { position: 'fixed', right: '16px', bottom: '16px', zIndex: '20',
            color: '#fff', background: 'rgba(0,0,0,.85)', padding: '8px 12px', borderRadius: '4px', font: '14px sans-serif' });
          label = document.createElement('span');
          retryButton = document.createElement('button'); retryButton.type = 'button'; retryButton.textContent = 'Retry';
          retryButton.style.marginLeft = '12px'; retryButton.addEventListener('click', retry);
          panel.append(label, retryButton); runtime.appendChild(panel);
        }
      }
      if (panel) {
        label.textContent = state === 'saving' ? 'Saving…' : state === 'saved' ? 'Saved on this device' : state === 'error' ? 'Save failed' : '';
        retryButton.hidden = state !== 'error' || !active;
        panel.hidden = state === 'idle';
      }
    }
    function clearDeadline() {
      if (deadlineTimer && typeof clearTimeout === 'function') clearTimeout(deadlineTimer);
      deadlineTimer = 0;
    }
    function fail(error) {
      if (!active) return;
      clearDeadline(); state = 'error'; lastError = String(error?.message || error);
      context.log(`[source-wasm] Save persistence failed: ${lastError}`);
      render();
    }
    function armDeadline() {
      clearDeadline();
      const generation = latest;
      deadlineTimer = setTimeout(() => {
        deadlineTimer = 0;
        if (active && latest === generation && state === 'saving') fail(new Error('Save completion timed out.'));
      }, timeoutMs);
    }
    function validateNativeFile(record) {
      const filename = `/game/${context.variant}/${record.filename}`;
      const stat = module.FS.stat(filename);
      if ((stat.mode & 0o170000) !== 0o100000 || stat.size < 1) throw new Error('Native save file is missing or empty.');
      if (record.thumbnail) {
        const image = module.FS.stat(filename.replace(/\.sav$/i, '.tga'));
        if ((image.mode & 0o170000) !== 0o100000 || image.size < 1) throw new Error('Native save thumbnail is missing or empty.');
      }
    }
    function flush(force = false) {
      if (!active || inFlight || latest === committed && !force) return;
      const generation = latest, record = records.get(generation);
      if (!ready(record)) return;
      try {
        validateNativeFile(record);
        if (typeof context.persistence?.save !== 'function') throw new Error('Browser save storage is unavailable.');
      } catch (error) { fail(error); return; }
      inFlight = true; state = 'saving'; lastError = ''; armDeadline(); render();
      Promise.resolve().then(() => context.persistence.save()).then(results => {
        if (!active) return;
        if (results !== true && (!Array.isArray(results) || !results.length || results.some(value => value !== true))) {
          throw new Error('Browser save storage did not confirm the write.');
        }
        committed = generation;
        if (latest === generation) {
          clearDeadline(); state = 'saved'; lastError = ''; render();
        }
      }).catch(error => {
        if (active && latest === generation) fail(error);
      }).finally(() => {
        inFlight = false;
        if (active && latest !== generation) flush();
      });
    }
    function retry() {
      if (!active || state !== 'error') return false;
      state = 'saving'; lastError = ''; armDeadline(); render(); flush(true);
      return true;
    }
    module.sourceWasmSaveEvent = (generation, phase, thumbnail, filename) => {
      if (!active || !bridge.active || !Number.isInteger(generation) || generation <= 0 || generation > 0xffffffff
          || ![0, 1, 2].includes(phase)) return false;
      if (latest !== null && !newer(generation, latest) && generation !== latest && !records.has(generation)) return false;
      if (phase === 0 && (![0, 1].includes(thumbnail) || typeof filename !== 'string' || filename.length > 512
          || !/^save\/[^\\\x00-\x1f]+\.sav$/i.test(filename)
          || filename.split('/').some(part => !part || part === '.' || part === '..'))) return false;
      const record = records.get(generation) || {};
      if (phase === 0) {
        if (record.filename) return false;
        record.filename = filename; record.thumbnail = thumbnail === 1;
        if (newer(generation, latest)) {
          latest = generation; state = 'saving'; lastError = ''; armDeadline(); render();
        }
      } else if (phase === 1) record.core = true;
      else record.image = true;
      records.set(generation, record);
      while (records.size > 32) records.delete(records.keys().next().value);
      flush();
      return true;
    };
    // A startup retry creates a new controller. Remove the failed runtime's
    // status element and clear its diagnostic snapshot before accepting saves.
    if (typeof document !== 'undefined') document.getElementById?.('source-save-status')?.remove();
    render();
    return {
      status, retry,
      externalError(error) { if (latest !== null) fail(error); },
      destroy() {
        if (!active) return;
        active = false; clearDeadline(); records.clear();
        if (state === 'saving') { state = 'error'; lastError = 'Runtime stopped before save confirmation.'; }
        render();
        retryButton?.removeEventListener('click', retry);
      }
    };
  }

  function installMountedMapHandler(module, context) {
    if (!threadedSideRuntime(module)) return;
    sharedLockHeap(module);
    // The worker requests this before FindMap normalizes the map name. All
    // owner files have already been mounted; acknowledge that work without
    // starting another network read while the native thread waits for us.
    module.downloadMap = (lockIndex, mapName) => {
      const heap = sharedLockHeap(module);
      if (!Number.isSafeInteger(lockIndex) || lockIndex < 0 || lockIndex >= heap.length) {
        context.log(`[source-wasm] Invalid map handoff lock index: ${String(lockIndex)}`);
        return false;
      }
      try {
        const match = /^(?:maps\/)?([a-z0-9_]+)(?:\.bsp)?$/i.exec(String(mapName || ''));
        if (!match) {
          context.log('[source-wasm] Invalid map name in native map handoff.');
          return false;
        }
        const filename = `/game/${context.variant}/maps/${match[1].toLowerCase()}.bsp`;
        const FS = module.FS;
        if (!FS.analyzePath(filename).exists || (FS.stat(filename).mode & 0o170000) !== 0o100000) {
          context.log(`[source-wasm] Requested map is not mounted: ${filename}`);
          return false;
        }
        return true;
      } catch (error) {
        context.log(`[source-wasm] Map lookup failed: ${String(error && error.message || error)}`);
        return false;
      } finally {
        // Missing/invalid maps must also release the waiter: native FindMap
        // will report the absent map using its normal error path.
        Atomics.store(heap, lockIndex, 0);
        Atomics.notify(heap, lockIndex);
      }
    };
  }

  function engineArgs(variant, persistRoot, module) {
    const args = [
      '-game', variant,
      '-insecure',
      '-multirun',
      '-windowed',
      '-noborder',
      '-w', '1280',
      '-h', '720',
      '-novid',
      '-nojoy',
      '-noasync',
      '-nosound',
      '-nolog',
      '-NoQueuedPacketThread',
      '-basedir', '/game',
      '+sv_lan', '1',
      '+mat_hdr_level', '0',
      '+mat_antialias', '0',
      '+mat_vsync', '0',
      '+fps_max', '0',
      '+mem_max_heapsize', '1536',
      '+mem_min_heapsize', '256',
      '+fs_homepath', persistRoot || `/save/${variant}`
    ];
    if (typeof location !== 'undefined' && new URL(location.href).searchParams.get('autostart') === '1') {
      args.push('-source-wasm-autostart');
    }
    return threadedSideRuntime(module)
      ? args.filter(value => !['-nosound', '-noasync', '-NoQueuedPacketThread'].includes(value))
      : args;
  }

  function linkWritePaths(FS, persistRoot, variant) {
    if (!FS) return;
    const gameDir = `/game/${variant === 'hl2' ? 'hl2' : variant}`;
    if (typeof FS.mkdirTree === 'function') {
      FS.mkdirTree(persistRoot);
      FS.mkdirTree(`${persistRoot}/cfg`);
      FS.mkdirTree(`${persistRoot}/save`);
      FS.mkdirTree(gameDir);
    }
    if (typeof FS.symlink === 'function') {
      try { FS.symlink(`${persistRoot}/cfg`, `${gameDir}/cfg`); } catch (_) {}
      try { FS.symlink(`${persistRoot}/save`, `${gameDir}/save`); } catch (_) {}
    }
  }

  function requestDiagnosticMap(module, context) {
    if (typeof location === 'undefined' || typeof setTimeout !== 'function') return;
    const requestedMap = new URL(location.href).searchParams.get('source-wasm-map');
    if (!requestedMap || !/^[a-z0-9_]+$/i.test(requestedMap)) return;
    const readyFn = nativeFn(module, 'source_wasm_mod_ready');
    const startFn = nativeFn(module, 'source_wasm_start_map');
    if (!readyFn || !startFn || typeof module.ccall !== 'function') {
      context.log('[source-wasm] This build lacks safe map-start diagnostics. Start a game from the native menu.');
      return;
    }
    const startedAt = Date.now();
    const tryStart = () => {
      if (!started || nativeModule !== module) return;
      let ready;
      try { ready = readyFn() === 1; } catch (error) {
        context.log(`[source-wasm] Map readiness failed: ${String(error && error.message || error)}`);
        return;
      }
      if (!ready) {
        if (Date.now() - startedAt < 120000) setTimeout(tryStart, 100);
        else context.log('[source-wasm] Map request cancelled: game modules did not become ready.');
        return;
      }
      try { module.ccall('source_wasm_start_map', null, ['string'], [requestedMap]); }
      catch (error) { context.log(`[source-wasm] Map start failed: ${String(error && error.message || error)}`); }
    };
    setTimeout(tryStart, 100);
  }

  global.WasmGameAdapter = Object.freeze({
    async init(context) {
      publicUrl = context.framework.publicUrl;
      if (typeof publicUrl !== 'function') throw new Error('Framework public URL support is required.');
      const root = await fetch(publicUrl('/wasm-game-data.json'), { cache: 'no-store' }).then(response => {
        if (!response.ok) throw new Error(`Game-data policy failed with HTTP ${response.status}.`);
        return response.json();
      });
      manifest = root.variants[context.variant];
      if (!manifest) throw new Error(`No game-data policy exists for ${context.variant}.`);
      ownerData = context.framework.createOwnerDataSet({
        namespace: manifest.namespace,
        version: manifest.version,
        files: filePolicies(manifest)
      });
      lastPreferences = context.preferences || {};
      context.log('[source-wasm] Adapter ready.');
    },

    async start(context) {
      if (started && nativeModule) {
        engineState = readNativeState(nativeModule);
        context.showRuntime(engineState);
        return;
      }
      if (starting) return starting;
      starting = (async () => {
        let module, persistenceMount, mainInvoked = false, activeAttempt = true, abortError = null;
        let observedModule = null, stopWatchingWorkers = () => {}, rejectRuntimeFailure;
        const runtimeFailure = new Promise((_resolve, reject) => { rejectRuntimeFailure = reject; });
        const failRuntime = reason => {
          if (!activeAttempt || abortError) return;
          abortError = new Error(`Native Source runtime aborted: ${String(reason)}`);
          stopWatchingWorkers();
          const bridge = module && workerBridges.get(module);
          if (bridge) { bridge.state = 'crashed'; bridge.captureIntent = false; bridge.destroy(); }
          engineState = 'crashed'; captureIntent = false;
          context.log(`[source-wasm] ${abortError.message}`);
          context.setEngineState('crashed');
          rejectRuntimeFailure(abortError);
        };
        const observeRuntime = prepared => {
          if (!activeAttempt || prepared === observedModule) return;
          stopWatchingWorkers();
          module = observedModule = prepared;
          stopWatchingWorkers = watchWorkerFailures(prepared, failRuntime);
        };
        try {
          engineState = 'loading';
          context.setEngineState('loading');
          context.showLoading();
          const loadingTitle = `Starting ${VARIANT_TITLES[context.variant] || 'Source'}…`;
          context.setLoading(loadingTitle, '', 8);

          if (context.dataClient && typeof context.dataClient.status === 'function') {
            const state = await context.dataClient.status();
            if (state && state.ready === false) {
              const error = new Error('The container still needs its required game data.');
              error.code = 'CONTAINER_DATA_REQUIRED';
              throw error;
            }
          }

          module = await Promise.race([createNativeModule(context, failRuntime, observeRuntime), runtimeFailure]);
          if (abortError) throw abortError;
          if (!module || typeof module.callMain !== 'function') throw new Error('Source engine entry point is missing.');
          observeRuntime(module);
          module.canvas = ensureEngineCanvas();
          const persistRoot = context.persistence ? context.persistence.root : `/save/${context.variant}`;
          if (context.persistence) {
            persistenceMount = await context.persistence.attach(module.FS, {
              root: persistRoot,
              allowUnsupported: !(module.FS && module.FS.filesystems && module.FS.filesystems.IDBFS)
            });
          }
          linkWritePaths(module.FS, persistRoot, context.variant);

          await mountOwnerFilesFromHttp(module, detail => {
            const progress = 40 + Math.round(((detail.index + 1) / Math.max(1, detail.total)) * 40);
            context.setLoading(loadingTitle, '', progress);
          }, context.variant);

          if (abortError) throw abortError;
          installMountedMapHandler(module, context);
          installWorkerBridge(module, context);
          if (module.FS && typeof module.FS.chdir === 'function') module.FS.chdir('/game');
          mainInvoked = true;
          try { module.callMain(engineArgs(context.variant, persistRoot, module)); }
          catch (error) {
            const message = String(error && error.message ? error.message : error);
            if (!/unwind|SimulateInfiniteLoop/i.test(message)) throw error;
          }

          if (abortError) throw abortError;
          engineState = readNativeState(module);
          nativeModule = module;
          started = true;
          persistAttached = !!context.persistence;
          applyReadyPreferences(module, engineState);
          context.showRuntime(engineState);
          context.log('[source-wasm] Native runtime started.');
          requestDiagnosticMap(module, context);
        } catch (error) {
          activeAttempt = false;
          stopWatchingWorkers();
          if (module) workerBridges.get(module)?.destroy();
          started = false;
          nativeModule = null;
          persistAttached = false;
          captureIntent = false;
          preferencesPending = true;
          lazyByPath.clear();
          debugNativeStateReported = false;
          if (mainInvoked && module && typeof module.pauseMainLoop === 'function') {
            try { module.pauseMainLoop(); } catch (_) {}
          }
          if (persistenceMount) {
            // Manager.destroy also unregisters the failed runtime's mount.
            // Keeping a destroyed mount makes subsequent save() return false
            // for that old FS even when the new runtime commits successfully.
            try {
              if (typeof context.persistence?.destroy === 'function') await context.persistence.destroy();
              else if (typeof persistenceMount.destroy === 'function') await persistenceMount.destroy();
            } catch (_) {}
          }
          engineState = 'crashed';
          context.setEngineState('crashed');
          throw error;
        }
      })().finally(() => { starting = null; });
      return starting;
    },

    readEngineState() {
      if (nativeModule) {
        engineState = readNativeState(nativeModule);
        applyReadyPreferences(nativeModule, engineState);
      }
      return engineState;
    },

    readCaptureIntent() {
      if (nativeModule) captureIntent = readNativeCaptureIntent(nativeModule);
      return !!captureIntent;
    },

    captureLost() {
      if (nativeModule) nativePause(nativeModule);
    },

    inputCaptureChanged(captured) {
      if (threadedSideRuntime(nativeModule)) return;
      if (!captured && nativeFn(nativeModule, 'source_wasm_set_capture_intent') && typeof nativeModule.ccall === 'function') {
        try { nativeModule.ccall('source_wasm_set_capture_intent', null, ['number'], [0]); } catch (_) {}
      }
    },

    resize() {
      // Native rendering is intentionally fixed at the manifest's 1280x720
      // surface; the framework owns CSS sizing and aspect-ratio letterboxing.
    },

    pointerMove(detail) {
      lastPointer = { x: detail.x, y: detail.y, captured: !!detail.captured };
      if (threadedSideRuntime(nativeModule)) return;
      if (!nativeFn(nativeModule, 'source_wasm_pointer') || typeof nativeModule.ccall !== 'function') return;
      try {
        nativeModule.ccall('source_wasm_pointer', null, ['number', 'number', 'number'], [
          detail.x, detail.y, detail.captured ? 1 : 0
        ]);
      } catch (_) {}
    },

    pointerButton(detail) {
      lastPointer = { x: detail.x, y: detail.y, captured: !!detail.captured };
      if (threadedSideRuntime(nativeModule)) return;
      if (!nativeFn(nativeModule, 'source_wasm_pointer_button') || typeof nativeModule.ccall !== 'function') return;
      try {
        nativeModule.ccall('source_wasm_pointer_button', null, ['number', 'number', 'number', 'number'], [
          detail.x, detail.y, detail.button || 0, detail.pressed ? 1 : 0
        ]);
      } catch (_) {}
    },

    execClientCmd(cmd) {
      if (threadedSideRuntime(nativeModule)) return !!cmd && (workerBridges.get(nativeModule)?.enqueue(1, String(cmd)) || false);
      if (!nativeFn(nativeModule, 'source_wasm_client_cmd') || typeof nativeModule.ccall !== 'function' || !cmd) return false;
      try {
        nativeModule.ccall('source_wasm_client_cmd', null, ['string'], [String(cmd)]);
        return true;
      } catch (_) {
        return false;
      }
    },

    preferencesChanged(values) {
      lastPreferences = values || {};
      preferencesPending = true;
      if (!nativeModule) return;
      applyReadyPreferences(nativeModule, readNativeState(nativeModule));
    },

    persistenceChanged(detail) {
      if (detail?.lastError) workerBridges.get(nativeModule)?.saves.externalError(detail.lastError);
    },

    persistenceStatus() {
      return workerBridges.get(nativeModule)?.saves.status() || null;
    },

    retryPersistence() {
      return workerBridges.get(nativeModule)?.saves.retry() || false;
    },

    persistAttached() {
      return persistAttached;
    },

    sanitizePlayerName
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
