(function () {
  'use strict';

  const ENGINES = Object.freeze({
    'rtcw-sp': Object.freeze({
      label: 'single-player', script: '/iowolfsp.js', wasm: '/iowolfsp.wasm',
      qvmRoot: '/qvm/sp', qvms: Object.freeze(['cgame.sp.qvm', 'qagame.sp.qvm', 'ui.sp.qvm'])
    }),
    'rtcw-mp': Object.freeze({
      label: 'multiplayer', script: '/iowolfmp.js', wasm: '/iowolfmp.wasm',
      qvmRoot: '/qvm/mp', qvms: Object.freeze(['cgame.mp.qvm', 'qagame.mp.qvm', 'ui.mp.qvm'])
    })
  });
  const STATE_NAMES = Object.freeze(['menu', 'gameplay', 'paused', 'debrief', 'loading']);
  const QUALITY_LEVELS = Object.freeze({ performance: 0, balanced: 1, high: 2 });
  const MENU_PAKS = Object.freeze({
    'rtcw-sp': '/menus/sp_wasm.pk3',
    'rtcw-mp': '/menus/mp_wasm.pk3'
  });
  let context;
  let engineSpec;
  let ownerDataSet;
  let module;
  let started = false;
  let reportedState = 'launcher';
  let stateTimer = 0;
  let lastConfigurationWrite = 0;
  let lastEscapeAt = 0;
  let qualityController;
  let lastResize = Object.freeze({ width: 1024, height: 768 });
  let appliedDisplay = null;
  let wakeClient = null;
  let joinPending = false;
  let joinPromise = null;

  function cleanName(value) {
    return String(value || 'Player').replace(/[^A-Za-z0-9 _-]/g, '').trim().slice(0, 32) || 'Player';
  }

  function engineFunction(name) {
    const value = module?.[`_RTCW_Browser${name}`];
    return typeof value === 'function' ? value : null;
  }

  function rawNativeState() {
    const read = engineFunction('RuntimeState');
    if (!read) return started ? 'loading' : 'launcher';
    return STATE_NAMES[read()] || 'menu';
  }

  function nativeState() {
    const state = rawNativeState();
    if (joinPending && state === 'menu') return 'loading';
    if (joinPending && state !== 'menu' && state !== 'launcher') joinPending = false;
    return state;
  }

  function nativeCaptureIntent() {
    return joinPending || Boolean(engineFunction('CaptureIntent')?.());
  }

  function displayForState(state) {
    if (state === 'gameplay' || state === 'paused' || state === 'debrief') {
      return Object.freeze({ displayMode: 'dynamic', fit: 'fill' });
    }
    return Object.freeze({ displayMode: '4:3', fit: 'contain' });
  }

  function applyDisplayForState(state) {
    if (!context?.shell?.setDisplay) return;
    const next = displayForState(state);
    if (appliedDisplay && appliedDisplay.displayMode === next.displayMode && appliedDisplay.fit === next.fit) {
      return;
    }
    appliedDisplay = next;
    context.shell.setDisplay(next);
    if (context.elements?.canvas) {
      document.documentElement.dataset.rtcwDisplayMode = next.displayMode;
    }
  }

  function synchronizeState(event, capture) {
    if (!context) return nativeState();
    const state = nativeState();
    applyDisplayForState(state);
    const shouldCapture = Boolean(capture && nativeCaptureIntent() &&
      (state === 'loading' || state === 'gameplay'));
    if (state !== reportedState || shouldCapture) {
      reportedState = state;
      context.setEngineState(state, shouldCapture ? { capture: true, event } : undefined);
    }
    return state;
  }

  function profileArguments(values) {
    const level = QUALITY_LEVELS[values.qualityProfile] ?? QUALITY_LEVELS.balanced;
    return [
      '+set', 'r_picmip', String(2 - level),
      '+set', 'r_lodbias', String(2 - level),
      '+set', 'r_subdivisions', String(level === 2 ? 4 : (level === 1 ? 8 : 16)),
      '+set', 'r_dynamiclight', level > 0 ? '1' : '0'
    ];
  }

  function engineArguments(values) {
    return [
      '+set', 'fs_basepath', '/game',
      '+set', 'fs_homepath', context.persistence.root,
      '+set', 'fs_cdpath', '',
      '+set', 'fs_game', '',
      '+set', 'vm_cgame', '2',
      '+set', 'vm_game', '2',
      '+set', 'vm_ui', '2',
      '+set', 'r_fullscreen', '0',
      '+set', 'r_mode', '-1',
      '+set', 'r_customwidth', String(lastResize.width),
      '+set', 'r_customheight', String(lastResize.height),
      '+set', 'r_allowResize', '1',
      '+set', 'r_colorbits', '32',
      '+set', 'r_texturebits', '32',
      '+set', 'r_ext_multitexture', '0',
      '+set', 'r_ignoreFastPath', '1',
      '+set', 'r_lightmap', '0',
      '+set', 'r_greyscale', '0',
      '+set', 'r_textureMode', 'GL_LINEAR_MIPMAP_LINEAR',
      '+set', 'r_primitives', '2',
      '+set', 'r_norefresh', '0',
      '+set', 'r_skipBackEnd', '0',
      '+set', 'cg_norender', '0',
      '+set', 'in_joystick', '0',
      '+set', 'net_enabled', '1',
      '+set', 'net_socksEnabled', '0',
      '+set', 'com_maxfps', String(Math.max(20, Math.min(240, Number(values.targetFps) || 60))),
      '+set', 'com_introplayed', '1',
      '+set', 'name', cleanName(values.playerName),
      ...profileArguments(values),
      ...(context.variant === 'rtcw-sp' ? ['+set', 'model', 'bj2'] : ['+set', 'cl_motd', '0', '+set', 'net_port', '27951'])
    ];
  }

  function loadEngine() {
    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error('RTCW engine initialization timed out.')), 30000);
      globalThis.Module = {
        canvas: context.elements.canvas,
        noInitialRun: true,
        locateFile(path) {
          return path.endsWith('.wasm') ? engineSpec.wasm :
            new URL(path, new URL(engineSpec.script, location.href)).href;
        },
        print(value) { console.log('[RTCW WASM]', value); context.log(value); },
        printErr(value) { console.error('[RTCW WASM]', value); context.log(`ERROR: ${value}`); },
        setStatus(value) { if (value) context.setLoading('Starting Return to Castle Wolfenstein…'); },
        onAbort(reason) {
          window.clearTimeout(timeout);
          context.log(`RTCW stopped: ${reason}`);
          context.showRuntime('crashed');
          reject(new Error(`RTCW engine aborted: ${reason}`));
        },
        rtcwPersistenceChanged(immediate) {
          context.persistence.markDirty();
          if (immediate) {
            context.persistence.save().catch(error => context.log(`RTCW save flush failed: ${error.message || error}`));
          }
        },
        websocket: context.variant === 'rtcw-mp' ? {
          url: `${location.protocol === 'https:' ? 'wss://' : 'ws://'}${location.host}/ws`
        } : undefined,
        onRuntimeInitialized() {
          window.clearTimeout(timeout);
          resolve(globalThis.Module);
        }
      };
      const script = document.createElement('script');
      script.src = engineSpec.script;
      script.async = true;
      script.onerror = () => {
        window.clearTimeout(timeout);
        reject(new Error(`Could not load the RTCW ${engineSpec.label} engine.`));
      };
      document.body.appendChild(script);
    });
  }

  async function loadQvms() {
    return Promise.all(engineSpec.qvms.map(async name => {
      const response = await fetch(`${engineSpec.qvmRoot}/${name}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`The generated RTCW ${name} runtime is missing.`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length < 4 || bytes[0] !== 0x45 || bytes[1] !== 0x14 || bytes[2] !== 0x72 || bytes[3] !== 0x12) {
        throw new Error(`The generated RTCW ${name} runtime is invalid.`);
      }
      return Object.freeze({
        file: new File([bytes], name, { type: 'application/octet-stream' }),
        mountName: `vm/${name}`
      });
    }));
  }

  async function loadMenuPak() {
    const url = MENU_PAKS[context.variant];
    if (!url) return [];
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error('The RTCW browser menu pack is missing.');
    const bytes = await response.arrayBuffer();
    const name = url.slice(url.lastIndexOf('/') + 1);
    return [Object.freeze({
      file: new File([bytes], name, { type: 'application/octet-stream' }),
      mountName: name
    })];
  }

  function writeConfiguration(flush) {
    if (!started) return;
    engineFunction('WriteConfiguration')?.();
    context.persistence.markDirty();
    lastConfigurationWrite = performance.now();
    if (flush) {
      context.persistence.save().catch(error => context.log(`RTCW configuration flush failed: ${error.message || error}`));
    }
  }

  function setPlayerName(value) {
    const setName = engineFunction('SetPlayerName');
    if (!setName || typeof module?.stringToNewUTF8 !== 'function') return;
    const pointer = module.stringToNewUTF8(cleanName(value));
    try { setName(pointer); } finally { module._free(pointer); }
  }

  function nativeJoinServer(values) {
    const join = engineFunction('JoinServer');
    if (!join || typeof module?.stringToNewUTF8 !== 'function') {
      throw new Error('The RTCW multiplayer join seam is unavailable.');
    }
    const address = module.stringToNewUTF8('127.0.0.1:27960');
    const name = module.stringToNewUTF8(cleanName(values.playerName));
    try {
      if (!join(address, name)) throw new Error('RTCW rejected the managed server address.');
    } finally {
      module._free(name);
      module._free(address);
    }
  }

  function beginManagedJoin(event) {
    if (context.variant !== 'rtcw-mp' || !started) return Promise.resolve();
    if (joinPromise) return joinPromise;
    joinPending = true;
    engineFunction('ArmCaptureIntent')?.();
    context.showRuntime('loading');
    context.setEngineState('loading', { capture: true, event });
    document.documentElement.dataset.rtcwServerState = 'starting';
    context.log('Starting the RTCW multiplayer server…');
    joinPromise = wakeClient.ensureRunning({ variant: 'rtcw-mp', map: 'mp_depot' }).then(status => {
      document.documentElement.dataset.rtcwServerState = status.state || 'running';
      const values = context.preferences.values();
      setPlayerName(values.playerName);
      nativeJoinServer(values);
      context.log('Joining mp_depot…');
      return status;
    }).catch(error => {
      joinPending = false;
      engineFunction('CancelCaptureIntent')?.();
      document.documentElement.dataset.rtcwServerState = 'failed';
      context.log(`RTCW arena unavailable: ${error.message || error}`);
      context.showRuntime('menu');
      context.setEngineState('menu');
      throw error;
    }).finally(() => {
      joinPromise = null;
    });
    return joinPromise;
  }

  function applyPreferences(values) {
    if (!started) return;
    const level = QUALITY_LEVELS[values.qualityProfile] ?? QUALITY_LEVELS.balanced;
    engineFunction('ApplyPreferences')?.(level, Math.max(20, Math.min(240, Number(values.targetFps) || 60)));
    if (context.variant === 'rtcw-mp') setPlayerName(values.playerName);
    qualityController?.setEnabled(Boolean(values.dynamicQuality));
    qualityController?.setTargetFps(Number(values.targetFps) || 60);
  }

  function startQuality(values) {
    const ceiling = values.qualityProfile;
    const profiles = ceiling === 'high' ? ['high', 'balanced', 'performance'] :
      ceiling === 'balanced' ? ['balanced', 'performance'] : ['performance'];
    qualityController = context.framework.createQualityController({
      profiles,
      targetFps: Number(values.targetFps) || 60,
      enabled: Boolean(values.dynamicQuality),
      apply(name) { engineFunction('ApplyPreferences')?.(QUALITY_LEVELS[name] ?? 1, Number(context.preferences.values().targetFps) || 60); },
      onSample(detail) { document.documentElement.dataset.rtcwMeasuredFps = detail.fps.toFixed(1); }
    });
    qualityController.start();
  }

  function startMonitor() {
    window.clearInterval(stateTimer);
    stateTimer = window.setInterval(() => {
      if (!started) return;
      if (context.variant === 'rtcw-mp' && engineFunction('JoinRequested')?.()) {
        beginManagedJoin(null).catch(() => undefined);
      }
      if (performance.now() - lastConfigurationWrite >= 5000) writeConfiguration(false);
      synchronizeState(null, false);
      const width = engineFunction('RenderWidth')?.() || 0;
      const height = engineFunction('RenderHeight')?.() || 0;
      document.documentElement.dataset.rtcwRenderSize = `${width}x${height}`;
      document.documentElement.dataset.rtcwControlsMask = String(engineFunction('ControlsMask')?.() || 0);
      document.documentElement.dataset.rtcwNativeState = nativeState();
    }, 250);
  }

  globalThis.WasmGameAdapter = Object.freeze({
    async init(nextContext) {
      context = nextContext;
      engineSpec = ENGINES[context.variant];
      if (!engineSpec) throw new Error(`Unsupported RTCW variant: ${context.variant}.`);
      // Emscripten's packaged SDL2 backend uses this selector for its native
      // window, WebGL surface, events, and pointer-lock queries.
      context.elements.canvas.id = 'canvas';
      context.elements.canvas.addEventListener('contextmenu', event => event.preventDefault());
      context.elements.canvas.addEventListener('mousemove', event => {
        if (document.pointerLockElement !== context.elements.canvas) event.stopImmediatePropagation();
      }, true);
      const manifest = await fetch('/wasm-game-data.json', { cache: 'no-store' }).then(response => {
        if (!response.ok) throw new Error(`RTCW provisioning policy failed with HTTP ${response.status}.`);
        return response.json();
      });
      const policy = manifest.variants?.[context.variant];
      if (!policy) throw new Error(`RTCW provisioning policy has no ${context.variant} variant.`);
      ownerDataSet = context.framework.createOwnerDataSet({
        namespace: `${manifest.namespace}-${context.variant}`,
        version: manifest.version,
        files: policy.files.map(file => ({ ...file, mountName: file.name.toLowerCase() }))
      });
      applyDisplayForState('menu');
      if (context.variant === 'rtcw-mp') {
        wakeClient = context.framework.createWakeClient({
          statusUrl: '/status', wakeUrl: '/wake', timeout: 60000,
          onStatus(status) {
            document.documentElement.dataset.rtcwServerState = status?.state || 'unknown';
          }
        });
      }
      document.addEventListener('keydown', event => {
        if (!started) return;
        if (event.key === 'Escape') lastEscapeAt = performance.now();
        if (event.key === 'Enter' && nativeState() === 'menu') engineFunction('ArmCaptureIntent')?.();
      }, true);
      document.addEventListener('keyup', event => {
        if (!started || (event.key !== 'Enter' && event.key !== 'Escape')) return;
        queueMicrotask(() => synchronizeState(event, true));
      });
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') writeConfiguration(true);
      });
      window.addEventListener('pagehide', () => writeConfiguration(true));
    },

    async start() {
      if (started) return;
      void context.shell.resumeAudio();
      const values = context.preferences.values();
      context.setLoading('Preparing Return to Castle Wolfenstein…', '', 5);
      const ownerData = await context.dataClient.load(ownerDataSet, {
        onProgress(detail) {
          if (detail.phase === 'downloading') {
            const percent = detail.total ? Math.floor(detail.received * 100 / detail.total) : 0;
            context.setLoading('Preparing Return to Castle Wolfenstein…', `${percent}%`, Math.min(55, 5 + percent / 2));
          }
        }
      });
      context.setLoading('Starting Return to Castle Wolfenstein…', '', 60);
      module = await loadEngine();
      await context.persistence.attach(module.FS, { root: context.persistence.root });
      document.documentElement.dataset.rtcwPersistence = 'ready';
      const qvms = await loadQvms();
      const menuPak = await loadMenuPak();
      context.log(`Mounted RTCW menu pack ${menuPak.map(entry => entry.mountName).join(', ') || 'none'}.`);
      await context.framework.mountOwnerFiles(module.FS, [...ownerData.entries, ...qvms, ...menuPak], {
        root: '/game/main', preservePaths: true
      });
      if (context.elements.canvas.width !== lastResize.width) context.elements.canvas.width = lastResize.width;
      if (context.elements.canvas.height !== lastResize.height) context.elements.canvas.height = lastResize.height;
      try {
        module.callMain(engineArguments(values));
      } catch (error) {
        if (error !== 'unwind') throw error;
      }
      started = true;
      engineFunction('ConfigureControls')?.();
      applyPreferences(values);
      writeConfiguration(false);
      reportedState = nativeState();
      applyDisplayForState(reportedState);
      context.showRuntime(reportedState);
      context.shell.resize();
      context.setEngineState(reportedState);
      startQuality(values);
      startMonitor();
    },

    readEngineState() { return nativeState(); },
    readCaptureIntent() { return nativeCaptureIntent(); },
    resize(detail) {
      lastResize = Object.freeze({
        width: Math.max(2, Math.min(8192, Math.round(detail.cssWidth || detail.requestedWidth))),
        height: Math.max(2, Math.min(8192, Math.round(detail.cssHeight || detail.requestedHeight)))
      });
      document.documentElement.dataset.rtcwResizeRequested = `${lastResize.width}x${lastResize.height}`;
      document.documentElement.dataset.rtcwDisplayMode = appliedDisplay?.displayMode || '4:3';
      if (!started) {
        context.elements.canvas.width = lastResize.width;
        context.elements.canvas.height = lastResize.height;
        return;
      }
      engineFunction('Resize')?.(lastResize.width, lastResize.height);
      document.documentElement.dataset.rtcwRenderSize = `${engineFunction('RenderWidth')?.() || 0}x${engineFunction('RenderHeight')?.() || 0}`;
    },
    pointerMove(detail) {
      if (!started || detail.captured) return;
      engineFunction('PointerPosition')?.(detail.x, detail.y);
      document.documentElement.dataset.rtcwMenuPointer = `${Math.round(detail.x)}x${Math.round(detail.y)}`;
    },
    pointerButton(detail, event) {
      if (!started || detail.button !== 0 || !detail.pressed || nativeState() !== 'menu') return;
      if (context.variant === 'rtcw-mp') {
        if (!engineFunction('JoinTarget')?.()) return;
        return beginManagedJoin(event);
      }
      engineFunction('ArmCaptureIntent')?.();
      queueMicrotask(() => synchronizeState(event, true));
    },
    captureLost(_detail, nextContext) {
      if (!started) return;
      engineFunction('SetInputCaptured')?.(0);
      if (nativeState() === 'gameplay' && performance.now() - lastEscapeAt > 750) {
        engineFunction('OpenMenu')?.();
      }
      synchronizeState(null, false);
      nextContext?.setEngineState?.(nativeState());
    },
    inputCaptureChanged(captured) {
      engineFunction('SetInputCaptured')?.(captured ? 1 : 0);
      document.documentElement.dataset.rtcwPointerLocked = String(Boolean(captured));
    },
    preferencesChanged(values) { applyPreferences(values); },
    persistenceChanged(detail) {
      document.documentElement.dataset.rtcwPersistence = detail?.state || detail?.phase || 'ready';
    }
  });
})();
