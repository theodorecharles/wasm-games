(function () {
  'use strict';

  const runtime = {
    module: null, manifest: null, started: false, state: 'launcher',
    heldKeys: new Map(), heldButtons: new Map(), keyboardHeld: new Set(), mouseX: 0, mouseY: 0
  };
  const key = Object.freeze({
    enter: 13, escape: 27, space: 32, tab: 9, z: 122, x: 120,
    f6: 287, up: 273, down: 274, right: 275, left: 276,
    shift: 304, ctrl: 306, alt: 308
  });
  const controllerMaps = Object.freeze({
    jill1: { jump: key.shift, attack: key.alt, weapon: key.enter, menu: key.escape },
    jill2: { jump: key.shift, attack: key.alt, weapon: key.enter, menu: key.escape },
    jill3: { jump: key.shift, attack: key.alt, weapon: key.enter, menu: key.escape },
    jazz: { jump: key.alt, attack: key.space, weapon: key.ctrl, sprint: key.shift, menu: key.escape },
    duke1: { jump: key.ctrl, attack: key.alt, weapon: key.enter, menu: key.escape },
    duke2: { jump: key.ctrl, attack: key.alt, weapon: key.enter, menu: key.escape },
    gta: {
      jump: key.space, attack: key.ctrl, weapon: key.enter,
      previousWeapon: key.z, nextWeapon: key.x, scoreboard: key.tab, menu: key.f6
    },
    nfs: { jump: key.space, weapon: key.enter, scoreboard: key.tab, menu: key.escape },
    simcity2000: { weapon: key.enter, menu: key.escape }
  });

  const browserKeys = Object.freeze({
    Backspace: key.backspace, Tab: key.tab, Enter: key.enter, NumpadEnter: key.enter,
    Escape: key.escape, Space: key.space, ArrowUp: key.up, ArrowDown: key.down,
    ArrowLeft: key.left, ArrowRight: key.right, ShiftLeft: key.shift, ShiftRight: key.shift,
    ControlLeft: key.ctrl, ControlRight: key.ctrl, AltLeft: key.alt, AltRight: key.alt,
    F1: 282, F2: 283, F3: 284, F4: 285, F5: 286, F6: 287,
    F7: 288, F8: 289, F9: 290, F10: 291, F11: 292, F12: 293,
    Home: 278, End: 279, PageUp: 280, PageDown: 281, Insert: 277, Delete: 127,
    Minus: 45, Equal: 61, BracketLeft: 91, BracketRight: 93, Backslash: 92,
    Semicolon: 59, Quote: 39, Backquote: 96, Comma: 44, Period: 46, Slash: 47
  });

  function browserKey(event) {
    if (browserKeys[event.code] != null) return browserKeys[event.code];
    if (/^Key[A-Z]$/.test(event.code)) return event.code.charCodeAt(3) + 32;
    if (/^Digit[0-9]$/.test(event.code)) return event.code.charCodeAt(5);
    return 0;
  }

  async function sha256Hex(file) {
    const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  }

  async function loadManifest(context) {
    const response = await fetch('/wasm-game-data.json', { cache: 'no-store', credentials: 'same-origin' });
    if (!response.ok) throw new Error(`DOS data policy failed with HTTP ${response.status}.`);
    const root = await response.json();
    const selected = root.variants?.[context.variant];
    if (!selected || !Array.isArray(selected.files) || !selected.files.length || !selected.executable ||
        !Array.isArray(selected.commands) || !selected.commands.length ||
        !selected.commands.every(command => typeof command === 'string' && command.trim()) ||
        !Array.isArray(selected.dosboxArguments) ||
        !selected.dosboxArguments.every(argument => typeof argument === 'string' && argument.trim())) {
      throw new Error(`DOS data policy has no ${context.variant} definition.`);
    }
    runtime.manifest = selected;
    return selected;
  }

  function ownerData(context) {
    const manifest = runtime.manifest;
    return context.framework.createOwnerDataSet({
      namespace: manifest.namespace,
      version: manifest.version,
      files: manifest.files.map(spec => ({
        key: spec.key,
        name: spec.name,
        names: spec.names,
        size: spec.size,
        mountName: spec.mountName || spec.name,
        async validate(file) {
          context.setLoading(`Preparing ${context.config.title}…`);
          if (await sha256Hex(file) !== spec.sha256) throw new Error(`${spec.name} failed SHA-256 verification.`);
        }
      }))
    });
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

  async function loadEngine(context) {
    if (runtime.module) return runtime.module;
    await loadScript('/dosbox.js');
    if (typeof globalThis.createDosBoxModule !== 'function') throw new Error('DOSBox module factory was not exported.');
    runtime.module = await globalThis.createDosBoxModule({
      canvas: context.elements.canvas,
      noInitialRun: true,
      locateFile: path => `/${path}`,
      print: (...args) => context.log(`[DOSBox] ${args.join(' ')}`),
      printErr: (...args) => context.log(`[DOSBox] ${args.join(' ')}`),
      setStatus: message => { if (message) context.setLoading(`Preparing ${context.config.title}…`); },
      onAbort: reason => {
        runtime.state = 'crashed';
        context.log(`DOSBox stopped: ${reason}`);
        context.showRuntime('crashed');
      }
    });
    return runtime.module;
  }

  function trackPersistentWrites(FS, root, persistence) {
    if (runtime.persistenceTracked || typeof FS.write !== 'function') return;
    runtime.persistenceTracked = true;
    const originalWrite = FS.write.bind(FS);
    FS.write = (stream, ...args) => {
      const written = originalWrite(stream, ...args);
      const path = String(stream?.path ||
        (stream?.node && typeof FS.getPath === 'function' ? FS.getPath(stream.node) : ''));
      if (path === root || path.startsWith(`${root}/`)) persistence.markDirty();
      return written;
    };
  }

  function makeDosDriveWritable(FS, root, manifest) {
    for (const spec of manifest.files) {
      const requested = String(spec.mountName || spec.name).replaceAll('\\', '/');
      const relative = manifest.preservePaths === true ? requested : requested.split('/').at(-1);
      FS.chmod(`${root}/${relative}`, 0o600);
    }
  }

  function nativeKey(code, pressed) {
    runtime.module?._DOSBox_WasmControllerKey?.(code, pressed ? 1 : 0);
  }

  function releaseKeyboard() {
    for (const code of runtime.keyboardHeld) nativeKey(code, false);
    runtime.keyboardHeld.clear();
  }

  function keyboardEvent(event, pressed) {
    const code = browserKey(event);
    if (!code || !runtime.started || (pressed && event.repeat)) return;
    if (pressed) {
      if (runtime.keyboardHeld.has(code)) return;
      runtime.keyboardHeld.add(code);
    } else {
      if (!runtime.keyboardHeld.has(code)) return;
      runtime.keyboardHeld.delete(code);
    }
    nativeKey(code, pressed);
    event.stopImmediatePropagation();
    event.preventDefault();
  }

  function releaseController() {
    for (const [code, pressed] of runtime.heldKeys) if (pressed) nativeKey(code, false);
    for (const [button, pressed] of runtime.heldButtons) {
      if (pressed) runtime.module?._DOSBox_WasmControllerButton?.(button, 0);
    }
    runtime.heldKeys.clear();
    runtime.heldButtons.clear();
    runtime.mouseX = 0;
    runtime.mouseY = 0;
  }

  function setHeld(map, value, send) {
    const wasDown = runtime.heldKeys.get(map) === true;
    const isDown = wasDown ? value > 0.35 : value >= 0.55;
    if (wasDown === isDown) return;
    runtime.heldKeys.set(map, isDown);
    send(map, isDown);
  }

  function controllerFrame(detail, context) {
    if (!runtime.started || !detail?.actions) return;
    const actions = detail.actions;
    const desired = new Map([
      [key.up, Number(actions.forward) || 0], [key.down, Number(actions.backward) || 0],
      [key.left, Number(actions.left) || 0], [key.right, Number(actions.right) || 0]
    ]);
    for (const [action, code] of Object.entries(controllerMaps[context.variant])) {
      desired.set(code, Math.max(desired.get(code) || 0, Number(actions[action]) || 0));
    }
    for (const code of new Set([...runtime.heldKeys.keys(), ...desired.keys()])) {
      setHeld(code, desired.get(code) || 0, nativeKey);
    }
    if (context.variant !== 'simcity2000') return;
    for (const [button, value] of [[0, Math.max(Number(actions.jump) || 0, Number(actions.attack) || 0)],
      [1, Number(actions.altAttack) || 0]]) {
      const wasDown = runtime.heldButtons.get(button) === true;
      const isDown = wasDown ? value > 0.35 : value >= 0.55;
      if (wasDown !== isDown) {
        runtime.heldButtons.set(button, isDown);
        runtime.module?._DOSBox_WasmControllerButton?.(button, isDown ? 1 : 0);
      }
    }
    const deltaMs = Math.max(0, Math.min(100, Number(detail.deltaMs) || 16.667));
    runtime.mouseX += (Number(actions.lookX) || 0) * deltaMs * 0.5;
    runtime.mouseY += (Number(actions.lookY) || 0) * deltaMs * 0.5;
    const dx = Math.trunc(runtime.mouseX);
    const dy = Math.trunc(runtime.mouseY);
    runtime.mouseX -= dx;
    runtime.mouseY -= dy;
    if (dx || dy) runtime.module?._DOSBox_WasmControllerMouse?.(dx, dy);
  }

  function progress(context, detail) {
    const message = `Preparing ${context.config.title}…`;
    if (detail.phase === 'checking-cache') context.setLoading(message);
    if (detail.phase === 'downloading') {
      const percent = detail.total ? Math.floor(detail.received * 100 / detail.total) : 0;
      context.setLoading(message, `${percent}%`);
    }
    if (detail.phase === 'restored') context.setLoading(message);
  }

  globalThis.WasmGameAdapter = Object.freeze({
    async init(context) {
      await loadManifest(context);
      context.elements.canvas.addEventListener('contextmenu', event => event.preventDefault());
      // Explicitly queue browser key state into native DOSBox instead of
      // depending on generated SDL DOM-listener ordering.
      context.elements.canvas.addEventListener('keydown', event => keyboardEvent(event, true), true);
      context.elements.canvas.addEventListener('keyup', event => keyboardEvent(event, false), true);
      context.elements.canvas.addEventListener('blur', releaseKeyboard);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') releaseKeyboard();
      });
    },

    async start(context) {
      if (runtime.started) return;
      runtime.started = true;
      runtime.state = 'loading';
      context.setEngineState('loading');
      try {
        await context.shell.resumeAudio();
        const preparing = `Preparing ${context.config.title}…`;
        context.setLoading(preparing, '', 5);
        const prepared = await context.dataClient.load(ownerData(context), {
          onProgress: detail => progress(context, detail)
        });
        context.setLoading(preparing, '', 55);
        const module = await loadEngine(context);
        context.setLoading(preparing, '', 72);
        await context.persistence.attach(module.FS, { root: context.persistence.root });
        trackPersistentWrites(module.FS, context.persistence.root, context.persistence);
        module.ccall('DOSBox_WasmSetHome', null, ['string'], [context.persistence.root]);
        const gameRoot = `${context.persistence.root}/game`;
        await context.framework.mountOwnerFiles(module, prepared, {
          root: gameRoot,
          mode: 'memfs',
          preservePaths: runtime.manifest.preservePaths === true,
          onProgress(detail) {
            if (detail.phase === 'mounting' && detail.total) {
              context.setLoading(preparing, `${Math.floor(detail.copied * 100 / detail.total)}%`,
                72 + detail.copied * 20 / detail.total);
            }
          }
        });
        makeDosDriveWritable(module.FS, gameRoot, runtime.manifest);
        module.FS.chdir(gameRoot);
        context.setLoading(`Starting ${context.config.title}…`, '', 98);
        const commands = runtime.manifest.commands.map(command =>
          command.replaceAll('/game', gameRoot));
        try {
          module.callMain([
            ...runtime.manifest.dosboxArguments,
            '-userconf',
            ...commands.flatMap(command => ['-c', command])
          ]);
        } catch (error) {
          if (error !== 'unwind') throw error;
        }
        const width = module._DOSBox_WasmCanvasWidth?.() || context.elements.canvas.width;
        const height = module._DOSBox_WasmCanvasHeight?.() || context.elements.canvas.height;
        if (width <= 0 || height <= 0) throw new Error('DOSBox did not create a drawable video surface.');
        setTimeout(() => context.log(`[DOSBox] Browser loop diagnostics: ` +
          `${module._DOSBox_WasmMachineSlices?.() || 0} machine slices, ` +
          `${module._DOSBox_WasmAudioCallbacks?.() || 0} audio callbacks.`), 1000);
        runtime.state = 'gameplay';
        context.showRuntime('gameplay');
        context.elements.canvas.focus();
      } catch (error) {
        runtime.started = false;
        if (runtime.state !== 'crashed') runtime.state = 'launcher';
        throw error;
      }
    },

    readEngineState() { return runtime.state; },
    controllerFrame(detail, context) { controllerFrame(detail, context); },
    controllerChanged(detail) {
      if (!detail?.connected || detail.selection === 'disabled' || detail.activeIndex == null) releaseController();
    }
  });
})();
