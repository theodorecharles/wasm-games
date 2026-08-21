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
  let nativeModule = null;
  let persistAttached = false;
  let ownerData = null;
  let manifest = null;
  let lastPreferences = null;
  let lastPointer = { x: 0, y: 0, captured: false };
  let boundNativeModule = null;
  let debugNativeStateReported = false;
  const lazyByPath = new Map();

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
    if (typeof mod.cwrap === 'function') {
      try { return mod.cwrap(name, 'number', []); } catch (_) { return null; }
    }
    return null;
  }

  function readNativeState(mod) {
    const fn = nativeFn(mod, 'source_wasm_read_engine_state');
    if (!fn) return engineState === 'launcher' ? 'loading' : engineState;
    const raw = fn();
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.dataset.debugNativeState = String(raw);
      const phaseFn = nativeFn(mod, 'source_wasm_read_map_phase');
      if (phaseFn) {
        document.documentElement.dataset.debugNativeMapPhase = String(phaseFn());
      } else if (mod && typeof mod.ccall === 'function') {
        try {
          document.documentElement.dataset.debugNativeMapPhase = String(
            mod.ccall('source_wasm_read_map_phase', 'number', [], [])
          );
        } catch (error) {
          document.documentElement.dataset.debugNativeMapPhase = `error:${String(error && error.message ? error.message : error)}`;
        }
      }
      if (mod && typeof mod.ccall === 'function') {
        try {
          const traceCount = mod.ccall('source_wasm_read_map_phase_history_count', 'number', [], []);
          const trace = [];
          const first = Math.max(0, traceCount - 32);
          for (let i = first; i < traceCount; i += 1) {
            trace.push(mod.ccall('source_wasm_read_map_phase_history', 'number', ['number'], [i]));
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
    const fn = nativeFn(mod, 'source_wasm_read_capture_intent');
    if (!fn) return false;
    return !!fn();
  }

  function nativePause(mod) {
    const fn = nativeFn(mod, 'source_wasm_pause');
    if (fn) fn();
  }

  function applyIdentity(mod, values) {
    const name = sanitizePlayerName(values && values.playerName);
    if (mod && typeof mod.ccall === 'function') {
      try { mod.ccall('source_wasm_set_player_name', null, ['string'], [name]); } catch (_) {}
    }
    return name;
  }

  function applyGraphics(mod, values) {
    const profile = values && values.profile && PROFILE_CVARS[values.profile]
      ? values.profile
      : 'default';
    if (mod && typeof mod.ccall === 'function') {
      for (const [name, value] of Object.entries(PROFILE_CVARS[profile])) {
        try { mod.ccall('source_wasm_set_cvar', null, ['string', 'string'], [name, value]); } catch (_) {}
      }
    }
    return profile;
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
    if (typeof location === 'undefined') return `/${name}`;
    const key = new URL(location.href).searchParams.get('cb');
    return key ? `/${name}?cb=${encodeURIComponent(key)}` : `/${name}`;
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
    if (!canvas.width) canvas.width = 1280;
    if (!canvas.height) canvas.height = 720;
    const runtime = document.querySelector('#runtime');
    if (runtime) runtime.hidden = false;
    return canvas;
  }

  function createNativeModule(context) {
    return loadFactory().then(factory => factory({
      noInitialRun: true,
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
    return `/owner/${String(rel || '').replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/')}`;
  }

  function ensureParent(FS, filePath) {
    const slash = filePath.lastIndexOf('/');
    const directory = slash > 0 ? filePath.slice(0, slash) : '/';
    if (typeof FS.mkdirTree === 'function') {
      try { FS.mkdirTree(directory); } catch (_) {}
    }
  }

  function liveHeapU8(fallback) {
    const mod = boundNativeModule;
    if (mod && typeof mod.updateMemoryViews === 'function') {
      try { mod.updateMemoryViews(); } catch (_) {}
    }
    if (mod && mod.HEAPU8 && mod.HEAPU8.buffer) return mod.HEAPU8;
    if (fallback && fallback.buffer) {
      return fallback.BYTES_PER_ELEMENT === 1 ? fallback : new Uint8Array(fallback.buffer);
    }
    return fallback;
  }

  function writeBytesToHeap(buffer, offset, bytes) {
    if (!bytes || !bytes.length) return 0;
    if (typeof offset !== 'number' || !Number.isFinite(offset) || offset < 0) {
      throw new Error(`invalid heap dest ${offset}`);
    }
    if (offset < HEAP_GUARD_BYTES) {
      throw new Error(`refusing heap write of ${bytes.length} bytes at ${offset}`);
    }
    const heap = liveHeapU8(buffer);
    if (!heap || typeof heap.set !== 'function') {
      throw new Error('no live HEAPU8 for owner-file read');
    }
    if (offset + bytes.length > heap.length) {
      throw new Error(`heap write ${offset}+${bytes.length} exceeds ${heap.length}`);
    }
    heap.set(bytes, offset);
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

  function syncFetchFile(url) {
    if (typeof XMLHttpRequest !== 'function') {
      throw new Error(`Cannot fetch ${url} (no XMLHttpRequest).`);
    }
    const xhr = new XMLHttpRequest();
    xhr.open('GET', absoluteOwnerUrl(url), false);
    if (xhr.overrideMimeType) xhr.overrideMimeType('text/plain; charset=x-user-defined');
    xhr.send(null);
    if (xhr.status !== 200 && xhr.status !== 206) {
      throw new Error(`Downloading ${url} failed with HTTP ${xhr.status}.`);
    }
    return bytesFromBinaryString(String(xhr.responseText || ''));
  }

  function syncFetchRange(url, start, end) {
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
    const bin = typeof atob === 'function'
      ? atob(String(xhr.responseText || '').replace(/\s+/g, ''))
      : String(xhr.responseText || '');
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i) & 0xff;
    return out;
  }

  async function asyncFetchRange(url, start, end) {
    const response = await fetch(absoluteOwnerUrl(url), {
      headers: { Range: `bytes=${start}-${end}` },
      credentials: 'same-origin',
      cache: 'force-cache'
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} fetching ${url} bytes ${start}-${end}.`);
    return new Uint8Array(await response.arrayBuffer());
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
          inflight[index] = null;
          return bytes;
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
        const from = start || 0;
        const to = end == null ? size : end;
        const out = new Uint8Array(Math.max(0, to - from));
        let written = 0;
        while (written < out.length) {
          const abs = from + written;
          const index = (abs / chunkSize) | 0;
          const chunk = this.ensureChunk(index);
          const offset = abs % chunkSize;
          const n = Math.min(chunk.length - offset, out.length - written);
          if (n <= 0) {
            // A short/empty chunk would spin this loop forever and hard-block
            // the main thread; fail the read instead so the engine recovers.
            console.error(`source-wasm: range-lazy stall ${url} chunk=${index} offset=${offset} chunkLen=${chunk.length} want=${out.length - written}`);
            throw new Error(`range-lazy read stalled for ${url} at chunk ${index}`);
          }
          out.set(chunk.subarray(offset, offset + n), written);
          written += n;
        }
        return out;
      }
    };
  }

  function mountRangeLazyFile(module, dest, url, size) {
    const FS = module.FS;
    const parent = dest.slice(0, dest.lastIndexOf('/')) || '/game';
    const name = dest.slice(dest.lastIndexOf('/') + 1);
    try { FS.unlink(dest); } catch (_) {}
    const lazy = createRangeLazyContents(url, size);
    const node = FS.createFile(parent, name, { isDevice: false }, true, false);
    node.contents = lazy;
    Object.defineProperty(node, 'usedBytes', {
      configurable: true,
      get() { return lazy.length; }
    });
    const ops = Object.assign({}, node.stream_ops);
    ops.read = function rangeRead(stream, buffer, offset, length, position) {
      if (position < 0 || length <= 0 || position >= size) return 0;
      const end = Math.min(position + length, size);
      return writeBytesToHeap(buffer, offset, lazy.subarray(position, end));
    };
    node.stream_ops = ops;
    lazyByPath.set(dest, lazy);
    return node;
  }

  function mountLazyWholeFile(module, dest, url, size) {
    const FS = module.FS;
    const parent = dest.slice(0, dest.lastIndexOf('/')) || '/game';
    const name = dest.slice(dest.lastIndexOf('/') + 1);
    try { FS.unlink(dest); } catch (_) {}
    let cached = null;
    function bytes() {
      if (!cached) cached = syncFetchFile(url);
      return cached;
    }
    const node = FS.createFile(parent, name, { isDevice: false }, true, false);
    Object.defineProperty(node, 'usedBytes', {
      configurable: true,
      get() { return cached ? cached.length : size; }
    });
    const ops = Object.assign({}, node.stream_ops);
    ops.read = function wholeRead(stream, buffer, offset, length, position) {
      const all = bytes();
      if (position < 0 || length <= 0 || position >= all.length) return 0;
      return writeBytesToHeap(buffer, offset, all.subarray(position, Math.min(position + length, all.length)));
    };
    node.stream_ops = ops;
    return node;
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

  async function mountOwnerFilesFromHttp(module, onProgress) {
    const FS = module && module.FS;
    if (!FS) throw new Error('An Emscripten FS instance is required to mount owner data.');
    if (typeof FS.mkdirTree === 'function') FS.mkdirTree('/game');
    const rangeOk = typeof XMLHttpRequest === 'function' && typeof FS.createFile === 'function';
    if (!rangeOk) return { root: '/game', mode: 'http', files: 0 };

    const index = await fetch('/owner-index', { cache: 'no-store', credentials: 'same-origin' }).then((response) => {
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
      const eager = /gameinfo\.txt$|steam\.inf$|\.ttf$|\/resource\/(?:gameui|valve|hl2|portal|platform|vgui)_[^/]+\.txt$/i.test(relative);
      let eagerBytes = null;
      const folded = relative.toLowerCase();
      const paths = folded !== relative && !exactPaths.has(folded)
        ? [relative, folded]
        : [relative];
      for (const mountedRelative of paths) {
        if (mountedPaths.has(mountedRelative)) continue;
        mountedPaths.add(mountedRelative);
        const dest = `/game/${mountedRelative}`;
        const url = ownerPathUrl(relative);
        ensureParent(FS, dest);
        if (eager) {
          if (!eagerBytes) {
            const response = await fetch(url, { cache: 'no-store', credentials: 'same-origin' });
            if (!response.ok) throw new Error(`Downloading ${relative} failed with HTTP ${response.status}.`);
            eagerBytes = new Uint8Array(await response.arrayBuffer());
          }
          writeOwnerBytes(FS, dest, eagerBytes);
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

  function engineArgs(variant, persistRoot) {
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
    return args;
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

  global.WasmGameAdapter = Object.freeze({
    async init(context) {
      const root = await fetch('/wasm-game-data.json', { cache: 'no-store' }).then(response => {
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
      started = true;
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

      const module = await createNativeModule(context);
      nativeModule = module;
      boundNativeModule = module;
      module.canvas = ensureEngineCanvas();

      if (context.persistence) {
        await context.persistence.attach(module.FS, {
          root: context.persistence.root,
          allowUnsupported: !(module.FS && module.FS.filesystems && module.FS.filesystems.IDBFS)
        });
        persistAttached = true;
        linkWritePaths(module.FS, context.persistence.root, context.variant);
      }

      await mountOwnerFilesFromHttp(module, detail => {
        const progress = 40 + Math.round(((detail.index + 1) / Math.max(1, detail.total)) * 40);
        context.setLoading(loadingTitle, '', progress);
      });

      applyIdentity(module, lastPreferences || context.preferences || {});
      applyGraphics(module, lastPreferences || context.preferences || {});

      const persistRoot = context.persistence ? context.persistence.root : `/save/${context.variant}`;
      if (module.FS && typeof module.FS.chdir === 'function') {
        try { module.FS.chdir('/game'); } catch (_) {}
      }
      if (typeof module.callMain === 'function') {
        try {
          module.callMain(engineArgs(context.variant, persistRoot));
        } catch (error) {
          const message = String(error && error.message ? error.message : error);
          if (!/unwind|SimulateInfiniteLoop/i.test(message)) throw error;
        }
      }

      // Explicit headed-test hook: skip fragile native menu coordinates while
      // retaining the exact same native Host_NewGame path as the dialog.
      if (typeof location !== 'undefined' && typeof module.ccall === 'function') {
        const requestedMap = new URL(location.href).searchParams.get('source-wasm-map');
        if (requestedMap && /^[a-z0-9_]+$/i.test(requestedMap) && typeof setTimeout === 'function') {
          // The engine keeps booting (loading the mod DLLs) across main-loop
          // frames after callMain returns, and the GameUI menu can be up
          // before the server interface exists.  Firing start_map on a fixed
          // timer (or on the menu state) races that boot and can call
          // Host_NewGame with a null serverGameDLL; wait until the mod DLLs
          // report ready before requesting the map.
          const readyFn = nativeFn(module, 'source_wasm_mod_ready');
          const startedAt = Date.now();
          const tryStart = () => {
            let ready = !readyFn;
            if (readyFn) {
              try { ready = readyFn() === 1; } catch (_) { ready = false; }
            }
            if (!ready) {
              if (Date.now() - startedAt < 120000) {
                setTimeout(tryStart, 100);
                return;
              }
            }
            try {
              module.ccall('source_wasm_start_map', null, ['string'], [requestedMap]);
            } catch (error) {
              if (typeof console !== 'undefined') console.error(error);
            }
          };
          setTimeout(tryStart, 100);
        }
      }

      engineState = readNativeState(module);
      if (engineState === 'gameplay' && !nativeFn(module, 'source_wasm_read_engine_state')) {
        engineState = 'loading';
      }
      context.showRuntime(engineState);
      context.log('[source-wasm] Native runtime started.');
    },

    readEngineState() {
      if (nativeModule) engineState = readNativeState(nativeModule);
      return engineState;
    },

    readCaptureIntent() {
      if (nativeModule) captureIntent = readNativeCaptureIntent(nativeModule);
      return !!captureIntent;
    },

    captureLost() {
      if (nativeModule) nativePause(nativeModule);
      engineState = 'paused';
    },

    inputCaptureChanged(captured) {
      if (!captured && nativeModule && typeof nativeModule.ccall === 'function') {
        try { nativeModule.ccall('source_wasm_set_capture_intent', null, ['number'], [0]); } catch (_) {}
      }
    },

    resize() {
      // Native rendering is intentionally fixed at the manifest's 1280x720
      // surface; the framework owns CSS sizing and aspect-ratio letterboxing.
    },

    pointerMove(detail) {
      lastPointer = { x: detail.x, y: detail.y, captured: !!detail.captured };
      if (!nativeModule || typeof nativeModule.ccall !== 'function') return;
      try {
        nativeModule.ccall('source_wasm_pointer', null, ['number', 'number', 'number'], [
          detail.x, detail.y, detail.captured ? 1 : 0
        ]);
      } catch (_) {}
    },

    pointerButton(detail) {
      lastPointer = { x: detail.x, y: detail.y, captured: !!detail.captured };
      if (!nativeModule || typeof nativeModule.ccall !== 'function') return;
      try {
        nativeModule.ccall('source_wasm_pointer_button', null, ['number', 'number', 'number', 'number'], [
          detail.x, detail.y, detail.button || 0, detail.pressed ? 1 : 0
        ]);
      } catch (_) {}
    },

    execClientCmd(cmd) {
      if (!nativeModule || typeof nativeModule.ccall !== 'function' || !cmd) return false;
      try {
        nativeModule.ccall('source_wasm_client_cmd', null, ['string'], [String(cmd)]);
        return true;
      } catch (_) {
        return false;
      }
    },

    preferencesChanged(values) {
      lastPreferences = values || {};
      if (!nativeModule) return;
      applyIdentity(nativeModule, lastPreferences);
      applyGraphics(nativeModule, lastPreferences);
    },

    persistAttached() {
      return persistAttached;
    },

    sanitizePlayerName
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
