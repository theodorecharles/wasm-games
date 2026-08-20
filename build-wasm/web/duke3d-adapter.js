(() => {
  'use strict';

  let engine = null;
  let ownerData = null;
  let started = false;
  let runtimePromise = null;
  let telemetryTimer = 0;
  let context = null;
  let captureIntent = false;

  const browserScanCodes = Object.freeze({
    Escape: 0x01, Digit1: 0x02, Digit2: 0x03, Digit3: 0x04, Digit4: 0x05, Digit5: 0x06,
    Digit6: 0x07, Digit7: 0x08, Digit8: 0x09, Digit9: 0x0a, Digit0: 0x0b, Minus: 0x0c,
    Equal: 0x0d, Backspace: 0x0e, Tab: 0x0f, KeyQ: 0x10, KeyW: 0x11, KeyE: 0x12,
    KeyR: 0x13, KeyT: 0x14, KeyY: 0x15, KeyU: 0x16, KeyI: 0x17, KeyO: 0x18,
    KeyP: 0x19, BracketLeft: 0x1a, BracketRight: 0x1b, Enter: 0x1c, ControlLeft: 0x1d,
    KeyA: 0x1e, KeyS: 0x1f, KeyD: 0x20, KeyF: 0x21, KeyG: 0x22, KeyH: 0x23,
    KeyJ: 0x24, KeyK: 0x25, KeyL: 0x26, Semicolon: 0x27, Quote: 0x28, Backquote: 0x29,
    ShiftLeft: 0x2a, Backslash: 0x2b, KeyZ: 0x2c, KeyX: 0x2d, KeyC: 0x2e,
    KeyV: 0x2f, KeyB: 0x30, KeyN: 0x31, KeyM: 0x32, Comma: 0x33, Period: 0x34,
    Slash: 0x35, ShiftRight: 0x36, AltLeft: 0x38, Space: 0x39, F1: 0x3b, F2: 0x3c,
    F3: 0x3d, F4: 0x3e, F5: 0x3f, F6: 0x40, F7: 0x41, F8: 0x42, F9: 0x43,
    F10: 0x44, F11: 0x57, F12: 0x58, ControlRight: 0x9d, AltRight: 0xb8,
    Home: 0xc7, ArrowUp: 0xc8, PageUp: 0xc9, ArrowLeft: 0xcb, ArrowRight: 0xcd,
    End: 0xcf, ArrowDown: 0xd0, PageDown: 0xd1, Insert: 0xd2, Delete: 0xd3
  });

  function nativeStateCode() {
    if (!started || typeof engine?._Duke_WasmRuntimeState !== 'function') return 0;
    return engine._Duke_WasmRuntimeState();
  }

  function nativeState() {
    const code = nativeStateCode();
    if (code === 1) return 'gameplay';
    if (code === 2) return 'paused';
    return captureIntent ? 'loading' : 'menu';
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
        print: (...args) => { console.log('[Duke WASM]', ...args); ctx.log(args.join(' ')); },
        printErr: (...args) => {
          const line = args.join(' ');
          // The CON compiler writes its success summary to stderr and includes
          // the phrase "0 error(s)".  Keep real failures red without turning
          // that successful summary into a browser-console error.
          const actionable = line.replace(/\b0\s+error(?:s|\(s\))?(?=\W|$)/gi, '');
          if (/\b(error|fatal|abort|unreachable)\b/i.test(actionable)) {
            console.error('[Duke WASM]', ...args);
            ctx.log(`ERROR: ${line}`);
          } else {
            console.log('[Duke WASM]', ...args);
            ctx.log(line);
          }
        },
        setStatus: message => { if (message) ctx.setLoading('Preparing Duke Nukem 3D…'); },
        monitorRunDependencies: remaining => {
          if (remaining) ctx.setLoading('Preparing Duke Nukem 3D…');
        },
        onRuntimeInitialized: () => resolve(engine),
        onAbort: reason => {
          ctx.log(`Duke Nukem 3D stopped: ${reason}`);
          ctx.showRuntime('crashed');
          reject(new Error(`Duke Nukem 3D stopped: ${reason}`));
        }
      };
      loadScript('/duke3d.js').catch(reject);
    });
    return runtimePromise;
  }

  function startTelemetry(ctx) {
    window.clearInterval(telemetryTimer);
    telemetryTimer = window.setInterval(() => {
      const state = nativeState();
      if (nativeStateCode() === 1) captureIntent = false;
      if (state !== ctx.shell.engineState()) ctx.setEngineState(state);
      if (typeof engine?._Duke_WasmControlsMask === 'function') {
        const mask = engine._Duke_WasmControlsMask();
        document.documentElement.dataset.dukeControlsMask = String(mask);
        document.documentElement.dataset.dukeControlsValid = String(mask === 31);
      }
      if (typeof engine?._Duke_WasmMenuId === 'function') {
        document.documentElement.dataset.dukeMenuId = String(engine._Duke_WasmMenuId());
      }
      if (typeof engine?._Duke_WasmMenuEntry === 'function') {
        document.documentElement.dataset.dukeMenuEntry = String(engine._Duke_WasmMenuEntry());
      }
      if (typeof engine?._Build_WasmRenderMode === 'function') {
        document.documentElement.dataset.buildRenderMode = String(engine._Build_WasmRenderMode());
        document.documentElement.dataset.buildRenderSize = `${engine._Build_WasmRenderWidth()}x${engine._Build_WasmRenderHeight()}`;
        document.documentElement.dataset.buildRenderBpp = String(engine._Build_WasmRenderBpp());
      }
      if (typeof engine?._Build_WasmPointerClickState === 'function') {
        document.documentElement.dataset.buildNativePointer = `${engine._Build_WasmPointerX()},${engine._Build_WasmPointerY()}`;
        document.documentElement.dataset.buildNativePointerBits = String(engine._Build_WasmPointerBits());
        document.documentElement.dataset.buildNativeClickState = String(engine._Build_WasmPointerClickState());
        document.documentElement.dataset.buildPointerRelease = String(engine._Build_WasmPointerReleaseCountdown());
        document.documentElement.dataset.buildInputFrames = String(engine._Build_WasmInputFrameCount());
      }
      if (typeof engine?._Build_WasmPointerDeltaEvents === 'function') {
        document.documentElement.dataset.buildPointerDelta =
          `${engine._Build_WasmPointerDeltaX()},${engine._Build_WasmPointerDeltaY()}`;
        document.documentElement.dataset.buildPointerDeltaEvents = String(engine._Build_WasmPointerDeltaEvents());
      }
      const audioContext = engine?.SDL2?.audioContext;
      if (audioContext) document.documentElement.dataset.audioState = audioContext.state;
    }, 250);
  }

  function flushPersistence() {
    if (!started) return;
    try { engine?._Duke_WasmFlushPersistence?.(); }
    catch (error) { console.warn('[Duke WASM] Could not flush configuration', error); }
    context?.persistence?.markDirty();
    void context?.persistence?.save();
  }

  function controllerFrame(detail) {
    if (!started || typeof engine?._Build_WasmControllerFrame !== 'function') return;
    const actions = detail.actions || {};
    const menu = nativeState() !== 'gameplay';
    let keys = 0;
    const held = (name, threshold = 0.4) => Number(actions[name]) > threshold;
    if (menu) {
      if (held('forward') || held('up')) keys |= 1 << 11;
      if (held('backward') || held('down')) keys |= 1 << 12;
      if (held('left')) keys |= 1 << 13;
      if (held('right')) keys |= 1 << 14;
      if (held('jump') || held('attack')) keys |= 1 << 7;
      if (held('crouch') || held('menu')) keys |= 1 << 10;
    } else {
      if (held('forward')) keys |= 1 << 0;
      if (held('backward')) keys |= 1 << 1;
      if (held('left')) keys |= 1 << 2;
      if (held('right')) keys |= 1 << 3;
      if (held('jump')) keys |= 1 << 4;
      if (held('crouch')) keys |= 1 << 5;
      if (held('reload')) keys |= 1 << 6;
      if (held('sprint')) keys |= 1 << 8;
      if (held('scoreboard')) keys |= 1 << 9;
      if (held('menu')) keys |= 1 << 10;
      if (held('melee')) keys |= 1 << 15;
    }
    let mouse = 0;
    if (!menu && held('attack')) mouse |= 1;
    if (!menu && held('altAttack')) mouse |= 2;
    if (!menu && held('previousWeapon')) mouse |= 16;
    if (!menu && held('nextWeapon')) mouse |= 32;
    const scale = Math.max(1, detail.deltaMs || 16);
    engine._Build_WasmControllerFrame(keys,
      menu ? 0 : Math.round(Number(actions.lookX || 0) * scale),
      menu ? 0 : Math.round(Number(actions.lookY || 0) * scale), mouse);
  }

  function releaseController() {
    engine?._Build_WasmControllerFrame?.(0, 0, 0, 0);
  }

  globalThis.WasmGameAdapter = Object.freeze({
    async init(ctx) {
      context = ctx;
      document.documentElement.dataset.audioState = 'not-created';
      document.documentElement.dataset.persistence = 'not-started';
      const manifest = await fetch('/wasm-game-data.json', { cache: 'no-store' }).then(response => {
        if (!response.ok) throw new Error(`Duke Nukem 3D data policy failed with HTTP ${response.status}.`);
        return response.json();
      });
      const policy = manifest.variants?.duke3d || manifest;
      ownerData = ctx.framework.createOwnerDataSet({
        namespace: policy.namespace || manifest.namespace,
        version: policy.version || manifest.version,
        files: policy.files.map(spec => ({
          ...spec,
          mountName: spec.path,
          validateCached: false,
          validate: async file => {
            ctx.setLoading('Preparing Duke Nukem 3D…');
            if (await sha256Hex(file) !== spec.sha256) throw new Error(`${spec.path} failed SHA-256 verification.`);
          }
        }))
      });
      ctx.elements.canvas.addEventListener('contextmenu', event => event.preventDefault());
      const publishKey = (event, pressed) => {
        const scan = browserScanCodes[event.code];
        document.documentElement.dataset.buildLastKey = `${event.code || 'unknown'}:${pressed ? 'down' : 'up'}`;
        if (scan == null || typeof engine?._Build_WasmKeyEvent !== 'function') return;
        document.documentElement.dataset.buildLastScan = String(scan);
        engine._Build_WasmKeyEvent(scan, pressed ? 1 : 0);
        if (pressed && event.code === 'Enter' && nativeStateCode() === 0 && engine?._Duke_WasmMenuId?.() === 110) {
          captureIntent = true;
        }
        if (pressed && event.code === 'Escape') {
          // Escape opens the menu from gameplay and closes it from pause.  The
          // latter is a trusted Resume gesture and must publish intent before
          // the native frame consumes the queued key.
          captureIntent = nativeStateCode() === 2;
        }
        event.stopPropagation();
        if (nativeState() !== 'gameplay' && !event.ctrlKey && !event.metaKey && !event.altKey) event.preventDefault();
      };
      ctx.elements.canvas.addEventListener('keydown', event => publishKey(event, true));
      ctx.elements.canvas.addEventListener('keyup', event => publishKey(event, false));
      // The framework publishes normalized pointer events to pointerButton().
      // Keep SDL's compatibility mouse events from clearing the same short
      // click before the native menu consumes it on its next frame.
      ctx.elements.canvas.addEventListener('mousedown', event => event.stopImmediatePropagation(), true);
      ctx.elements.canvas.addEventListener('mouseup', event => event.stopImmediatePropagation(), true);
      ctx.elements.canvas.addEventListener('mousemove', event => event.stopImmediatePropagation(), true);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') flushPersistence();
        else void ctx.shell.resumeAudio();
      });
      window.addEventListener('pagehide', flushPersistence);
    },

    async start(ctx) {
      if (started) return;
      void ctx.shell.resumeAudio();
      ctx.setLoading('Preparing Duke Nukem 3D…', '', 5);
      const data = await ctx.dataClient.load(ownerData, {
        onProgress(detail) {
          if (detail.phase === 'checking-cache') ctx.setLoading('Preparing Duke Nukem 3D…');
          if (detail.phase === 'downloading') {
            const percent = detail.total ? Math.floor(detail.received * 100 / detail.total) : 0;
            ctx.setLoading('Preparing Duke Nukem 3D…', `${percent}%`, Math.min(50, 5 + percent * 0.45));
          }
          if (detail.phase === 'restored') ctx.setLoading('Preparing Duke Nukem 3D…');
        }
      });
      document.documentElement.dataset.wasmDataSource = data.entries.every(entry => entry.cached) ? 'cache' : 'container';
      ctx.setLoading('Preparing Duke Nukem 3D…', '', 55);
      await loadEngine(ctx);
      document.documentElement.dataset.persistence = 'loading';
      await ctx.persistence.attach(engine.FS, { root: ctx.persistence.root });
      document.documentElement.dataset.persistence = 'ready';
      await ctx.framework.mountOwnerFiles(engine, data, {
        root: '/game',
        mode: 'memfs',
        preservePaths: true,
        onProgress(detail) {
          if (detail.phase !== 'mounting' || !detail.total) return;
          ctx.setLoading('Preparing Duke Nukem 3D…', `${Math.floor(detail.copied * 100 / detail.total)}%`, 60 + detail.copied * 35 / detail.total);
        }
      });
      engine.FS.chmod('/game', 0o555);
      started = true;
      ctx.setLoading('Starting Duke Nukem 3D…', '', 98);
      const args = ['-game_dir', '/game', '-gamegrp', 'DUKE3D.GRP', '-noautoload', '-nosetup', '-nologo'];
      try { engine.callMain(args); }
      catch (error) { if (error !== 'unwind') throw error; }
      ctx.showRuntime(nativeState());
      startTelemetry(ctx);
    },

    readEngineState() { return nativeState(); },
    readCaptureIntent() { return captureIntent; },
    pointerMove(detail) {
      if (!started) return;
      if (detail.captured === true) {
        engine?._Build_WasmPointerDelta?.(Math.round(detail.movementX || 0), Math.round(detail.movementY || 0));
        return;
      }
      if (nativeState() === 'gameplay') return;
      document.documentElement.dataset.buildPointer = `${Math.round(detail.x)},${Math.round(detail.y)}`;
      engine?._Build_WasmPointerMove?.(Math.round(detail.x), Math.round(detail.y));
    },
    pointerButton(detail) {
      if (!started || nativeState() === 'gameplay') return;
      if (detail.button === 0 && detail.pressed && nativeStateCode() === 0 && engine?._Duke_WasmMenuId?.() === 110) {
        captureIntent = true;
      }
      document.documentElement.dataset.buildPointerButton = `${detail.button}:${detail.pressed ? 'down' : 'up'}@${Math.round(detail.x)},${Math.round(detail.y)}`;
      engine?._Build_WasmPointerMove?.(Math.round(detail.x), Math.round(detail.y));
      engine?._Build_WasmPointerButton?.(detail.button, detail.pressed ? 1 : 0);
    },
    controllerFrame(detail) { controllerFrame(detail); },
    controllerChanged(detail) { if (detail.activeIndex == null || detail.selection === 'disabled') releaseController(); },
    captureLost() {
      if (started && nativeStateCode() === 1 && typeof engine?._Duke_WasmEnsureMenu === 'function') {
        engine._Duke_WasmEnsureMenu();
      }
      captureIntent = false;
    },
    inputCaptureChanged(captured) {
      document.documentElement.dataset.pointerLocked = String(captured);
      if (started && typeof engine?._Duke_WasmSetPointerLock === 'function') {
        engine._Duke_WasmSetPointerLock(captured ? 1 : 0);
      }
    }
  });
})();
