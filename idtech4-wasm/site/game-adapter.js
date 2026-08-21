(() => {
  'use strict';

  const profileArguments = Object.freeze({
    performance: ['+set', 'com_machineSpec', '1', '+set', 'r_multiSamples', '0', '+set', 'r_skipBump', '1'],
    high: ['+set', 'com_machineSpec', '3', '+set', 'r_multiSamples', '2', '+set', 'r_skipBump', '0'],
    ultra: ['+set', 'com_machineSpec', '3', '+set', 'image_useCompression', '0', '+set', 'image_usePrecompressedTextures', '1', '+set', 'r_multiSamples', '4']
  });
  const scancodes = Object.freeze({
    Escape: 41, Enter: 40, NumpadEnter: 88, Backspace: 42, Tab: 43, Space: 44,
    Minus: 45, Equal: 46, BracketLeft: 47, BracketRight: 48, Backslash: 49,
    Semicolon: 51, Quote: 52, Backquote: 53, Comma: 54, Period: 55, Slash: 56,
    CapsLock: 57, F1: 58, F2: 59, F3: 60, F4: 61, F5: 62, F6: 63,
    F7: 64, F8: 65, F9: 66, F10: 67, F11: 68, F12: 69,
    PrintScreen: 70, ScrollLock: 71, Pause: 72,
    Insert: 73, Home: 74, PageUp: 75, Delete: 76, End: 77, PageDown: 78,
    ArrowRight: 79, ArrowLeft: 80, ArrowDown: 81, ArrowUp: 82,
    NumLock: 83, NumpadDivide: 84, NumpadMultiply: 85, NumpadSubtract: 86,
    NumpadAdd: 87, Numpad1: 89, Numpad2: 90, Numpad3: 91, Numpad4: 92,
    Numpad5: 93, Numpad6: 94, Numpad7: 95, Numpad8: 96, Numpad9: 97,
    Numpad0: 98, NumpadDecimal: 99,
    ShiftLeft: 225, ShiftRight: 229, ControlLeft: 224, ControlRight: 228,
    AltLeft: 226, AltRight: 230
  });
  const engines = Object.freeze({
    doom3: { worker: '/d3-worker.js', label: 'Doom 3' },
    'doom3-mp': { worker: '/d3-worker.js', label: 'Doom 3 multiplayer' },
    roe: { worker: '/d3-worker.js', label: 'Resurrection of Evil' },
    quake4: { worker: '/q4-worker.js', label: 'Quake 4' },
    'quake4-mp': { worker: '/q4-worker.js', label: 'Quake 4 multiplayer' },
    prey: { worker: '/prey-worker.js', label: 'Prey' }
  });
  const controllerGameplayKeys = Object.freeze({
    forward: 26,
    backward: 22,
    left: 4,
    right: 7,
    jump: 44,
    crouch: 6,
    reload: 21,
    weapon: 20,
    previousWeapon: 47,
    nextWeapon: 48,
    scoreboard: 43,
    sprint: 225,
    melee: 9,
    menu: 41
  });
  const controllerMenuKeys = Object.freeze({
    forward: 82,
    backward: 81,
    left: 80,
    right: 79,
    accept: 40,
    back: 41
  });

  let worker = null;
  let ownerData = null;
  let started = false;
  let state = 'menu';
  let captured = false;
  let lastResize = null;
  let lifecycleBound = false;
  const controllerHeldKeys = new Set();
  const controllerHeldButtons = new Set();
  let controllerLookX = 0;
  let controllerLookY = 0;

  function keyScan(code) {
    if (scancodes[code]) return scancodes[code];
    if (/^Key[A-Z]$/.test(code)) return code.charCodeAt(3) - 61;
    if (/^Digit[1-9]$/.test(code)) return 30 + Number(code.slice(5)) - 1;
    if (code === 'Digit0') return 39;
    return 0;
  }

  function selectedPolicy(manifest, variant) {
    const selected = manifest.variants?.[variant];
    if (!selected) throw new Error(`idtech4 data policy has no ${variant} variant.`);
    return {
      namespace: selected.namespace || manifest.namespace,
      version: selected.version || manifest.version,
      files: selected.files
    };
  }

  function post(message) {
    if (worker) worker.postMessage(message);
  }

  function setControllerKey(scan, down) {
    if (!scan || controllerHeldKeys.has(scan) === down) return;
    if (down) controllerHeldKeys.add(scan); else controllerHeldKeys.delete(scan);
    post({ type: 'key', scan, key: 0, down, repeat: false });
  }

  function setControllerButton(button, down) {
    if (controllerHeldButtons.has(button) === down) return;
    if (down) controllerHeldButtons.add(button); else controllerHeldButtons.delete(button);
    post({ type: 'pointer-button', button, down });
  }

  function releaseController() {
    for (const scan of Array.from(controllerHeldKeys)) setControllerKey(scan, false);
    for (const button of Array.from(controllerHeldButtons)) setControllerButton(button, false);
    controllerLookX = 0;
    controllerLookY = 0;
  }

  function applyControllerKeys(actions, mapping) {
    const wanted = new Set();
    for (const [action, scan] of Object.entries(mapping)) {
      if (Number(actions[action]) >= 0.5) wanted.add(scan);
    }
    for (const scan of Array.from(controllerHeldKeys)) {
      if (!wanted.has(scan)) setControllerKey(scan, false);
    }
    for (const scan of wanted) setControllerKey(scan, true);
  }

  function bindPersistenceLifecycle() {
    if (lifecycleBound) return;
    lifecycleBound = true;
    const flush = () => { if (started) post({ type: 'persist' }); };
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush();
    });
    globalThis.addEventListener?.('pagehide', flush);
    globalThis.addEventListener?.('beforeunload', flush);
  }

  function bindInput(ctx) {
    document.addEventListener('keydown', event => {
      if (!started || event.ctrlKey || event.metaKey || event.altKey) return;
      const scan = keyScan(event.code);
      if (!scan) return;
      post({ type: 'key', scan, key: event.key.length === 1 ? event.key.charCodeAt(0) : 0, down: true, repeat: event.repeat });
      if (event.key.length === 1 && !event.repeat) post({ type: 'text', codepoint: event.key.charCodeAt(0) });
      if (['Escape', 'Enter', 'Tab', 'Backspace', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(event.key)) event.preventDefault();
    }, true);
    document.addEventListener('keyup', event => {
      if (!started) return;
      const scan = keyScan(event.code);
      if (scan) post({ type: 'key', scan, key: event.key.length === 1 ? event.key.charCodeAt(0) : 0, down: false });
    }, true);
    ctx.elements.canvas.addEventListener('pointermove', event => {
      if (document.pointerLockElement === ctx.elements.canvas) {
        post({ type: 'pointer-relative', dx: event.movementX, dy: event.movementY });
      }
    });
  }

  globalThis.WasmGameAdapter = Object.freeze({
    async init(ctx) {
      const descriptor = engines[ctx.variant];
      if (!descriptor) throw new Error(`Unsupported id Tech 4 variant: ${ctx.variant}`);
      const manifest = await fetch('/wasm-game-data.json', { cache: 'no-store' }).then(response => {
        if (!response.ok) throw new Error(`id Tech 4 data policy failed with HTTP ${response.status}.`);
        return response.json();
      });
      const policy = selectedPolicy(manifest, ctx.variant);
      ownerData = ctx.framework.createOwnerDataSet({
        namespace: policy.namespace,
        version: policy.version,
        files: policy.files.map(spec => ({ ...spec, mountName: spec.mountName || spec.path, validateCached: false }))
      });
      ctx.elements.canvas.id = 'canvas';
      ctx.elements.canvas.addEventListener('contextmenu', event => event.preventDefault());
      bindInput(ctx);
      bindPersistenceLifecycle();
    },

    async start(ctx) {
      if (started) return;
      const descriptor = engines[ctx.variant];
      void ctx.shell.resumeAudio();
      ctx.setLoading(`Preparing ${descriptor.label}…`, '', 5);
      const data = await ctx.dataClient.load(ownerData, {
        onProgress(detail) {
          if (detail.phase === 'checking-cache') ctx.setLoading(`Preparing ${descriptor.label}…`);
          if (detail.phase === 'downloading') {
            const percent = detail.total ? Math.floor(detail.received * 100 / detail.total) : 0;
            ctx.setLoading(`Preparing ${descriptor.label}…`, `${percent}%`, Math.min(80, 5 + percent * 0.7));
          }
          if (detail.phase === 'restored') ctx.setLoading(`Preparing ${descriptor.label}…`);
        }
      });
      document.documentElement.dataset.wasmDataSource = data.entries.every(entry => entry.cached) ? 'cache' : 'container';
      ctx.setLoading(`Starting ${descriptor.label}…`, '', 90);
      const canvas = ctx.elements.canvas;
      const offscreen = canvas.transferControlToOffscreen();
      const preferences = ctx.preferences.values();
      const width = Math.max(640, Number(lastResize?.requestedWidth || canvas.width || 1280));
      const height = Math.max(480, Number(lastResize?.requestedHeight || canvas.height || 720));
      worker = new Worker(descriptor.worker);
      worker.onmessage = event => {
        const message = event.data || {};
        if (message.type === 'log') ctx.log(message.text);
        if (message.type === 'status') ctx.setLoading(`Preparing ${descriptor.label}…`);
        if (message.type === 'persistence-ready') ctx.log(`Save/config persistence restored at ${message.root}.`);
        if (message.type === 'engine-state' || message.type === 'ready') {
          if (state !== message.state) releaseController();
          state = message.state || 'menu';
          if (message.type === 'ready') ctx.setLoading('', '', 100);
          ctx.showRuntime(state);
        }
        if (message.type === 'error') {
          state = 'crashed';
          ctx.log(`ERROR: ${message.text}`);
          ctx.setEngineState('crashed');
          ctx.setStatus(message.text, true);
        }
      };
      worker.onerror = event => {
        state = 'crashed';
        ctx.setEngineState('crashed');
        ctx.setStatus(`${descriptor.label} worker failed: ${event.message}`, true);
      };
      started = true;
      worker.postMessage({
        type: 'start', canvas: offscreen, variant: ctx.variant,
        entries: data.entries.map(entry => ({ path: entry.policy.mountName || entry.policy.path, file: entry.file })),
        width, height, playerName: preferences.playerName,
        engineArguments: profileArguments[preferences.qualityProfile] || profileArguments.high,
        persistence: {
          namespace: ctx.persistence.namespace,
          root: ctx.persistence.root,
          debounceMs: Number(ctx.config.persistence.debounceMs ?? 750),
          intervalMs: Number(ctx.config.persistence.intervalMs ?? 5000),
          requestDurability: ctx.config.persistence.requestDurability !== false,
          frameworkScript: '/shared-shell/wasm-game-framework.js',
          frameworkVersion: '0.9.6'
        }
      }, [offscreen]);
    },

    readEngineState() { return state; },
    readCaptureIntent() { return state === 'gameplay'; },
    resize(detail) {
      lastResize = detail;
      if (started) post({ type: 'resize', width: detail.requestedWidth, height: detail.requestedHeight });
    },
    pointerMove(detail) {
      if (started && !captured) post({ type: 'pointer-absolute', x: detail.x, y: detail.y });
    },
    pointerButton(detail) { if (started) post({ type: 'pointer-button', button: detail.button, down: detail.pressed, x: detail.x, y: detail.y }); },
    controllerFrame(detail) {
      if (!started || !detail.actions) return;
      const actions = detail.actions;
      if (state === 'gameplay') {
        applyControllerKeys(actions, controllerGameplayKeys);
        setControllerButton(0, Number(actions.attack) >= 0.5);
        setControllerButton(2, Number(actions.altAttack) >= 0.5);
        const scale = Math.max(1, Number(detail.deltaMs) || 16.667) * 0.45;
        controllerLookX += Number(actions.lookX || 0) * scale;
        controllerLookY += Number(actions.lookY || 0) * scale;
        const dx = Math.trunc(controllerLookX);
        const dy = Math.trunc(controllerLookY);
        controllerLookX -= dx;
        controllerLookY -= dy;
        if (dx || dy) post({ type: 'pointer-relative', dx, dy });
        return;
      }
      setControllerButton(0, false);
      setControllerButton(2, false);
      applyControllerKeys({
        forward: actions.forward,
        backward: actions.backward,
        left: actions.left,
        right: actions.right,
        accept: Math.max(Number(actions.jump) || 0, Number(actions.attack) || 0),
        back: Math.max(Number(actions.crouch) || 0, Number(actions.menu) || 0)
      }, controllerMenuKeys);
    },
    controllerChanged() { releaseController(); },
    inputCaptureChanged(nextCaptured) {
      captured = Boolean(nextCaptured);
      if (started) post({ type: 'capture', captured });
    },
    captureLost() { if (started) post({ type: 'open-menu' }); },
    preferencesChanged(values) {
      if (started) post({ type: 'preferences', playerName: values.playerName, engineArguments: profileArguments[values.qualityProfile] || profileArguments.high });
    }
  });
})();
