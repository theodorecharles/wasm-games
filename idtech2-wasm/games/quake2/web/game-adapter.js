(() => {
  'use strict';

  let engine = null;
  let ownerData = null;
  let reportedState = 'menu';
  let qualityController = null;
  let telemetryTimer = 0;
  let lastEscapeAt = 0;
  let lastConfigWriteAt = 0;
  let started = false;
  let controllerIndex = null;
  let controllerState = 'menu';
  let launchMode = 'single';
  let deathmatchButton = null;
  let wakeClient = null;
  let gameVariant = 'quake2';
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
    nativeKey.mouse2, nativeKey.mouse1, nativeKey.tab, nativeKey.escape, nativeKey.shift, 101
  ]);
  const controllerMenuKeys = Object.freeze([
    nativeKey.up, nativeKey.down, nativeKey.left, nativeKey.right, nativeKey.enter, nativeKey.escape,
    0, 0, 0, 0, 0, 0, 0, nativeKey.escape, 0, 0
  ]);
  const expansionByVariant = Object.freeze({
    'quake2-xatrix': 'xatrix',
    'quake2-rogue': 'rogue'
  });
  const expansionStartMap = Object.freeze({ xatrix: 'xswamp', rogue: 'rbase1' });
  const expansionDeathmatchMap = Object.freeze({ xatrix: 'xdm1', rogue: 'rdm1' });

  function websocketUrl(pathname) {
    const url = new URL(String(pathname || '/ws/quake2'), location.href);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    return url.href;
  }

  function installLaunchButtons(ctx) {
    const form = ctx.elements.form;
    const play = ctx.elements.play;
    if (!form || !play || deathmatchButton) return;
    play.textContent = 'New Game';
    play.addEventListener('click', () => { launchMode = 'single'; });
    const deathmatch = document.createElement('button');
    deathmatch.id = 'join-deathmatch';
    deathmatch.type = 'button';
    deathmatch.textContent = 'Join Deathmatch';
    deathmatch.hidden = play.hidden;
    deathmatch.disabled = play.disabled;
    deathmatch.addEventListener('click', () => {
      if (deathmatch.disabled || started) return;
      launchMode = 'deathmatch';
      form.requestSubmit(play);
    });
    play.insertAdjacentElement('afterend', deathmatch);
    const mirror = () => {
      deathmatch.hidden = play.hidden;
      deathmatch.disabled = play.disabled || started;
    };
    if (typeof MutationObserver === 'function') {
      new MutationObserver(mirror).observe(play, {
        attributes: true, attributeFilter: ['disabled', 'hidden']
      });
    }
    deathmatchButton = deathmatch;
  }

  function nativeState() {
    if (!engine || typeof engine._Q2Web_RuntimeState !== 'function') return 'menu';
    return ['menu', 'gameplay', 'paused', 'debrief', 'loading'][engine._Q2Web_RuntimeState()] || 'menu';
  }

  function captureIntent() {
    return Boolean(engine && typeof engine._Q2Web_CaptureIntent === 'function' && engine._Q2Web_CaptureIntent());
  }

  function synchronizeState(ctx, event, captureGameplay) {
    const state = nativeState();
    reportedState = state;
    const shouldCapture = captureGameplay && (state === 'gameplay' || (state === 'loading' && captureIntent()));
    if (state !== ctx.shell.engineState() || shouldCapture) {
      ctx.setEngineState(state, shouldCapture
        ? { capture: true, event }
        : undefined);
    }
    return state;
  }

  function safeName(value) {
    return String(value || '').replace(/[^A-Za-z0-9 _-]/g, '').trim().slice(0, 32) || 'Ranger';
  }

  function browserViewport() {
    const viewport = window.visualViewport;
    return {
      width: Math.max(640, Math.min(8192, Math.round(viewport ? viewport.width : window.innerWidth))),
      height: Math.max(360, Math.min(8192, Math.round(viewport ? viewport.height : window.innerHeight)))
    };
  }

  function graphicsArguments(profile, fps, viewport) {
    const profiles = {
      medium: ['+set', 'r_msaa_samples', '0', '+set', 'r_anisotropic', '2', '+set', 'r_shadows', '0', '+set', 'cl_particles', '0', '+set', 'cl_lights', '0'],
      high: ['+set', 'r_msaa_samples', '2', '+set', 'r_anisotropic', '8', '+set', 'r_shadows', '0', '+set', 'cl_particles', '1', '+set', 'cl_lights', '1'],
      ultra: ['+set', 'r_msaa_samples', '4', '+set', 'r_anisotropic', '16', '+set', 'r_shadows', '1', '+set', 'cl_particles', '1', '+set', 'cl_lights', '1']
    };
    return [
      '+set', 'vid_renderer', 'gles3',
      '+set', 'vid_fullscreen', '0',
      '+set', 'r_mode', '-1',
      '+set', 'r_customwidth', String(viewport.width),
      '+set', 'r_customheight', String(viewport.height),
      '+set', 'vid_maxfps', String(fps),
      ...(profiles[profile] || profiles.high)
    ];
  }

  async function sha256Hex(file) {
    if (!globalThis.crypto?.subtle) throw new Error('SHA-256 verification requires HTTPS or localhost.');
    const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  }

  async function loadEngineScript() {
    if (globalThis.createQuake2Module) return;
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = '/quake2.js?v=20260821-expansions3';
      script.onload = resolve;
      script.onerror = () => reject(new Error('Could not load quake2.js.'));
      document.head.appendChild(script);
    });
  }

  function releaseController() {
    controllerHeld.clear();
    if (started && typeof engine?._Q2Web_ControllerReleaseAll === 'function') {
      engine._Q2Web_ControllerReleaseAll();
    }
  }

  function writeConfiguration(ctx, flush) {
    if (!started || typeof engine?._Q2Web_WriteConfiguration !== 'function') return;
    engine._Q2Web_WriteConfiguration();
    lastConfigWriteAt = performance.now();
    if (flush) ctx.persistence.save().catch(error => ctx.log(`Quake II config flush failed: ${error.message || error}`));
  }

  function sendControllerFrame(detail) {
    if (!started || !detail?.actions || typeof engine?._Q2Web_ControllerKey !== 'function') return;
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
        engine._Q2Web_ControllerKey(key, 1);
      } else {
        controllerHeld.delete(name);
        engine._Q2Web_ControllerKey(heldKey, 0);
      }
    }
    if (state === 'gameplay' && typeof engine._Q2Web_ControllerLook === 'function') {
      const seconds = Math.max(0, Math.min(0.05, (Number(detail.deltaMs) || 0) / 1000));
      engine._Q2Web_ControllerLook(
        (Number(detail.actions.lookX) || 0) * 720 * seconds,
        (Number(detail.actions.lookY) || 0) * 720 * seconds
      );
    }
  }

  function startDynamicQuality(ctx, ceilingName, targetFps, enabled) {
    const levels = { medium: 0, high: 1, ultra: 2 };
    const profiles = ceilingName === 'ultra' ? ['ultra', 'high', 'medium'] :
      ceilingName === 'high' ? ['high', 'medium'] : ['medium'];
    qualityController?.stop();
    qualityController = ctx.framework.createQualityController({
      profiles,
      targetFps,
      enabled,
      apply(name, detail) {
        engine?._Q2Web_ApplyQuality(levels[name]);
        globalThis.__quake2Quality = { level: levels[name], name, targetFps, reason: detail.reason };
      },
      onSample(detail) {
        document.documentElement.dataset.quake2MeasuredFps = detail.fps.toFixed(1);
      }
    });
    qualityController.start();
  }

  function startTelemetry(ctx) {
    window.clearInterval(telemetryTimer);
    telemetryTimer = window.setInterval(() => {
      if (!engine) return;
      if (typeof engine._Q2Web_AudioCallbacks === 'function') {
        document.documentElement.dataset.quake2Audio = [
          engine._Q2Web_AudioCallbacks(),
          engine._Q2Web_AudioNonzeroCallbacks()
        ].join(',');
      }
      if (typeof engine._Q2Web_ControlsMask === 'function') {
        const mask = engine._Q2Web_ControlsMask();
        document.documentElement.dataset.quake2ControlsMask = String(mask);
        document.documentElement.dataset.quake2ControlsValid = String(mask === 255);
      }
      if (typeof engine._Q2Web_RenderWidth === 'function') {
        const renderWidth = engine._Q2Web_RenderWidth();
        const renderHeight = engine._Q2Web_RenderHeight();
        document.documentElement.dataset.quake2RenderSize = `${renderWidth}x${renderHeight}`;
      }
      if (typeof engine._Q2Web_ViewWidth === 'function') {
        document.documentElement.dataset.quake2View = [
          engine._Q2Web_ViewWidth(),
          engine._Q2Web_ViewHeight(),
          engine._Q2Web_FovX100() / 100,
          engine._Q2Web_FovY100() / 100
        ].join(',');
      }
      if (typeof engine._Q2Web_NetworkState === 'function') {
        document.documentElement.dataset.quake2Network = [
          engine._Q2Web_NetworkState(),
          engine._Q2Web_NetworkPacketsSent(),
          engine._Q2Web_NetworkPacketsReceived()
        ].join(',');
      }
      if (typeof engine._Q2Web_Connected === 'function') {
        document.documentElement.dataset.quake2Connected = String(Boolean(engine._Q2Web_Connected()));
        document.documentElement.dataset.quake2Pose = [
          engine._Q2Web_OriginX100() / 100,
          engine._Q2Web_OriginY100() / 100,
          engine._Q2Web_OriginZ100() / 100,
          engine._Q2Web_YawX100() / 100
        ].join(',');
      }
      if (performance.now() - lastConfigWriteAt >= 5000) writeConfiguration(ctx, false);
      const state = nativeState();
      if (state !== reportedState) {
        synchronizeState(ctx, null, false);
        engine._Q2Web_SetInputCaptured(ctx.shell.inputCaptured() ? 1 : 0);
      }
    }, 250);
  }

  globalThis.WasmGameAdapter = Object.freeze({
    async init(ctx) {
      // Emscripten's packaged SDL2 video backend targets "#canvas" for its
      // native window size, event, pointer-lock, and EGL surface calls.  The
      // framework has already retained this element by reference, so assign
      // the required selector before the modularized engine creates SDL.
      ctx.elements.canvas.id = 'canvas';
      gameVariant = String(ctx.variant || 'quake2');
      wakeClient = typeof ctx.framework.createWakeClient === 'function'
        ? ctx.framework.createWakeClient({
          statusUrl: '/status', wakeUrl: '/wake', interval: 250, timeout: 45000,
          onStatus(status) {
            if (launchMode !== 'deathmatch' || !status) return;
            document.documentElement.dataset.quake2ServerState = String(status.state || 'unknown');
            document.documentElement.dataset.quake2ServerPeers = String(status.peers || 0);
            document.documentElement.dataset.quake2ServerBots = String(status.bots || 0);
          }
        }) : null;
      installLaunchButtons(ctx);
      const manifest = await fetch('/wasm-game-data.json', { cache: 'no-store' }).then(response => {
        if (!response.ok) throw new Error(`Quake II data policy failed with HTTP ${response.status}.`);
        return response.json();
      });
      const policy = manifest.variants?.[gameVariant] || manifest.variants?.quake2 || manifest;
      ownerData = ctx.framework.createOwnerDataSet({
        namespace: policy.namespace || manifest.namespace,
        version: policy.version || manifest.version,
        files: policy.files.map(spec => ({
          ...spec,
          mountName: spec.name,
          validateCached: false,
          validate: async file => {
            ctx.setLoading('Preparing Quake II…');
            if (await sha256Hex(file) !== spec.sha256) throw new Error(`${spec.name} failed SHA-256 verification.`);
          }
        }))
      });
      ctx.elements.canvas.addEventListener('contextmenu', event => event.preventDefault());
      document.addEventListener('keyup', event => {
        if (!engine || (event.key !== 'Enter' && event.key !== 'Escape')) return;
        queueMicrotask(() => synchronizeState(ctx, event, true));
      });
      document.addEventListener('keydown', event => {
        if (event.key === 'Escape') lastEscapeAt = performance.now();
      }, true);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') writeConfiguration(ctx, true);
      });
      window.addEventListener?.('pagehide', () => writeConfiguration(ctx, true));
    },

    async start(ctx) {
      if (engine) return;
      void ctx.shell.resumeAudio();
      const preferences = ctx.preferences.values();
      const expansion = expansionByVariant[gameVariant] || '';
      document.documentElement.dataset.quake2Expansion = expansion || 'baseq2';
      const clientNumber = Math.max(1, Number(new URLSearchParams(location.search).get('client')) || 1);
      const name = launchMode === 'deathmatch'
        ? `Browser${clientNumber}`
        : safeName(preferences.playerName);
      const profile = preferences.qualityProfile;
      const fps = Number(preferences.targetFps) || 60;
      const viewport = browserViewport();
      ctx.setLoading('Preparing Quake II…', '', 5);
      const preparedData = await ctx.dataClient.load(ownerData, {
        onProgress(detail) {
          if (detail.phase === 'checking-cache') ctx.setLoading('Preparing Quake II…');
          if (detail.phase === 'downloading') {
            const percent = detail.total ? Math.floor(detail.received * 100 / detail.total) : 0;
            ctx.setLoading('Preparing Quake II…', `${percent}%`, Math.min(55, 5 + percent / 2));
          }
          if (detail.phase === 'restored') ctx.setLoading('Preparing Quake II…');
        }
      });
      document.documentElement.dataset.wasmDataSource = preparedData.entries.every(entry => entry.cached) ? 'cache' : 'container';
      let multiplayerServer = null;
      if (launchMode === 'deathmatch' || expansion) {
        if (!wakeClient) throw new Error('This framework build does not provide managed multiplayer wake support.');
        const deathmatch = launchMode === 'deathmatch';
        ctx.setLoading(deathmatch ? 'Waking Quake II deathmatch…' : 'Starting expansion campaign…',
          expansion
            ? `Starting the native ${expansion === 'xatrix' ? 'The Reckoning' : 'Ground Zero'} game server.`
            : 'Starting 3ZB2 with two server bots.', 56);
        multiplayerServer = await wakeClient.ensureRunning({
          engine: 'quake2', variant: gameVariant, expansion,
          mode: deathmatch ? 'deathmatch' : 'campaign',
          bots: expansion ? 0 : 2,
          map: expansion
            ? (deathmatch ? expansionDeathmatchMap[expansion] : expansionStartMap[expansion])
            : 'q2dm1'
        });
        document.documentElement.dataset.quake2Connect = String(multiplayerServer.connect || '');
        document.documentElement.dataset.quake2WsPath = String(multiplayerServer.wsPath || '');
      }
      ctx.setLoading('Loading Quake II engine…', '', 60);
      await loadEngineScript();
      const relayUrl = multiplayerServer ? websocketUrl(multiplayerServer.wsPath || '/ws/quake2') : '';
      engine = await globalThis.createQuake2Module({
        noInitialRun: true,
        canvas: ctx.elements.canvas,
        quake2OwnerData: preparedData,
        quake2Expansion: expansion,
        quake2WebSocketUrl: relayUrl,
        quake2PersistenceChanged(immediate) {
          ctx.persistence.markDirty();
          if (immediate) ctx.persistence.save().catch(error => ctx.log(`Quake II save flush failed: ${error.message || error}`));
        },
        print: value => { console.log('[Quake II WASM]', value); ctx.log(value); },
        printErr: value => { console.error('[Quake II WASM]', value); ctx.log(`ERROR: ${value}`); },
        setStatus: value => { if (value) ctx.setLoading('Loading Quake II engine…'); },
        onAbort(reason) {
          ctx.log(`Quake II stopped: ${reason}`);
          ctx.showRuntime('crashed');
        },
        onAssetError: error => ctx.log(error?.stack || error)
      });
      engine.quake2WebSocketUrl = relayUrl;
      await ctx.persistence.attach(engine.FS, { root: ctx.persistence.root });
      if (multiplayerServer && typeof engine._Q2Web_NetworkConnect === 'function') {
        engine._Q2Web_NetworkConnect();
      }
      try {
        const args = ['-datadir', '/data', '-userdir', ctx.persistence.root,
          '+set', 'name', name, ...graphicsArguments(profile, fps, viewport)];
        if (expansion) args.push('+set', 'game', expansion);
        if (multiplayerServer) {
          args.push('+connect', String(multiplayerServer.connect || '127.0.0.1:27910'));
          ctx.log(expansion
            ? `Campaign: connecting to the framework-managed ${expansion} game server through the datagram relay.`
            : 'Deathmatch: connecting to the framework-managed 3ZB2 server through the datagram relay.');
        }
        engine.callMain(args);
      } catch (error) {
        if (error !== 'unwind') throw error;
      }
      if (multiplayerServer && typeof engine._Q2Web_NetworkConnect === 'function') {
        engine._Q2Web_NetworkConnect();
      }
      started = true;
      controllerState = nativeState();
      ctx.showRuntime();
      ctx.shell.resize();
      reportedState = nativeState();
      ctx.setEngineState(reportedState);
      startDynamicQuality(ctx, profile, fps, Boolean(preferences.dynamicQuality));
      startTelemetry(ctx);
    },

    readEngineState() { return nativeState(); },
    readCaptureIntent() { return captureIntent(); },
    resize(detail) {
      if (!engine || typeof engine._Q2Web_ResizeViewport !== 'function') return;
      engine._Q2Web_ResizeViewport(detail.requestedWidth, detail.requestedHeight);
    },
    captureLost(_detail, ctx) {
      if (!engine) return;
      engine._Q2Web_SetInputCaptured(0);
      if (performance.now() - lastEscapeAt > 750) engine._Q2Web_EnsureMenu();
      synchronizeState(ctx, null, false);
    },
    inputCaptureChanged(captured) {
      if (engine) engine._Q2Web_SetInputCaptured(captured ? 1 : 0);
    },
    controllerFrame(detail) { sendControllerFrame(detail); },
    controllerChanged(detail) {
      const nextIndex = Number.isInteger(detail?.activeIndex) ? detail.activeIndex : null;
      if (detail?.selection === 'disabled' || nextIndex !== controllerIndex) releaseController();
      controllerIndex = nextIndex;
    }
  });
})();
