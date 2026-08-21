(function () {
  'use strict';

  const PROFILE_CVARS = Object.freeze({
    high: Object.freeze({ r_picmip: '0', r_lodbias: '0', r_subdivisions: '4' }),
    balanced: Object.freeze({ r_picmip: '1', r_lodbias: '1', r_subdivisions: '8' }),
    performance: Object.freeze({ r_picmip: '2', r_lodbias: '2', r_subdivisions: '16' })
  });

  let context;
  let module;
  let dataSet;
  let ownerData;
  let ownerFilesMounted = false;
  let started = false;
  let nativeReady = false;
  let joining = false;
  let pointerSerial = 0;
  let captureGestureTarget = '';
  let eventSlots = [];
  let nextEventSlot = 0;
  let stateTimer = 0;
  const controllerHeld = new Map();
  let controllerAttack = false;
  let reportedEngineState = '';
  let resizeSerial = 0;
  const resizeEvents = [];
  const engineTransitions = [];
  let quality;
  let lastResize = Object.freeze({ width: 1280, height: 720 });

  function cleanName(value) {
    return String(value || 'Player').replace(/[;\n\r]/g, '').slice(0, 32) || 'Player';
  }

  function nativeString(value) {
    const bytes = new TextEncoder().encode(`${value}\0`);
    const pointer = module._malloc(bytes.length);
    globalThis.HEAPU8.set(bytes, pointer);
    return Object.freeze({ pointer, free: () => module._free(pointer) });
  }

  function setCvar(name, value) {
    if (!nativeReady) return;
    const key = nativeString(name);
    const text = nativeString(String(value));
    try { module._Cvar_Set(key.pointer, text.pointer); } finally { text.free(); key.free(); }
  }

  function getCvar(name) {
    if (!nativeReady) return '';
    const key = nativeString(name);
    try { return globalThis.Pointer_stringify(module._Cvar_VariableString(key.pointer)); } finally { key.free(); }
  }

  function allocateEventSlots() {
    if (eventSlots.length) return;
    eventSlots = Array.from({ length: 128 }, () => module._malloc(28));
  }

  function eventPointer() {
    allocateEventSlots();
    const pointer = eventSlots[nextEventSlot];
    nextEventSlot = (nextEventSlot + 1) % eventSlots.length;
    globalThis.HEAPU8.fill(0, pointer, pointer + 28);
    return pointer;
  }

  function pushMouseMove(x, y, dx, dy) {
    if (!nativeReady || !globalThis.SDL) return;
    const pointer = eventPointer();
    globalThis.HEAP32[pointer >> 2] = 0x400;
    globalThis.HEAPU8[pointer + 8] = globalThis.SDL.buttonState || 0;
    globalThis.HEAP32[(pointer + 12) >> 2] = Math.round(x);
    globalThis.HEAP32[(pointer + 16) >> 2] = Math.round(y);
    globalThis.HEAP32[(pointer + 20) >> 2] = Math.round(dx);
    globalThis.HEAP32[(pointer + 24) >> 2] = Math.round(dy);
    globalThis.SDL.events.push(pointer);
  }

  function publishMenuPointer(detail) {
    pointerSerial += 1;
    setCvar('ui_wasmPointerX', Math.round(detail.x));
    setCvar('ui_wasmPointerY', Math.round(detail.y));
    setCvar('ui_wasmPointerSerial', pointerSerial);
  }

  function pushMouseButton(button, pressed, x, y) {
    if (!nativeReady || !globalThis.SDL) return;
    const pointer = eventPointer();
    globalThis.HEAP32[pointer >> 2] = pressed ? 0x401 : 0x402;
    globalThis.HEAPU8[pointer + 8] = Number(button) + 1;
    globalThis.HEAPU8[pointer + 9] = pressed ? 1 : 0;
    globalThis.HEAP32[(pointer + 12) >> 2] = Math.round(x);
    globalThis.HEAP32[(pointer + 16) >> 2] = Math.round(y);
    const mask = 1 << Number(button);
    globalThis.SDL.buttonState = pressed ? globalThis.SDL.buttonState | mask : globalThis.SDL.buttonState & ~mask;
    globalThis.SDL.events.push(pointer);
  }

  function pushEscape() {
    if (!nativeReady || !globalThis.SDL) return;
    pushKey(41, 27, true);
    pushKey(41, 27, false);
  }

  function pushKey(scancode, keycode, pressed) {
    if (!nativeReady || !globalThis.SDL) return;
    const pointer = eventPointer();
    globalThis.HEAP32[pointer >> 2] = pressed ? 0x300 : 0x301;
    globalThis.HEAPU8[pointer + 8] = pressed ? 1 : 0;
    globalThis.HEAP32[(pointer + 12) >> 2] = scancode;
    globalThis.HEAP32[(pointer + 16) >> 2] = keycode;
    globalThis.HEAP32[(pointer + 24) >> 2] = keycode;
    globalThis.SDL.events.push(pointer);
  }

  function controllerKey(name, scancode, keycode, pressed) {
    const next = Boolean(pressed);
    if (controllerHeld.get(name) === next) return;
    controllerHeld.set(name, next);
    pushKey(scancode, keycode, next);
  }

  function releaseController() {
    const keys = [
      ['forward', 26, 119], ['backward', 22, 115], ['left', 4, 97], ['right', 7, 100],
      ['jump', 44, 32], ['crouch', 224, 0], ['reload', 21, 114], ['sprint', 225, 0],
      ['scoreboard', 43, 9], ['menu', 41, 27], ['up', 82, 0], ['down', 81, 0],
      ['menuLeft', 80, 0], ['menuRight', 79, 0], ['accept', 40, 13]
    ];
    for (const [name, scan, key] of keys) controllerKey(name, scan, key, false);
    if (controllerAttack) {
      pushMouseButton(0, false, 0, 0);
      controllerAttack = false;
    }
  }

  function publishController(detail) {
    if (!nativeReady) return;
    const actions = detail.actions || {};
    const held = name => Number(actions[name]) > 0.4;
    const menu = ['menu', 'paused'].includes(nativeEngineState());
    if (menu) {
      controllerKey('up', 82, 0, held('forward'));
      controllerKey('down', 81, 0, held('backward'));
      controllerKey('menuLeft', 80, 0, held('left'));
      controllerKey('menuRight', 79, 0, held('right'));
      controllerKey('accept', 40, 13, held('jump') || held('attack'));
      controllerKey('menu', 41, 27, held('crouch') || held('menu'));
      for (const [name, scan, key] of [
        ['forward', 26, 119], ['backward', 22, 115], ['left', 4, 97], ['right', 7, 100],
        ['jump', 44, 32], ['crouch', 224, 0], ['reload', 21, 114], ['sprint', 225, 0],
        ['scoreboard', 43, 9]
      ]) controllerKey(name, scan, key, false);
    } else {
      controllerKey('forward', 26, 119, held('forward'));
      controllerKey('backward', 22, 115, held('backward'));
      controllerKey('left', 4, 97, held('left'));
      controllerKey('right', 7, 100, held('right'));
      controllerKey('jump', 44, 32, held('jump'));
      controllerKey('crouch', 224, 0, held('crouch'));
      controllerKey('reload', 21, 114, held('reload'));
      controllerKey('sprint', 225, 0, held('sprint'));
      controllerKey('scoreboard', 43, 9, held('scoreboard'));
      controllerKey('menu', 41, 27, held('menu'));
      for (const [name, scan, key] of [
        ['up', 82, 0], ['down', 81, 0], ['menuLeft', 80, 0], ['menuRight', 79, 0], ['accept', 40, 13]
      ]) controllerKey(name, scan, key, false);
      const attack = held('attack');
      if (attack !== controllerAttack) {
        pushMouseButton(0, attack, 0, 0);
        controllerAttack = attack;
      }
      const delta = Math.max(1, Number(detail.deltaMs) || 16);
      pushMouseMove(0, 0, Number(actions.lookX || 0) * delta, Number(actions.lookY || 0) * delta);
    }
  }

  function flushPersistence() {
    if (!nativeReady) return;
    context.persistence.markDirty();
    void context.persistence.save().then(() => {
      if (typeof document !== 'undefined' && document.documentElement) {
        const saves = Number(document.documentElement.dataset.q3PersistenceSaves || 0);
        document.documentElement.dataset.q3PersistenceSaves = String(saves + 1);
      }
    }).catch(() => {
      if (typeof document !== 'undefined' && document.documentElement) {
        document.documentElement.dataset.q3Persistence = 'failed';
      }
    });
  }

  function profileValues(values) {
    return PROFILE_CVARS[values.qualityProfile] || PROFILE_CVARS.balanced;
  }

  function applyPreferences(values) {
    if (!nativeReady) return;
    setCvar('name', cleanName(values.playerName));
    setCvar('com_maxfps', Math.max(20, Math.min(240, Number(values.targetFps) || 60)));
    for (const [name, value] of Object.entries(profileValues(values))) setCvar(name, value);
    quality?.setEnabled(values.dynamicQuality);
    quality?.setTargetFps(values.targetFps);
  }

  function nativeEngineState() {
    if (!nativeReady) return started ? 'loading' : 'launcher';
    const menu = getCvar('ui_nativeMenu') === '1';
    const active = getCvar('cg_wasmActive') === '1';
    const paused = getCvar('cl_paused') === '1';
    if (menu && paused) return 'paused';
    // JOIN has begun once the QVM raises capture intent, but player control is
    // not gameplay until cgame accepts its first valid snapshot.
    if (menu && getCvar('ui_captureIntent') === '1') return 'loading';
    if (menu) return 'menu';
    return active ? 'gameplay' : 'loading';
  }

  function updateEngineState() {
    const next = nativeEngineState();
    if (next !== reportedEngineState) {
      const transition = Object.freeze({
        from: reportedEngineState || null,
        to: next,
        at: performance.now(),
        pointerLocked: document.pointerLockElement === context.elements.canvas
      });
      reportedEngineState = next;
      if (engineTransitions.length < 32) engineTransitions.push(transition);
      context.log(`[engine state] ${transition.from || 'initial'} -> ${next}`);
    }
    context.setEngineState(next);
  }

  async function requestJoin() {
    setCvar('ui_joinGameRequested', '0');
    if (joining) return;
    joining = true;
    setCvar('ui_joinGameStatus', 'WAKING ARENA...');
    try {
      const wake = context.framework.createWakeClient({
        statusUrl: '/status', wakeUrl: '/wake', timeout: 60000,
        onStatus: status => {
          const label = status?.state === 'running' ? 'ARENA READY' : `ARENA ${String(status?.state || 'STARTING').toUpperCase()}`;
          setCvar('ui_joinGameStatus', label);
        }
      });
      const status = await wake.ensureRunning({ playerName: cleanName(context.preferences.values().playerName) });
      const port = location.port || (location.protocol === 'https:' ? '443' : '80');
      // q3config.cfg is executed asynchronously after callMain returns. Apply
      // framework identity again immediately before the native connect command,
      // and pass it through the UI QVM so name + connect are one native action.
      const playerName = cleanName(context.preferences.values().playerName);
      setCvar('name', playerName);
      setCvar('ui_joinGameName', playerName);
      setCvar('ui_joinGameIssued', '0');
      setCvar('ui_joinGameAddress', `${location.hostname}:${port}`);
      setCvar('ui_joinGameStatus', `JOINING ${String(status.map || 'ARENA').toUpperCase()}...`);
      setCvar('ui_joinGameReady', '1');
    } catch (error) {
      setCvar('ui_captureIntent', '0');
      setCvar('ui_joinGameStatus', 'ARENA UNAVAILABLE');
      context.log(error?.stack || error);
    } finally {
      joining = false;
    }
  }

  function monitor() {
    clearInterval(stateTimer);
    stateTimer = setInterval(() => {
      if (getCvar('ui_joinGameRequested') === '1') requestJoin();
      // A JOIN lock can be granted before the first client snapshot. Keep the
      // native intent through that honest loading interval; clear it only once
      // the player is active and the canvas is actually captured.
      if (getCvar('cg_wasmActive') === '1' &&
          document.pointerLockElement === context.elements.canvas &&
          getCvar('ui_captureIntent') === '1') {
        setCvar('ui_captureIntent', '0');
      }
      updateEngineState();
      document.documentElement.dataset.q3NativeActive = getCvar('cg_wasmActive') || '0';
      document.documentElement.dataset.q3CaptureIntent = getCvar('ui_captureIntent') || '0';
      document.documentElement.dataset.q3JoinIssued = getCvar('ui_joinGameIssued') || '0';
      document.documentElement.dataset.q3NativeName = getCvar('name');
      document.documentElement.dataset.q3ResizeSerial = String(resizeSerial);
      document.documentElement.dataset.q3ResizeApplied = getCvar('cg_wasmActive') === '1'
        ? getCvar('cg_wasmResizeApplied') || '0'
        : getCvar('ui_wasmResizeApplied') || '0';
      document.documentElement.dataset.q3CaptureTarget = getCvar('ui_wasmCaptureTarget');
      document.documentElement.dataset.q3PointerSerial = String(pointerSerial);
      document.documentElement.dataset.q3PointerApplied = getCvar('ui_wasmPointerApplied') || '0';
      document.documentElement.dataset.q3NativePointer = `${getCvar('ui_wasmPointerAppliedX') || '0'}x${getCvar('ui_wasmPointerAppliedY') || '0'}`;
      document.documentElement.dataset.q3AudioState = globalThis.SDL?.audioContext?.state ||
        (globalThis.SDL?.audio ? 'initialized' : 'unavailable');
      if (globalThis.GLctx) {
        const viewport = Array.from(globalThis.GLctx.getParameter(globalThis.GLctx.VIEWPORT));
        document.documentElement.dataset.q3NativeViewport = viewport.join('x');
        document.documentElement.dataset.q3NativeResolution = `${getCvar('r_customwidth')}x${getCvar('r_customheight')}`;
        document.documentElement.dataset.q3Backbuffer = `${module.canvas.width}x${module.canvas.height}`;
      }
    }, 100);
  }

  async function loadEngine() {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = '/ioquake3.js';
      script.onload = resolve;
      script.onerror = () => reject(new Error('Could not load the QuakeJS client engine.'));
      document.head.appendChild(script);
    });
  }

  globalThis.WasmGameAdapter = Object.freeze({
    async init(nextContext) {
      context = nextContext;
      const policy = await fetch('/wasm-game-data.json', { cache: 'no-store' }).then(response => response.json());
      dataSet = context.framework.createOwnerDataSet(policy);
      context.elements.canvas.addEventListener('contextmenu', event => event.preventDefault());
      document.addEventListener('pointermove', event => {
        if (!nativeReady || document.pointerLockElement !== context.elements.canvas) return;
        pushMouseMove(0, 0, event.movementX || 0, event.movementY || 0);
      }, true);
      document.addEventListener('pointerdown', event => {
        if (nativeReady && document.pointerLockElement === context.elements.canvas) pushMouseButton(event.button, true, 0, 0);
      }, true);
      document.addEventListener('pointerup', event => {
        if (nativeReady && document.pointerLockElement === context.elements.canvas) pushMouseButton(event.button, false, 0, 0);
      }, true);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') flushPersistence();
        else void context.shell.resumeAudio();
      });
      window.addEventListener('pagehide', flushPersistence);
    },

    async start() {
      if (started) {
        context.showRuntime('menu');
        return;
      }
      started = true;
      context.setLoading('Preparing Quake III Arena…', 'Starting arena…', 5);
      ownerData = await context.dataClient.load(dataSet, {
        onProgress: detail => {
          const position = Number(detail.index || 0) + 1;
          context.setLoading('Preparing Quake III Arena…', `Starting arena… ${position}/9`, Math.min(60, position * 6));
        }
      });

      const qvmEntries = await Promise.all(['ui', 'cgame'].map(async name => {
        const response = await fetch(`/qvm/${name}.qvm`);
        if (!response.ok) throw new Error(`The framework ${name} QVM is missing.`);
        return {
          file: new File([await response.blob()], `${name}.qvm`, { type: 'application/octet-stream' }),
          mountName: `vm/${name}.qvm`
        };
      }));
      const entries = [...ownerData.entries, ...qvmEntries];

      const values = context.preferences.values();
      const width = Math.max(2, lastResize.width);
      const height = Math.max(2, lastResize.height);
      const profile = profileValues(values);
      globalThis.ioq3 = {
        noInitialRun: true,
        // Sys_FS_Startup completes through an asynchronous browser callback.
        // Keep the historical Emscripten runtime alive after _main returns so
        // that callback can mount owner PAKs and resume the native main loop.
        noExitRuntime: true,
        noImageDecoding: true,
        noAudioDecoding: true,
        canvas: context.elements.canvas,
        viewport: context.elements.runtime,
        elementPointerLock: false,
        print: value => context.log(value),
        printErr: value => context.log(value),
        exitHandler: reason => {
          context.log(`[engine exit] ${String(reason || 'runtime stopped')}`);
          context.setEngineState('crashed');
        }
      };
      await loadEngine();
      module = globalThis.ioq3;
      try {
        await context.persistence.attach(globalThis.FS, { root: context.persistence.root });
        if (typeof document !== 'undefined' && document.documentElement) {
          document.documentElement.dataset.q3Persistence = 'ready';
        }
      } catch (error) {
        if (typeof document !== 'undefined' && document.documentElement) {
          document.documentElement.dataset.q3Persistence = 'failed';
        }
        throw error;
      }
      globalThis.SYSC.FS_Startup = callback => {
        // The engine restarts its search path when it connects. Owner files
        // are already resident and read-only after the first startup.
        if (ownerFilesMounted) {
          callback(null);
          return;
        }
        context.framework.mountOwnerFiles(globalThis.FS, entries, { root: '/base/baseq3', preservePaths: true })
          .then(() => {
            ownerFilesMounted = true;
            callback(null);
          }, error => {
            context.log(`[owner mount] ${error?.stack || error}`);
            callback(error);
          });
      };
      globalThis.SYSC.FS_Shutdown = callback => callback(null);
      globalThis.SYS.LoadingDescription = () => context.setLoading('Starting arena…', '', 70);
      globalThis.SYS.LoadingProgress = value => context.setLoading('Starting arena…', '', 70 + Math.round((Number(value) || 0) * 20));
      globalThis.SYS.PromptEULA = callback => callback(new Error('Owner PAK validation unexpectedly requested the demo installer.'));
      context.setLoading('Starting arena…', '', 70);
      module.callMain([
        '+set', 'fs_homepath', context.persistence.root, '+set', 'fs_basepath', '/base', '+set', 'fs_game', 'baseq3',
        '+set', 'com_introplayed', '1', '+set', 'com_hunkMegs', '128', '+set', 'r_mode', '-1',
        '+set', 'r_customwidth', String(width), '+set', 'r_customheight', String(height),
        '+set', 'r_allowResize', '1', '+set', 'r_fullscreen', '0', '+set', 's_useOpenAL', '0',
        '+set', 'name', cleanName(values.playerName), '+set', 'com_maxfps', String(values.targetFps),
        '+set', 'r_picmip', profile.r_picmip, '+set', 'r_lodbias', profile.r_lodbias,
        '+set', 'r_subdivisions', profile.r_subdivisions
      ]);
      nativeReady = true;
      applyPreferences(values);
      quality = context.framework.createQualityController({
        profiles: ['high', 'balanced', 'performance'],
        initialIndex: Math.max(0, ['high', 'balanced', 'performance'].indexOf(values.qualityProfile)),
        targetFps: values.targetFps,
        enabled: values.dynamicQuality,
        apply: profileName => {
          for (const [name, value] of Object.entries(PROFILE_CVARS[profileName])) setCvar(name, value);
        }
      });
      quality.start();
      context.showRuntime('menu');
      monitor();
    },

    readEngineState() {
      return nativeEngineState();
    },

    readCaptureIntent() {
      return nativeReady && getCvar('ui_captureIntent') === '1';
    },

    controllerFrame(detail) {
      publishController(detail);
    },

    controllerChanged(detail) {
      if (detail.activeIndex == null || detail.selection === 'disabled') releaseController();
    },

    resize(detail) {
      // Q3's menu/pointer coordinates remain virtual 640x480, but the physical
      // WebGL drawing buffer must follow even a viewport smaller than that.
      lastResize = Object.freeze({ width: Math.max(2, detail.requestedWidth), height: Math.max(2, detail.requestedHeight) });
      document.documentElement.dataset.q3ResizeRequested = `${lastResize.width}x${lastResize.height}`;
      const visibleCanvas = context.elements.canvas;
      if (!nativeReady || typeof module.setCanvasSize !== 'function') {
        if (visibleCanvas.width !== lastResize.width) visibleCanvas.width = lastResize.width;
        if (visibleCanvas.height !== lastResize.height) visibleCanvas.height = lastResize.height;
        return;
      }
      // Let QuakeJS own the shared canvas mutation. Pre-setting the attributes
      // here made setCanvasSize a no-op and left glConfig stale.
      if (module.canvas.width !== lastResize.width || module.canvas.height !== lastResize.height) {
        // Update CSS/drawing-buffer dimensions immediately without scheduling
        // QuakeJS's historical one-second SDL debounce. The source-built UI
        // QVM consumes this serial on its next frame and runs vid_restart fast,
        // which updates glConfig/UI/cgame against the existing WebGL context.
        // Suppress QuakeJS's historical SDL resize event: its prebuilt client
        // schedules that path one second later. The patched UI/cgame QVMs own
        // the immediate `vid_restart fast` command against these forced cvars.
        // Publish the forced native mode before changing the drawing buffer.
        // This prevents the outgoing native size from being fed back if the
        // framework observes layout while QuakeJS is between the browser
        // mutation and its fast mode update.
        const nativeBefore = `${getCvar('r_customwidth')}x${getCvar('r_customheight')}`;
        setCvar('r_customwidth', lastResize.width);
        setCvar('r_customheight', lastResize.height);
        setCvar('r_mode', '-1');
        const nativeAfter = `${getCvar('r_customwidth')}x${getCvar('r_customheight')}`;
        document.documentElement.dataset.q3ResizeCvarWrite = nativeAfter;
        module.setCanvasSize(lastResize.width, lastResize.height, true);
        resizeSerial += 1;
        setCvar('ui_wasmResizeSerial', resizeSerial);
        setCvar('cg_wasmResizeSerial', resizeSerial);
        if (resizeEvents.length < 16) {
          resizeEvents.push(Object.freeze({ requested: `${lastResize.width}x${lastResize.height}`, nativeBefore, nativeAfter }));
          document.documentElement.dataset.q3ResizeEvents = JSON.stringify(resizeEvents);
        }
      }
    },

    pointerMove(detail) {
      if (!nativeReady) return;
      if (document.pointerLockElement === context.elements.canvas) return;
      publishMenuPointer(detail);
    },

    pointerButton(detail) {
      if (!nativeReady) return;
      if (document.pointerLockElement === context.elements.canvas) return;
      publishMenuPointer(detail);
      if (detail.pressed) {
        captureGestureTarget = getCvar('ui_wasmCaptureTarget');
      } else {
        const target = captureGestureTarget;
        captureGestureTarget = '';
        if (target === 'join' || target === 'resume') {
          // The QVM advertised this exact action from native hover state before
          // the click. Expose intent synchronously during pointer-up so the
          // framework can request capture while Chrome activation is live.
          setCvar('ui_captureIntent', '1');
          document.documentElement.dataset.q3CaptureGesture = target;
        }
      }
      pushMouseButton(detail.button, detail.pressed, detail.x, detail.y);
    },

    captureLost() {
      // The framework refreshes native state before this fallback. An
      // ordinary Escape is already paused; an external lock loss still needs
      // to open the native menu synchronously.
      if (nativeEngineState() === 'gameplay') pushEscape();
    },
    inputCaptureChanged(captured) {
      document.documentElement.dataset.q3PointerLocked = String(captured);
      if (captured && getCvar('cg_wasmActive') === '1' && getCvar('ui_captureIntent') === '1') {
        setCvar('ui_captureIntent', '0');
      }
    },
    preferencesChanged(values) { applyPreferences(values); }
  });
})();
