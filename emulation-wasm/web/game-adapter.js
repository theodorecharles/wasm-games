(function () {
  'use strict';

  const runtime = {
    state: 'launcher',
    stateBeforeContextLoss: 'launcher',
    module: null,
    context: null,
    dataManifest: null,
    controllerProfile: null,
    pressedActions: new Set(),
    nativeLog: [],
    loadedScripts: new Map(),
    telemetryTimer: 0,
    pageHideInstalled: false
  };

  function logNative(context, ...values) {
    const line = values.map(value => String(value)).join(' ');
    if (line.startsWith('registerOrRemoveHandler: the target element for event handler registration does not exist')) return;
    runtime.nativeLog.push(line);
    if (runtime.nativeLog.length > 80) runtime.nativeLog.shift();
    context.log(line);
    console.debug(line);
  }

  const nativeButtons = Object.freeze({
    'nes.up': 0, 'snes.up': 0,
    'nes.down': 1, 'snes.down': 1,
    'nes.left': 2, 'snes.left': 2,
    'nes.right': 3, 'snes.right': 3,
    'nes.b': 4, 'snes.b': 4,
    'nes.a': 5, 'snes.a': 5,
    'snes.y': 6, 'snes.x': 7,
    'snes.l': 8, 'snes.r': 9,
    'nes.select': 12, 'snes.select': 12,
    'nes.start': 13, 'snes.start': 13,
    'ps1.up': 0, 'ps1.down': 1, 'ps1.left': 2, 'ps1.right': 3,
    'ps1.cross': 4, 'ps1.circle': 5, 'ps1.square': 6, 'ps1.triangle': 7,
    'ps1.l1': 8, 'ps1.r1': 9, 'ps1.l2': 10, 'ps1.r2': 11,
    'ps1.select': 12, 'ps1.start': 13, 'ps1.l3': 14, 'ps1.r3': 15
  });

  const nativeAxes = Object.freeze({
    'ps1.left.x': 0, 'ps1.left.y': 1,
    'ps1.right.x': 2, 'ps1.right.y': 3
  });

  function unavailable(context, reason) {
    const variant = context.variant || context.config.id;
    return new Error(reason || `${variant} native runtime has not reached its WebAssembly milestone.`);
  }

  async function loadControllerProfile(context) {
    const module = await import('/controller-profiles.mjs');
    return module.controllerProfileFor(context.variant);
  }

  async function loadDataManifest(context) {
    if (runtime.dataManifest) return runtime.dataManifest;
    const response = await fetch('/wasm-game-data.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Console-data manifest failed with HTTP ${response.status}.`);
    const root = await response.json();
    const selected = root.variants?.[context.variant];
    if (!selected || !Array.isArray(selected.files)) {
      throw new Error(`Console-data manifest has no ${context.variant} policy.`);
    }
    runtime.dataManifest = Object.freeze({
      namespace: String(selected.namespace || `${root.namespace}-${context.variant}`),
      version: String(selected.version || root.version),
      files: Object.freeze(selected.files.map(file => Object.freeze({ ...file })))
    });
    return runtime.dataManifest;
  }

  async function loadFixedData(context) {
    const policy = await loadDataManifest(context);
    if (!policy.files.length) return null;
    const dataSet = context.framework.createOwnerDataSet(policy);
    return context.dataClient.load(dataSet, {
      onProgress(detail) {
        const count = Math.max(1, Number(detail.total) || 1);
        const index = Math.max(0, Number(detail.index) || 0);
        context.setLoading('Loading console firmware…', detail.name || '', 8 + Math.round((index / count) * 12));
      }
    });
  }

  async function mountPs1Firmware(context, fixedData) {
    if (context.variant !== 'ps1') return null;
    if (!fixedData || fixedData.entries.length !== 1) {
      throw new Error('PlayStation requires one validated 512 KiB firmware image.');
    }
    const source = fixedData.entries[0];
    const aliases = ['scph5500.bin', 'scph5501.bin', 'scph5502.bin'].map(mountName => ({
      ...source, mountName
    }));
    return context.framework.mountOwnerFiles(runtime.module, aliases, {
      root: '/firmware', preservePaths: false, mode: 'memfs'
    });
  }

  function nativeInput(action, value, pressed) {
    if (!action) return;
    if (pressed || Math.abs(Number(value) || 0) > 0.0001) runtime.pressedActions.add(action);
    else runtime.pressedActions.delete(action);
    if (!runtime.module) return;
    const axis = nativeAxes[action];
    if (axis !== undefined && typeof runtime.module._Emulation_BrowserSetAxis === 'function') {
      runtime.module._Emulation_BrowserSetAxis(0, axis, Math.max(-1, Math.min(1, Number(value) || 0)));
      return;
    }
    const button = nativeButtons[action];
    if (button === undefined || typeof runtime.module._Emulation_BrowserSetButton !== 'function') return;
    runtime.module._Emulation_BrowserSetButton(0, button, pressed ? Math.max(0, Number(value) || 0) : 0);
  }

  function releaseControllerActions() {
    runtime.module?._Emulation_BrowserReleaseAll?.();
    runtime.pressedActions.clear();
  }

  function mapControllerFrame(detail) {
    if (runtime.state !== 'gameplay') return;
    const profile = runtime.controllerProfile;
    const gamepad = detail?.gamepad;
    if (!profile || !gamepad) return;
    for (const [index, control] of Object.entries(profile.gamepad.axes)) {
      const value = Math.max(-1, Math.min(1, Number(gamepad.axes[Number(index)]) || 0));
      nativeInput(profile.actions[control], value, Math.abs(value) > 0.0001);
    }
    for (const [index, control] of Object.entries(profile.gamepad.buttons)) {
      const button = gamepad.buttons[Number(index)] || { pressed: false, value: 0 };
      const value = profile.preserveAnalogButtonValues ? Number(button.value) || 0 : (button.pressed ? 1 : 0);
      nativeInput(profile.actions[control], value, Boolean(button.pressed));
    }
  }

  function keyboardInput(event, pressed) {
    if (runtime.state !== 'gameplay' || event.repeat) return;
    const action = runtime.controllerProfile?.keyboard?.[event.code];
    if (!action) return;
    nativeInput(action, pressed ? 1 : 0, pressed);
    event.preventDefault();
  }

  function loadScript(source) {
    const url = new URL(String(source), location.href).href;
    if (!runtime.loadedScripts.has(url)) {
      runtime.loadedScripts.set(url, new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = url;
        script.onload = resolve;
        script.onerror = () => reject(new Error(`Could not load native runtime ${source}.`));
        document.head.appendChild(script);
      }));
      runtime.loadedScripts.get(url).catch(() => runtime.loadedScripts.delete(url));
    }
    return runtime.loadedScripts.get(url);
  }

  function ensureDirectory(FS, directory) {
    if (typeof FS.mkdirTree === 'function') return FS.mkdirTree(directory);
    if (typeof FS.createPath !== 'function') throw new Error(`Native filesystem cannot create ${directory}.`);
    let parent = '/';
    for (const segment of directory.split('/').filter(Boolean)) {
      try { FS.createPath(parent, segment, true, true); } catch (error) {
        try { FS.stat(`${parent === '/' ? '' : parent}/${segment}`); } catch (_) { throw error; }
      }
      parent = `${parent === '/' ? '' : parent}/${segment}` || '/';
    }
  }

  function publishTelemetry() {
    const module = runtime.module;
    if (!module) return;
    const html = document.documentElement;
    html.dataset.emulationState = runtime.state;
    html.dataset.emulationVideoWidth = String(module._Emulation_BrowserVideoWidth?.() || 0);
    html.dataset.emulationVideoHeight = String(module._Emulation_BrowserVideoHeight?.() || 0);
    html.dataset.emulationFrameCount = String(Math.floor(module._Emulation_BrowserFrameCount?.() || 0));
    html.dataset.emulationAudioFrameCount = String(Math.floor(module._Emulation_BrowserAudioFrameCount?.() || 0));
    html.dataset.emulationAudioQueued = String(module._Emulation_BrowserAudioQueued?.() || 0);
    const audioContext = module.SDL2?.audioContext;
    if (audioContext) html.dataset.audioState = audioContext.state;
  }

  function startTelemetry() {
    clearInterval(runtime.telemetryTimer);
    publishTelemetry();
    runtime.telemetryTimer = setInterval(publishTelemetry, 500);
  }

  async function resumeNativeAudio(module) {
    const context = module?.SDL2?.audioContext;
    if (!context || typeof context.resume !== 'function' || context.state === 'running') return;
    await new Promise(resolve => {
      let timer = 0;
      const finish = () => {
        if (timer) clearTimeout(timer);
        timer = 0;
        resolve();
      };
      timer = setTimeout(finish, 250);
      Promise.resolve(context.resume()).then(finish, finish);
    });
  }

  function controlledShutdown() {
    if (!runtime.module || runtime.state === 'stopped') return;
    runtime.module._Emulation_BrowserShutdown?.();
    runtime.context?.persistence?.markDirty();
    void runtime.context?.persistence?.save?.({ force: true });
    runtime.state = 'stopped';
    releaseControllerActions();
    publishTelemetry();
    globalThis.EmulationWasmModule = undefined;
  }

  globalThis.WasmGameAdapter = Object.freeze({
    async init(context) {
      runtime.context = context;
      await loadDataManifest(context);
      runtime.controllerProfile = await loadControllerProfile(context);
      context.elements.canvas.addEventListener('contextmenu', event => event.preventDefault());
      globalThis.addEventListener('keydown', event => keyboardInput(event, true));
      globalThis.addEventListener('keyup', event => keyboardInput(event, false));
      globalThis.addEventListener('blur', releaseControllerActions);
      if (!runtime.pageHideInstalled) {
        globalThis.addEventListener('pagehide', controlledShutdown);
        runtime.pageHideInstalled = true;
      }
    },

    controllerProfile() {
      return runtime.controllerProfile;
    },

    controllerFrame(detail) {
      mapControllerFrame(detail);
    },

    controllerChanged(detail, context) {
      if (detail?.selection === 'disabled' || detail?.activeIndex == null) releaseControllerActions();
      const active = detail?.controllers?.find(controller => controller.index === detail.activeIndex);
      context.log(active ? `[emulation-wasm] controller active: ${active.id}` : '[emulation-wasm] controller inactive');
    },

    persistenceChanged(detail, context) {
      const failed = detail?.mounts?.find(mount => mount.lastError);
      if (failed) context.log(`[emulation-wasm] persistence error: ${failed.lastError}`);
    },

    async start(context) {
      runtime.state = 'loading';
      runtime.nativeLog.length = 0;
      context.setEngineState('loading');
      context.setLoading('Preparing console runtime…', 'Checking native runtime and selected media.', 5);
      try {
        await context.shell.resumeAudio();
        if (context.config.runtimeReady !== true) throw unavailable(context);
        if (context.config.runtime?.requiresRandomAccessMedia) {
          throw unavailable(context,
            `${context.variant} requires the range-backed random-access media contract before it can start.`);
        }

        const fixedData = await loadFixedData(context);
        const media = await context.dataClient.media.load(undefined, {
          onProgress(detail) {
            const count = Math.max(1, Number(detail.total) || 1);
            const index = Math.max(0, Number(detail.index) || 0);
            context.setLoading('Loading selected media…', detail.name || '', 10 + Math.round((index / count) * 35));
          }
        });
        const native = context.config.runtime;
        await loadScript(native.script);
        const factory = globalThis[native.factory];
        if (typeof factory !== 'function') throw new Error(`${native.script} did not register ${native.factory}().`);
        let presentFirstFrame;
        const firstFrame = new Promise(resolve => { presentFirstFrame = resolve; });
        runtime.module = await factory({
          noInitialRun: true,
          canvas: context.elements.canvas,
          locateFile: name => name.endsWith('.wasm') ? native.wasm : new URL(name, native.script).href,
          print: (...values) => logNative(context, ...values),
          printErr: (...values) => logNative(context, ...values),
          emulationFramePresented(detail) {
            document.documentElement.dataset.emulationCoreWidth = String(detail.width);
            document.documentElement.dataset.emulationCoreHeight = String(detail.height);
            document.documentElement.dataset.emulationCoreAspect = String(detail.aspect);
            presentFirstFrame(detail);
          },
          emulationPersistenceChanged(immediate) {
            context.persistence.markDirty();
            if (immediate) void context.persistence.save({ force: true });
          }
        });
        if (!runtime.module?.FS || typeof runtime.module.callMain !== 'function') {
          throw new Error('Native runtime does not expose the required FS and callMain seams.');
        }
        globalThis.EmulationWasmModule = runtime.module;

        const persistent = await context.persistence.attach(runtime.module.FS, { root: context.persistence.root });
        for (const name of ['config', 'saves', 'states', 'screenshots']) {
          ensureDirectory(runtime.module.FS, `${persistent.root}/${name}`);
        }
        await mountPs1Firmware(context, fixedData);
        const mounted = await context.framework.mountOwnerFiles(runtime.module, media.entries, {
          root: '/media', preservePaths: true, mode: 'memfs',
          onProgress: detail => context.setLoading('Mounting selected media…', detail.path || '', 55)
        });
        const primary = `${mounted.root}/${media.primary}`;
        context.setLoading('Starting emulator core…', context.config.engine || context.variant, 80);
        context.showRuntime('loading');
        context.shell.resize?.();
        runtime.module.callMain([
          '--system', context.variant,
          '--media', primary,
          ...(context.variant === 'ps1' ? ['--firmware-root', '/firmware'] : []),
          '--persistent-root', persistent.root
        ]);
        if (runtime.module._Emulation_BrowserRuntimeState?.() !== 2) {
          const diagnostic = runtime.nativeLog.slice(-8).join('\n');
          throw new Error(diagnostic || 'Native core stopped before entering its frame loop.');
        }
        await resumeNativeAudio(runtime.module);
        context.shell.resize?.();
        await Promise.race([
          firstFrame,
          new Promise((_, reject) => setTimeout(() => reject(new Error('Native core produced no video frame.')), 15000))
        ]);
        runtime.state = 'gameplay';
        context.showRuntime('gameplay');
        requestAnimationFrame(() => context.shell.resize?.());
        startTelemetry();
        context.setLoading('Running', '', 100);
      } catch (error) {
        runtime.state = 'crashed';
        context.setEngineState('crashed');
        throw error;
      }
    },

    resize(detail) {
      if (!runtime.module) return;
      // The framework owns the 4:3 layout decision; this native-managed SDL
      // adapter applies that exact logical rectangle to the backing store.
      runtime.module.setCanvasSize?.(detail.cssWidth, detail.cssHeight, false);
      runtime.module._Emulation_BrowserResize?.(detail.cssWidth, detail.cssHeight);
      publishTelemetry();
    },

    readEngineState() {
      return runtime.state;
    },

    captureLost() { releaseControllerActions(); },
    inputCaptureChanged() {},
    preferencesChanged() {},
    contextLost() {
      runtime.stateBeforeContextLoss = runtime.state;
      releaseControllerActions();
      runtime.state = 'paused';
      runtime.module?._Emulation_BrowserReleaseAll?.();
    },
    contextRestored() {
      if (runtime.module && runtime.stateBeforeContextLoss === 'gameplay') runtime.state = 'gameplay';
    }
  });
})();
