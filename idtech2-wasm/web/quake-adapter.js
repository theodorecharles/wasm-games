(() => {
  'use strict';

  let engine = null;
  let ownerData = null;
  let started = false;
  let runtimePromise = null;
  let stateTimer = 0;
  let lastEscapeAt = 0;
  let lastConfigWriteAt = 0;
  let controllerIndex = null;
  let controllerState = 'menu';
  let profile = 'original';
  let pendingResize = null;
  const dispatchedMenuKeys = new Set();
  const controllerHeld = new Map();
  const controllerActions = Object.freeze([
    'forward', 'backward', 'left', 'right', 'jump', 'crouch', 'reload', 'weapon',
    'previousWeapon', 'nextWeapon', 'altAttack', 'attack', 'scoreboard', 'menu', 'sprint', 'melee'
  ]);
  const nativeKey = Object.freeze({
    tab: 9, enter: 13, escape: 27, space: 32, up: 1001, down: 1002, left: 1003, right: 1004,
    shift: 1010, mouse1: 1020, mouse2: 1021, wheelDown: 1030, wheelUp: 1031
  });
  const controllerGameplayKeys = Object.freeze([
    119, 115, 97, 100, nativeKey.space, 99, 114, 113, nativeKey.wheelDown, nativeKey.wheelUp,
    nativeKey.mouse2, nativeKey.mouse1, nativeKey.tab, nativeKey.escape, nativeKey.shift, 102
  ]);
  const controllerMenuKeys = Object.freeze([
    nativeKey.up, nativeKey.down, nativeKey.left, nativeKey.right, nativeKey.enter, nativeKey.escape,
    0, 0, 0, 0, 0, 0, 0, nativeKey.escape, 0, 0
  ]);

  function nativeState() {
    if (!started || typeof engine?._Q1_BrowserRuntimeState !== 'function') return 'menu';
    return ['menu', 'gameplay', 'paused', 'debrief', 'loading'][engine._Q1_BrowserRuntimeState()] || 'menu';
  }

  function captureIntent() {
    return Boolean(started && typeof engine?._Q1_BrowserCaptureIntent === 'function' &&
      engine._Q1_BrowserCaptureIntent());
  }

  function synchronizeState(ctx, event, captureGameplay) {
    const state = nativeState();
    const shouldCapture = captureGameplay && (state === 'gameplay' || (state === 'loading' && captureIntent()));
    if (state !== ctx.shell.engineState() || shouldCapture) {
      ctx.setEngineState(state, shouldCapture
        ? { capture: true, event }
        : undefined);
    }
    return state;
  }

  function safeName(value) {
    return String(value || '').replace(/[^A-Za-z0-9 _-]/g, '').trim().slice(0, 15) || 'Ranger';
  }

  async function sha256Hex(file) {
    if (!globalThis.crypto?.subtle) throw new Error('SHA-256 verification requires HTTPS or localhost.');
    const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
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

  async function loadEngine(ctx) {
    if (runtimePromise) return runtimePromise;
    runtimePromise = new Promise((resolve, reject) => {
      engine = globalThis.Module = {
        canvas: ctx.elements.canvas,
        noInitialRun: true,
        quakeEngineStarted: false,
        quakePersistenceChanged(immediate) {
          ctx.persistence.markDirty();
          if (immediate) ctx.persistence.save().catch(error => ctx.log(`Quake save flush failed: ${error.message || error}`));
        },
        print: (...args) => ctx.log(`[Quake] ${args.join(' ')}`),
        printErr: (...args) => ctx.log(`[Quake] ${args.join(' ')}`),
        onAbort: reason => {
          ctx.log(`Quake stopped: ${reason}`);
          ctx.showRuntime('crashed');
          reject(new Error(`Quake stopped: ${reason}`));
        },
        setStatus: message => {
          if (message) ctx.setLoading('Loading Quake engine…');
        },
        monitorRunDependencies: remaining => {
          if (remaining) ctx.setLoading('Loading Quake engine…', `${remaining} dependencies remaining`);
        },
        onRuntimeInitialized: () => resolve(engine)
      };
      loadScript('/quake1.js').catch(reject);
    });
    return runtimePromise;
  }

  function releaseController() {
    controllerHeld.clear();
    if (started && typeof engine?._Q1_BrowserControllerReleaseAll === 'function') {
      engine._Q1_BrowserControllerReleaseAll();
    }
  }

  function writeConfiguration(ctx, flush) {
    if (!started || typeof engine?._Q1_BrowserWriteConfiguration !== 'function') return;
    engine._Q1_BrowserWriteConfiguration();
    lastConfigWriteAt = performance.now();
    if (flush) ctx.persistence.save().catch(error => ctx.log(`Quake config flush failed: ${error.message || error}`));
  }

  function resumeEngineAudio(ctx) {
    void ctx.shell.resumeAudio();
    if (started && typeof engine?._SNDDMA_BrowserResumeAudio === 'function') {
      engine._SNDDMA_BrowserResumeAudio();
    }
  }

  function applyProfile(ctx, values) {
    profile = values?.qualityProfile === 'modernized' ? 'modernized' : 'original';
    ctx.shell.setDisplay?.({
      displayMode: profile === 'modernized' ? 'dynamic' : '4:3',
      pixelated: profile !== 'modernized'
    });
    const detail = ctx.shell.resize?.();
    if (detail) pendingResize = detail;
  }

  function dispatchTrustedMenuKey(ctx, event) {
    if (!started || event.repeat || (event.key !== 'Enter' && event.key !== 'Escape') ||
        typeof engine?._Q1_BrowserDispatchMenuKey !== 'function') return false;
    const code = event.code || event.key;
    if (!engine._Q1_BrowserDispatchMenuKey(event.key === 'Enter' ? 13 : 27)) return false;
    dispatchedMenuKeys.add(code);
    event.preventDefault?.();
    event.stopImmediatePropagation?.();
    resumeEngineAudio(ctx);
    synchronizeState(ctx, event, true);
    return true;
  }

  function sendControllerFrame(detail) {
    if (!started || !detail?.actions || typeof engine?._Q1_BrowserControllerKey !== 'function') return;
    const state = nativeState();
    if (state !== controllerState) {
      releaseController();
      controllerState = state;
    }
    const keys = state === 'gameplay' || state === 'loading' ? controllerGameplayKeys : controllerMenuKeys;
    for (let action = 0; action < controllerActions.length; action += 1) {
      const name = controllerActions[action];
      const value = Number(detail.actions[name]) || 0;
      const heldKey = controllerHeld.get(name) || 0;
      const wasDown = heldKey !== 0;
      const isDown = wasDown ? value > 0.35 : value >= 0.55;
      if (isDown === wasDown) continue;
      if (isDown) {
        const key = keys[action];
        if (!key) continue;
        controllerHeld.set(name, key);
        engine._Q1_BrowserControllerKey(key, 1);
      } else {
        controllerHeld.delete(name);
        engine._Q1_BrowserControllerKey(heldKey, 0);
      }
    }
    if (state === 'gameplay' && typeof engine._Q1_BrowserControllerLook === 'function') {
      const seconds = Math.max(0, Math.min(0.05, (Number(detail.deltaMs) || 0) / 1000));
      engine._Q1_BrowserControllerLook(
        (Number(detail.actions.lookX) || 0) * 720 * seconds,
        (Number(detail.actions.lookY) || 0) * 720 * seconds
      );
    }
  }

  function startTelemetry(ctx) {
    window.clearInterval(stateTimer);
    stateTimer = window.setInterval(() => {
      const state = nativeState();
      if (state !== ctx.shell.engineState()) ctx.setEngineState(state);
      if (typeof engine?._SNDDMA_BrowserCallbacks === 'function') {
        document.documentElement.dataset.quakeAudio = [
          engine._SNDDMA_BrowserCallbacks(),
          engine._SNDDMA_BrowserNonzeroCallbacks()
        ].join(',');
        if (typeof engine._SNDDMA_BrowserAudioState === 'function') {
          document.documentElement.dataset.quakeAudioState = String(engine._SNDDMA_BrowserAudioState());
        }
      }
      if (typeof engine?._Q1_BrowserControlsValid === 'function') {
        document.documentElement.dataset.quakeControlsValid = String(Boolean(engine._Q1_BrowserControlsValid()));
        document.documentElement.dataset.quakeControlsMask = String(engine._Q1_BrowserControlsMask());
        if (typeof engine._Q1_BrowserSensitivityX100 === 'function') {
          document.documentElement.dataset.quakeSensitivity = String(engine._Q1_BrowserSensitivityX100() / 100);
        }
      }
      if (typeof engine?._Q1_BrowserRenderWidth === 'function') {
        document.documentElement.dataset.quakeRender = [
          engine._Q1_BrowserRenderWidth(), engine._Q1_BrowserRenderHeight()
        ].join('x');
        document.documentElement.dataset.quakeProfile =
          engine._Q1_BrowserModernized?.() ? 'modernized' : 'original';
        if (typeof engine._Q1_BrowserPixelAspectX1000 === 'function') {
          document.documentElement.dataset.quakePixelAspect =
            String(engine._Q1_BrowserPixelAspectX1000() / 1000);
        }
      }
      if (typeof engine?._Q1_BrowserDemoPlayback === 'function') {
        document.documentElement.dataset.quakeDemoPlayback =
          String(Boolean(engine._Q1_BrowserDemoPlayback()));
      }
      if (typeof engine?._Q1_BrowserMenuActive === 'function') {
        document.documentElement.dataset.quakeMenuActive =
          String(Boolean(engine._Q1_BrowserMenuActive()));
      }
      if (performance.now() - lastConfigWriteAt >= 5000) writeConfiguration(ctx, false);
    }, 250);
  }

  globalThis.WasmGameAdapter = Object.freeze({
    async init(ctx) {
      // Emscripten's packaged SDL2 video backend targets "#canvas" for its
      // native window size, event, and pointer-lock calls.  The framework has
      // already retained this element by reference, so give the same canvas
      // the selector SDL requires before SDL_Init creates the native window.
      ctx.elements.canvas.id = 'canvas';
      const manifest = await fetch('/wasm-game-data.json', { cache: 'no-store' }).then(response => {
        if (!response.ok) throw new Error(`Quake data policy failed with HTTP ${response.status}.`);
        return response.json();
      });
      const policy = manifest.variants?.quake || manifest;
      ownerData = ctx.framework.createOwnerDataSet({
        namespace: policy.namespace || manifest.namespace,
        version: policy.version || manifest.version,
        files: policy.files.map(spec => ({
          ...spec,
          mountName: spec.name,
          validateCached: false,
          validate: async file => {
            ctx.setLoading('Preparing Quake…');
            if (await sha256Hex(file) !== spec.sha256) throw new Error(`${spec.name} failed SHA-256 verification.`);
          }
        }))
      });
      ctx.elements.canvas.addEventListener('contextmenu', event => event.preventDefault());
      document.addEventListener('keydown', event => {
        if (event.key === 'Escape') lastEscapeAt = performance.now();
        dispatchTrustedMenuKey(ctx, event);
      }, true);
      document.addEventListener('keyup', event => {
        const code = event.code || event.key;
        if (!dispatchedMenuKeys.delete(code)) return;
        event.preventDefault?.();
        event.stopImmediatePropagation?.();
      }, true);
      ctx.elements.canvas.addEventListener('pointerdown', () => resumeEngineAudio(ctx), { passive: true });
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') writeConfiguration(ctx, true);
      });
      window.addEventListener?.('pagehide', () => writeConfiguration(ctx, true));
      applyProfile(ctx, ctx.preferences?.values());
    },

    async start(ctx) {
      if (started) return;
      void ctx.shell.resumeAudio();
      ctx.setLoading('Preparing Quake…', '', 5);
      const data = await ctx.dataClient.load(ownerData, {
        onProgress(detail) {
          if (detail.phase === 'checking-cache') ctx.setLoading('Preparing Quake…');
          if (detail.phase === 'downloading') {
            const percent = detail.total ? Math.floor(detail.received * 100 / detail.total) : 0;
            ctx.setLoading('Preparing Quake…', `${percent}%`, Math.min(55, 5 + percent / 2));
          }
          if (detail.phase === 'restored') ctx.setLoading('Preparing Quake…');
        }
      });
      document.documentElement.dataset.wasmDataSource = data.entries.every(entry => entry.cached) ? 'cache' : 'container';
      ctx.setLoading('Loading Quake engine…', '', 60);
      await loadEngine(ctx);
      ctx.setLoading('Preparing Quake…', '', 75);
      await ctx.framework.mountOwnerFiles(engine, data, {
        root: '/id1',
        mode: 'memfs',
        onProgress(detail) {
          if (detail.phase === 'mounting' && detail.total) {
            ctx.setLoading('Preparing Quake…', `${Math.floor(detail.copied * 100 / detail.total)}%`, 75 + detail.copied * 20 / detail.total);
          }
        }
      });
      await ctx.persistence.attach(engine.FS, { root: ctx.persistence.root });
      started = true;
      engine.quakeEngineStarted = true;
      controllerState = nativeState();
      const name = safeName(ctx.preferences?.values().playerName);
      ctx.setLoading('Starting Quake…', '', 98);
      const args = ['-userdir', ctx.persistence.root, '+name', name];
      if (profile === 'modernized') args.push('-modernized');
      try { engine.callMain(args); }
      catch (error) { if (error !== 'unwind') throw error; }
      if (pendingResize && typeof engine._Q1_BrowserResize === 'function') {
        engine._Q1_BrowserResize(pendingResize.requestedWidth, pendingResize.requestedHeight);
      }
      resumeEngineAudio(ctx);
      ctx.showRuntime(nativeState());
      startTelemetry(ctx);
    },

    readEngineState() { return nativeState(); },
    readCaptureIntent() { return captureIntent(); },
    resize(detail) {
      pendingResize = detail;
      if (started && typeof engine?._Q1_BrowserResize === 'function') {
        engine._Q1_BrowserResize(detail.requestedWidth, detail.requestedHeight);
      }
    },
    captureLost(_detail, ctx) {
      if (started && performance.now() - lastEscapeAt > 750 &&
          typeof engine?._Q1_BrowserOpenMenu === 'function') engine._Q1_BrowserOpenMenu();
      synchronizeState(ctx, null, false);
    },
    inputCaptureChanged(captured) {
      if (started && typeof engine?._Q1_BrowserSetInputCaptured === 'function') {
        engine._Q1_BrowserSetInputCaptured(captured ? 1 : 0);
      }
    },
    controllerFrame(detail) { sendControllerFrame(detail); },
    controllerChanged(detail) {
      const nextIndex = Number.isInteger(detail?.activeIndex) ? detail.activeIndex : null;
      if (detail?.selection === 'disabled' || nextIndex !== controllerIndex) releaseController();
      controllerIndex = nextIndex;
    },
    preferencesChanged(values, ctx) {
      if (!started) applyProfile(ctx, values);
    }
  });
})();
