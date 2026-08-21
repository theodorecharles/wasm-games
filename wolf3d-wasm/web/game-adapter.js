(() => {
  'use strict';

  let engine = null;
  let ownerData = null;
  let variant = 'wolf3d';
  let runtimePromise = null;
  let started = false;
  let stateTimer = 0;
  let lastEscapeAt = 0;
  let persistentMount = null;
  const controllerHeld = new Map();
  let controllerButtons = 0;
  let controllerMenu = null;
  let controllerLookX = 0;

  const engines = Object.freeze({
    wolf3d: '/wolf3d.js',
    spear: '/spear.js'
  });

  function gameTitle() {
    return variant === 'spear' ? 'Spear of Destiny' : 'Wolfenstein 3D';
  }

  const controllerKeys = Object.freeze({
    backspace: 8, tab: 9, enter: 13, escape: 27, space: 32,
    shift: 304, up: 273, down: 274, right: 275, left: 276
  });

  function nativeState() {
    if (!started || typeof engine?._WolfWasm_BrowserRuntimeState !== 'function') return 'menu';
    return ['menu', 'menu', 'gameplay', 'debrief', 'paused', 'loading'][engine._WolfWasm_BrowserRuntimeState()] || 'menu';
  }

  function captureIntent() {
    return Boolean(started && typeof engine?._WolfWasm_BrowserCaptureIntent === 'function' &&
      engine._WolfWasm_BrowserCaptureIntent());
  }

  function synchronizeState(ctx, event, captureGameplay) {
    const state = nativeState();
    const shouldCapture = captureGameplay && (state === 'gameplay' || (state === 'loading' && captureIntent()));
    if (ctx.shell.engineState() !== state || shouldCapture) {
      ctx.setEngineState(state, shouldCapture
        ? { capture: true, event }
        : undefined);
    }
    return state;
  }

  function loadScript(source) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = source;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Could not load ${source}.`));
      document.head.appendChild(script);
    });
  }

  function trackPersistentWrites(FS, mount) {
    if (!mount || typeof FS.write !== 'function') return;
    const originalWrite = FS.write.bind(FS);
    FS.write = (stream, ...args) => {
      const written = originalWrite(stream, ...args);
      const path = String(stream?.path || (stream?.node && typeof FS.getPath === 'function' ? FS.getPath(stream.node) : '') || '');
      if (path === mount.root || path.startsWith(`${mount.root}/`)) mount.markDirty();
      return written;
    };
  }

  function controllerKey(code, pressed) {
    if (!started || typeof engine?._WolfWasm_BrowserControllerKey !== 'function') return;
    const next = Boolean(pressed);
    if (controllerHeld.get(code) === next) return;
    controllerHeld.set(code, next);
    engine._WolfWasm_BrowserControllerKey(code, next ? 1 : 0);
  }

  function setControllerButtons(mask) {
    const next = Number(mask) & 7;
    if (!started || controllerButtons === next || typeof engine?._WolfWasm_BrowserControllerButtons !== 'function') return;
    controllerButtons = next;
    engine._WolfWasm_BrowserControllerButtons(next);
  }

  function releaseController() {
    if (started && typeof engine?._WolfWasm_BrowserControllerKey === 'function') {
      for (const [code, pressed] of controllerHeld) {
        if (pressed) engine._WolfWasm_BrowserControllerKey(code, 0);
      }
    }
    controllerHeld.clear();
    setControllerButtons(0);
    controllerMenu = null;
    controllerLookX = 0;
  }

  function applyControllerFrame(detail) {
    if (!started || !detail?.actions) return;
    const actions = detail.actions;
    const menu = nativeState() !== 'gameplay';
    if (controllerMenu !== menu) {
      releaseController();
      controllerMenu = menu;
    }
    const active = value => Number(value) >= 0.4;
    if (menu) {
      controllerKey(controllerKeys.up, active(actions.forward));
      controllerKey(controllerKeys.down, active(actions.backward));
      controllerKey(controllerKeys.left, active(actions.left));
      controllerKey(controllerKeys.right, active(actions.right));
      controllerKey(controllerKeys.enter, active(actions.jump) || active(actions.attack));
      controllerKey(controllerKeys.backspace, active(actions.crouch) || active(actions.altAttack));
      controllerKey(controllerKeys.escape, active(actions.menu));
      return;
    }

    controllerKey(119, active(actions.forward));
    controllerKey(115, active(actions.backward));
    controllerKey(97, active(actions.left));
    controllerKey(100, active(actions.right));
    controllerKey(controllerKeys.space, active(actions.jump));
    controllerKey(controllerKeys.shift, active(actions.sprint));
    controllerKey(controllerKeys.tab, active(actions.scoreboard));
    controllerKey(controllerKeys.escape, active(actions.menu));
    controllerKey(101, active(actions.reload));
    setControllerButtons((active(actions.attack) ? 1 : 0) | (active(actions.altAttack) ? 2 : 0));

    const deltaMs = Math.max(0, Math.min(100, Number(detail.deltaMs) || 16.667));
    controllerLookX += (Number(actions.lookX) || 0) * deltaMs * 0.65;
    const dx = Math.trunc(controllerLookX);
    controllerLookX -= dx;
    if (dx && typeof engine?._WolfWasm_BrowserControllerMouse === 'function') {
      engine._WolfWasm_BrowserControllerMouse(dx, 0);
    }
  }

  async function sha256Hex(file) {
    if (!globalThis.crypto?.subtle) throw new Error('SHA-256 verification requires HTTPS or localhost.');
    const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  }

  async function loadEngine(ctx) {
    if (runtimePromise) return runtimePromise;
    runtimePromise = new Promise((resolve, reject) => {
      engine = globalThis.Module = {
        canvas: ctx.elements.canvas,
        noInitialRun: true,
        preRun: [() => { globalThis.SDL.defaults.copyOnLock = false; }],
        print: (...args) => ctx.log(`[Wolf4SDL] ${args.join(' ')}`),
        printErr: (...args) => ctx.log(`[Wolf4SDL] ${args.join(' ')}`),
        onAbort: reason => {
          ctx.log(`${gameTitle()} stopped: ${reason}`);
          ctx.showRuntime('crashed');
          reject(new Error(`${gameTitle()} stopped: ${reason}`));
        },
        setStatus: message => { if (message) ctx.setLoading(`Loading ${gameTitle()} engine…`); },
        monitorRunDependencies: remaining => {
          if (remaining) ctx.setLoading(`Loading ${gameTitle()} engine…`, `${remaining} dependencies remaining`);
        },
        onRuntimeInitialized: () => resolve(engine)
      };
      loadScript(engines[variant]).catch(reject);
    });
    return runtimePromise;
  }

  function startStatePolling(ctx) {
    window.clearInterval(stateTimer);
    stateTimer = window.setInterval(() => {
      const state = nativeState();
      if (ctx.shell.engineState() !== state) synchronizeState(ctx, null, false);
      if (typeof engine?._WolfWasm_BrowserControlsMask === 'function') {
        const mask = engine._WolfWasm_BrowserControlsMask();
        document.documentElement.dataset.wolf3dControlsMask = String(mask);
        document.documentElement.dataset.wolf3dControlsValid = String(mask === 31);
      }
      if (typeof engine?._WolfWasm_BrowserPreparedDigiSounds === 'function') {
        document.documentElement.dataset.wolfAudioPrepared = String(engine._WolfWasm_BrowserPreparedDigiSounds());
        document.documentElement.dataset.wolfAudioDigiStarts = String(engine._WolfWasm_BrowserDigiStarts());
        document.documentElement.dataset.wolfAudioActive = String(engine._WolfWasm_BrowserActiveDigiChannels());
      }
    }, 100);
  }

  globalThis.WasmGameAdapter = Object.freeze({
    async init(ctx) {
      const capability = ctx.framework.requireCapabilities({ wasm: true, indexedDb: true });
      if (!capability.supported) throw new Error(`This browser is missing: ${capability.missing.join(', ')}.`);
      variant = String(ctx.variant || 'wolf3d').toLowerCase();
      if (!engines[variant]) throw new Error(`Unsupported Wolf4SDL variant: ${variant}.`);
      // Emscripten's packaged SDL driver still resolves its display as
      // "#canvas" even when Module.canvas points at the framework element.
      ctx.elements.canvas.id = 'canvas';
      const manifest = await fetch('/wasm-game-data.json', { cache: 'no-store' }).then(response => {
        if (!response.ok) throw new Error(`Wolfenstein 3D data policy failed with HTTP ${response.status}.`);
        return response.json();
      });
      const policy = manifest.variants?.[variant];
      if (!policy) throw new Error(`Wolf4SDL data policy is missing variant: ${variant}.`);
      ownerData = ctx.framework.createOwnerDataSet({
        namespace: policy.namespace,
        version: policy.version,
        files: policy.files.map(spec => ({
          ...spec,
          // Wolf4SDL's Unix data probe uses lowercase DOS extensions while
          // Steam commonly installs uppercase filenames.
          mountName: spec.name.toLowerCase(),
          validate: async file => {
            ctx.setLoading(`Preparing ${gameTitle()}…`);
            if (await sha256Hex(file) !== spec.sha256) throw new Error(`${spec.name} failed SHA-256 verification.`);
          }
        }))
      });
      ctx.elements.canvas.addEventListener('contextmenu', event => event.preventDefault());
      // Browser Wolf4SDL has keyboard-only menus. The framework publishes
      // captured movementX through pointerMove(); suppress SDL's parallel raw
      // mouse path so released motion cannot navigate menus and locked deltas
      // are never counted twice.
      ctx.elements.canvas.addEventListener('mousemove', event => event.stopImmediatePropagation(), true);
      document.addEventListener('keyup', event => {
        if (!started || (event.key !== 'Enter' && event.key !== 'Escape')) return;
        queueMicrotask(() => synchronizeState(ctx, event, true));
      });
      document.addEventListener('keydown', event => {
        if (event.key === 'Escape') lastEscapeAt = performance.now();
      }, true);
    },

    async start(ctx) {
      if (started) return;
      void ctx.shell.resumeAudio();
      ctx.setLoading(`Preparing ${gameTitle()}…`, '', 5);
      const data = await ctx.dataClient.load(ownerData, {
        onProgress(detail) {
          if (detail.phase === 'checking-cache') ctx.setLoading(`Preparing ${gameTitle()}…`);
          if (detail.phase === 'downloading') {
            const percent = detail.total ? Math.floor(detail.received * 100 / detail.total) : 0;
            ctx.setLoading(`Preparing ${gameTitle()}…`, `${percent}%`, Math.min(55, 5 + percent / 2));
          }
          if (detail.phase === 'restored') ctx.setLoading(`Preparing ${gameTitle()}…`);
        }
      });
      document.documentElement.dataset.wasmDataSource = data.entries.every(entry => entry.cached) ? 'cache' : 'container';
      ctx.setLoading(`Loading ${gameTitle()} engine…`, '', 60);
      await loadEngine(ctx);
      ctx.setLoading(`Preparing ${gameTitle()}…`, '', 75);
      await ctx.framework.mountOwnerFiles(engine, data, {
        root: '/game',
        mode: 'memfs',
        onProgress(detail) {
          if (detail.phase === 'mounting' && detail.total) {
            ctx.setLoading(`Preparing ${gameTitle()}…`, `${Math.floor(detail.copied * 100 / detail.total)}%`,
              75 + detail.copied * 20 / detail.total);
          }
        }
      });
      persistentMount = await ctx.persistence.attach(engine.FS, { root: ctx.persistence.root });
      trackPersistentWrites(engine.FS, persistentMount);
      started = true;
      ctx.setLoading(`Starting ${gameTitle()}…`, '', 98);
      try { engine.callMain(['--res', '960', '720', '--datadir', '/game', '--configdir', persistentMount.root]); }
      catch (error) { if (error !== 'unwind') throw error; }
      ctx.showRuntime(nativeState());
      startStatePolling(ctx);
    },

    readEngineState() { return nativeState(); },
    readCaptureIntent() { return captureIntent(); },
    pointerMove(detail) {
      if (!started || detail?.captured !== true || typeof engine?._WolfWasm_BrowserControllerMouse !== 'function') return;
      engine._WolfWasm_BrowserControllerMouse(Math.round(detail.movementX || 0), 0);
    },
    captureLost(_detail, ctx) {
      if (started && performance.now() - lastEscapeAt > 750 &&
          typeof engine?._WolfWasm_BrowserOpenMenu === 'function') engine._WolfWasm_BrowserOpenMenu();
      if (started) synchronizeState(ctx, null, false);
      persistentMount?.save().catch(error => ctx.log(error));
    },
    inputCaptureChanged(captured) {
      if (started && typeof engine?._WolfWasm_BrowserSetInputCaptured === 'function') {
        engine._WolfWasm_BrowserSetInputCaptured(captured ? 1 : 0);
      }
    },
    controllerFrame(detail) {
      applyControllerFrame(detail);
    },
    controllerChanged(detail) {
      if (!detail?.connected || detail.selection === 'disabled' || detail.activeIndex == null) releaseController();
    }
  });
})();
