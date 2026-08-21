(function () {
  'use strict';

  const games = Object.freeze({
    doom: Object.freeze({
      label: 'Doom / Ultimate Doom', script: 'crispy-doom.js', factory: 'createCrispyDoom'
    }),
    doom2: Object.freeze({
      label: 'Doom II', script: 'crispy-doom.js', factory: 'createCrispyDoom'
    }),
    tnt: Object.freeze({
      label: 'Final Doom: TNT', script: 'crispy-doom.js', factory: 'createCrispyDoom'
    }),
    plutonia: Object.freeze({
      label: 'Final Doom: Plutonia', script: 'crispy-doom.js', factory: 'createCrispyDoom'
    }),
    heretic: Object.freeze({
      label: 'Heretic', script: 'crispy-heretic.js', factory: 'createCrispyHeretic'
    }),
    hexen: Object.freeze({
      label: 'Hexen', script: 'crispy-hexen.js', factory: 'createCrispyHexen'
    }),
    chex: Object.freeze({
      label: 'Chex Quest', script: 'crispy-doom.js', factory: 'createCrispyDoom'
    })
  });

  const profiles = Object.freeze({
    original: Object.freeze({
      label: 'Original', engine: 'crispy', displayMode: '4:3', pixelated: true,
      note: 'Chocolate-like 320×200 rendering, 35 Hz timing, and a contained 4:3 presentation.',
      config: Object.freeze([
        'crispy_hires 0', 'crispy_uncapped 0', 'crispy_vsync 0',
        'crispy_widescreen 0', 'crispy_smoothscaling 0',
        'crispy_freelook 0', 'crispy_mouselook 0'
      ])
    }),
    smooth: Object.freeze({
      label: 'Smooth', engine: 'crispy', displayMode: '4:3', pixelated: false,
      note: 'Crispy high-resolution rendering with uncapped interpolation in a contained 4:3 presentation.',
      config: Object.freeze([
        'crispy_hires 1', 'crispy_uncapped 1', 'crispy_vsync 0',
        'crispy_fpslimit 0', 'crispy_widescreen 0',
        'crispy_smoothscaling 1', 'crispy_freelook 0',
        'crispy_mouselook 0'
      ])
    }),
    modernized: Object.freeze({
      label: 'Modernized', engine: 'dsda', displayMode: 'dynamic', pixelated: false,
      note: 'DSDA-Doom renders at the native dynamic viewport with smooth presentation and a selectable ceiling up to 120 FPS.',
      config: Object.freeze([])
    })
  });

  const modernProfileVersion = 2;
  const modernSessionKeys = Object.freeze(new Set([
    'videomode', 'screen_resolution', 'custom_resolution',
    'use_fullscreen', 'exclusive_fullscreen', 'render_vsync',
    'uncapped_framerate', 'dsda_fps_limit', 'dsda_background_fps_limit',
    'integer_scaling', 'render_screen_multiply', 'render_aspect',
    'aspect_ratio_correction'
  ]));

  const runtime = {
    context: null,
    module: null,
    profile: 'smooth',
    started: false,
    state: 'menu',
    pollTimer: 0,
    diagnosticsInstalled: false,
    interactionInstalled: false,
    dataManifest: null,
    dataValidator: null,
    dataNamespace: '',
    dataVersion: '',
    lastEscapeAt: 0,
    captureUntil: 0,
    captureEvent: null,
    persistence: null,
    controllerHeld: new Map(),
    controllerButtons: new Map(),
    keyboardHeld: new Map(),
    pointerButtons: new Map(),
    nativeKeys: new Map(),
    nativeButtons: new Map(),
    controllerWheels: new Map(),
    controllerMenu: null,
    controllerLookX: 0,
    frameSampleAt: null,
    frameSampleCount: 0,
    launchMode: 'single',
    deathmatchButton: null,
    wakeClient: null
  };

  const controllerKeys = Object.freeze({
    backspace: 8, tab: 9, enter: 13, escape: 27, space: 32,
    shift: 1073742049,
    right: 1073741903, left: 1073741904, down: 1073741905, up: 1073741906
  });

  function gameFor(context) {
    const game = games[context.variant];
    if (!game) throw new Error(`Unsupported id Tech 1 variant: ${context.variant}`);
    return game;
  }

  function installLaunchButtons(context) {
    const form = context.elements.form;
    const play = context.elements.play;
    if (!form || !play || runtime.deathmatchButton) return;

    play.textContent = 'New Game';
    play.addEventListener('click', () => { runtime.launchMode = 'single'; });
    const deathmatch = document.createElement('button');
    deathmatch.id = 'join-deathmatch';
    deathmatch.type = 'button';
    deathmatch.textContent = 'Join Deathmatch';
    deathmatch.hidden = play.hidden;
    deathmatch.disabled = play.disabled;
    deathmatch.addEventListener('click', () => {
      if (deathmatch.disabled || runtime.started) return;
      runtime.launchMode = 'deathmatch';
      form.requestSubmit(play);
    });
    play.insertAdjacentElement('afterend', deathmatch);
    const mirror = () => {
      deathmatch.hidden = play.hidden;
      deathmatch.disabled = play.disabled || runtime.started;
    };
    if (typeof MutationObserver === 'function') {
      new MutationObserver(mirror).observe(play, { attributes: true, attributeFilter: ['disabled', 'hidden'] });
    }
    runtime.deathmatchButton = deathmatch;
  }

  function classicWarpArgs(variant) {
    return ['doom', 'heretic', 'chex'].includes(variant) ? ['-warp', '1', '1'] : ['-warp', '1'];
  }

  function websocketUrl(pathname) {
    const url = new URL(String(pathname || '/ws/classic'), location.href);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    return url.href;
  }

  function bindEmscriptenCanvas(context) {
    // Emscripten 6.0.6's packaged SDL2 video driver still addresses the
    // native window as "#canvas" even when Module.canvas names a different
    // element. Keep the framework-owned element, but expose the selector SDL
    // uses for window sizing, event registration, and presentation.
    context.elements.canvas.id = 'canvas';
  }

  function availableProfiles(context) {
    return new Set((context.config.profiles || []).map(profile => String(profile.value)));
  }

  function normalizedProfile(context, requested) {
    const key = String(requested || 'smooth');
    return profiles[key] && availableProfiles(context).has(key) ? key : 'smooth';
  }

  function applyProfile(context, requested, announce) {
    const key = normalizedProfile(context, requested);
    const profile = profiles[key];
    runtime.profile = key;
    if (context.elements.graphicsProfile.value !== key) context.elements.graphicsProfile.value = key;
    context.elements.fpsRow.hidden = key !== 'modernized';
    context.elements.dynamicRow.hidden = true;
    context.elements.description.textContent = profile.note;
    context.elements.description.hidden = false;
    context.shell.setDisplay({ displayMode: profile.displayMode, pixelated: profile.pixelated });
    document.documentElement.dataset.doomProfile = key;
    return profile;
  }

  function renderScale() {
    const value = Number(new URLSearchParams(location.search).get('renderScale'));
    return Number.isFinite(value) && value > 0 ? Math.min(2, Math.max(0.5, value)) : 1;
  }

  function fpsLimit(context) {
    const value = Number(context.preferences.values().targetFps);
    return [60, 90, 120].includes(value) ? value : 120;
  }

  function modernDisplay() {
    const viewport = window.visualViewport;
    const cssWidth = Math.max(320, Math.floor(viewport?.width || window.innerWidth));
    const cssHeight = Math.max(200, Math.floor(viewport?.height || window.innerHeight));
    const scale = renderScale();
    return Object.freeze({
      width: Math.min(8192, Math.round(cssWidth * scale)),
      height: Math.min(8192, Math.round(cssHeight * scale)),
      scale
    });
  }

  function classicConfig() {
    return [
      'fullscreen 0',
      'aspect_ratio_correct 1',
      'use_mouse 1',
      'grabmouse 1',
      'novert 1',
      'mouse_sensitivity 5',
      'mouse_acceleration 1.0',
      'key_up 119',
      'key_down 115',
      'key_strafeleft 97',
      'key_straferight 100',
      'key_left 113',
      'key_right 101',
      'key_use 32',
      'mouseb_fire 0',
      'fsynth_chorus_active 0',
      'fsynth_reverb_active 0'
    ].join('\n') + '\n';
  }

  function modernConfig(display, targetFps) {
    return [
      'videomode                  "Software"',
      `screen_resolution          "${display.width}x${display.height}"`,
      `custom_resolution          "${display.width}x${display.height}"`,
      'use_fullscreen             0',
      'exclusive_fullscreen       0',
      'render_vsync               0',
      'uncapped_framerate         1',
      `dsda_fps_limit             ${targetFps}`,
      'dsda_background_fps_limit  60',
      'integer_scaling            0',
      'render_screen_multiply     1',
      'render_aspect              0',
      'aspect_ratio_correction    1',
      'render_stretch_hud         1',
      'render_stretchsky          0',
      'render_linearsky           1',
      'fake_contrast_mode         2',
      'boom_translucent_sprites   1',
      'palette_onbonus            0',
      'movement_vertmouse         0',
      'allow_freelook             0',
      'use_mouse                  1',
      'use_game_controller        0',
      'mouse_sensitivity_horiz   10',
      'dsda_mouse_acceleration    0',
      'mouse_stutter_correction   1',
      'autorun                    1',
      'snd_samplerate         48000',
      'snd_samplecount           128',
      'snd_channels              32',
      'dsda_parallel_sfx_limit    1',
      'dsda_parallel_sfx_window   1',
      'snd_midiplayer          "opl"',
      'mus_fluidsynth_chorus      0',
      'mus_fluidsynth_reverb      0',
      'mus_portmidi_chorus_level  0',
      'mus_portmidi_reverb_level  0',
      'input_forward              119 -1 -1',
      'input_backward             115 -1 -1',
      'input_strafeleft            97 -1 -1',
      'input_straferight          100 -1 -1',
      'input_turnleft             113 -1 -1',
      'input_turnright            101 -1 -1',
      'input_use                   32 -1 -1',
      'input_fire                   0 0 -1'
    ].join('\n') + '\n';
  }

  function dataPolicy(definition) {
    return Object.freeze({
      ...definition,
      key: definition.key,
      name: definition.name,
      names: [definition.name, ...(definition.names || []), definition.path].filter(Boolean),
      mountName: definition.name,
      required: definition.required !== false
    });
  }

  async function loadDataManifest(context) {
    const response = await fetch('/wasm-game-data.json', { cache: 'no-store', credentials: 'same-origin' });
    if (!response.ok) throw new Error(`Owner-data manifest failed with HTTP ${response.status}.`);
    const root = await response.json();
    const selected = root.variants?.[context.variant];
    if (!selected || !Array.isArray(selected.files)) {
      throw new Error(`Owner-data manifest has no ${context.variant} policy.`);
    }
    const rootValidator = root.validator && typeof root.validator === 'object' ? root.validator : null;
    const localValidator = selected.validator && typeof selected.validator === 'object' ? selected.validator : null;
    runtime.dataValidator = selected.validator === false ? null : rootValidator || localValidator
      ? Object.freeze({
        ...(rootValidator || {}),
        ...(localValidator || {}),
        policy: Object.freeze({ ...((rootValidator && rootValidator.policy) || {}), ...((localValidator && localValidator.policy) || {}) })
      })
      : null;
    runtime.dataManifest = Object.freeze({ ...selected, files: Object.freeze(selected.files.map(Object.freeze)) });
    runtime.dataNamespace = String(selected.namespace || `${root.namespace}-${context.variant}`);
    runtime.dataVersion = String(selected.version || root.version);
    const iwad = runtime.dataManifest.files.find(file => file.key === 'iwad');
    if (!iwad) throw new Error(`Owner-data manifest has no ${context.variant} IWAD policy.`);
    return runtime.dataManifest;
  }

  function selectedIwad() {
    const iwad = runtime.dataManifest?.files.find(file => file.key === 'iwad');
    if (!iwad) throw new Error('The selected IWAD policy has not loaded.');
    return iwad;
  }

  function createOwnerData(context) {
    if (!runtime.dataManifest || !runtime.dataNamespace || !runtime.dataVersion) {
      throw new Error('The owner-data policy has not loaded.');
    }
    return context.framework.createOwnerDataSet({
      namespace: runtime.dataNamespace,
      version: runtime.dataVersion,
      validator: runtime.dataValidator,
      files: runtime.dataManifest.files.map(dataPolicy)
    });
  }

  function dataProgress(context, game, detail) {
    if (detail.phase === 'checking-cache') {
      context.setLoading(`Preparing ${game.label}…`, '', 4);
    } else if (detail.phase === 'downloading') {
      const percent = detail.total ? Math.floor(detail.received * 100 / detail.total) : 0;
      context.setLoading(`Preparing ${game.label}…`, `${percent}%`, 8 + percent * 0.42);
    } else if (detail.phase === 'validated') {
      context.setLoading(`Preparing ${game.label}…`, '', 53);
    } else if (detail.phase === 'restored') {
      context.setLoading(`Preparing ${game.label}…`, '', 54);
    } else if (detail.phase === 'cached') {
      context.setLoading(`Preparing ${game.label}…`, '', 55);
    }
  }

  function ensureDirectory(FS, path) {
    if (typeof FS.mkdirTree === 'function') return FS.mkdirTree(path);
    let current = '';
    for (const part of path.split('/').filter(Boolean)) {
      current += `/${part}`;
      try { FS.mkdir(current); } catch (error) {
        try { FS.stat(current); } catch (_) { throw error; }
      }
    }
  }

  function fileExists(FS, path) {
    try {
      FS.stat(path);
      return true;
    } catch (_) {
      return false;
    }
  }

  function writeInitialFile(FS, path, bytes) {
    if (!fileExists(FS, path)) FS.writeFile(path, bytes);
  }

  function configLineKey(line) {
    return String(line || '').trim().split(/\s+/, 1)[0];
  }

  function writeModernConfig(FS, path, generated, encoder) {
    const versionPath = `${path}.wasm-profile-version`;
    if (!fileExists(FS, path) || typeof FS.readFile !== 'function') {
      FS.writeFile(path, encoder.encode(generated));
      FS.writeFile(versionPath, encoder.encode(`${modernProfileVersion}\n`));
      return;
    }

    let installedVersion = 0;
    if (fileExists(FS, versionPath)) {
      installedVersion = Number.parseInt(String(FS.readFile(versionPath, { encoding: 'utf8' })), 10) || 0;
    }
    const migrateProfile = installedVersion < modernProfileVersion;
    const required = new Map();
    for (const line of generated.trimEnd().split('\n')) {
      const key = configLineKey(line);
      if (migrateProfile || modernSessionKeys.has(key)) required.set(key, line);
    }
    const current = String(FS.readFile(path, { encoding: 'utf8' }));
    const lines = current.split('\n');
    const seen = new Set();
    for (let index = 0; index < lines.length; index += 1) {
      const key = configLineKey(lines[index]);
      if (!required.has(key)) continue;
      lines[index] = required.get(key);
      seen.add(key);
    }
    for (const [key, line] of required) if (!seen.has(key)) lines.push(line);
    FS.writeFile(path, encoder.encode(`${lines.join('\n').replace(/\n+$/, '')}\n`));
    if (migrateProfile) FS.writeFile(versionPath, encoder.encode(`${modernProfileVersion}\n`));
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

  async function fetchBytes(path, description) {
    const response = await fetch(path, { credentials: 'same-origin' });
    if (!response.ok) throw new Error(`${description} failed with HTTP ${response.status}.`);
    return new Uint8Array(await response.arrayBuffer());
  }

  async function loadScript(path, factoryName) {
    if (typeof globalThis[factoryName] === 'function') return;
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = path;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Could not load ${path}.`));
      document.head.appendChild(script);
    });
  }

  function engineState() {
    const module = runtime.module;
    if (!module || typeof module._I_BrowserRuntimeState !== 'function') return runtime.state;
    return ['menu', 'gameplay', 'paused', 'debrief'][module._I_BrowserRuntimeState()] || 'menu';
  }

  function controllerKey(code, pressed) {
    if (typeof runtime.module?._I_BrowserControllerKey !== 'function') return;
    const next = Boolean(pressed);
    if (runtime.controllerHeld.get(code) === next) return;
    runtime.controllerHeld.set(code, next);
    synchronizeNativeKey(code);
  }

  function controllerButton(button, pressed) {
    if (typeof runtime.module?._I_BrowserControllerButton !== 'function') return;
    const next = Boolean(pressed);
    if (runtime.controllerButtons.get(button) === next) return;
    runtime.controllerButtons.set(button, next);
    synchronizeNativeButton(button);
  }

  function synchronizeNativeKey(code) {
    const next = runtime.controllerHeld.get(code) === true || runtime.keyboardHeld.get(code) === true;
    if (runtime.nativeKeys.get(code) === next) return;
    runtime.nativeKeys.set(code, next);
    runtime.module?._I_BrowserControllerKey?.(code, next ? 1 : 0);
  }

  function synchronizeNativeButton(button) {
    const next = runtime.controllerButtons.get(button) === true || runtime.pointerButtons.get(button) === true;
    if (runtime.nativeButtons.get(button) === next) return;
    runtime.nativeButtons.set(button, next);
    runtime.module?._I_BrowserControllerButton?.(button, next ? 1 : 0);
  }

  function browserKey(code, pressed) {
    const next = Boolean(pressed);
    if (runtime.keyboardHeld.get(code) === next) return;
    runtime.keyboardHeld.set(code, next);
    synchronizeNativeKey(code);
  }

  function browserButton(button, pressed) {
    const next = Boolean(pressed);
    if (runtime.pointerButtons.get(button) === next) return;
    runtime.pointerButtons.set(button, next);
    synchronizeNativeButton(button);
  }

  function controllerWheel(y, pressed) {
    if (typeof runtime.module?._I_BrowserControllerWheel !== 'function') return;
    const next = Boolean(pressed);
    if (runtime.controllerWheels.get(y) === next) return;
    runtime.controllerWheels.set(y, next);
    if (next) runtime.module._I_BrowserControllerWheel(y);
  }

  function releaseController() {
    const keys = [...runtime.controllerHeld.keys()];
    const buttons = [...runtime.controllerButtons.keys()];
    runtime.controllerHeld.clear();
    runtime.controllerButtons.clear();
    for (const code of keys) synchronizeNativeKey(code);
    for (const button of buttons) synchronizeNativeButton(button);
    runtime.controllerWheels.clear();
    runtime.controllerMenu = null;
    runtime.controllerLookX = 0;
  }

  function releaseBrowserInput() {
    const keys = [...runtime.keyboardHeld.keys()];
    const buttons = [...runtime.pointerButtons.keys()];
    runtime.keyboardHeld.clear();
    runtime.pointerButtons.clear();
    for (const code of keys) synchronizeNativeKey(code);
    for (const button of buttons) synchronizeNativeButton(button);
  }

  function browserKeyCode(event) {
    if (event.key.length === 1) return event.key.toLowerCase().charCodeAt(0);
    return ({
      Backspace: controllerKeys.backspace,
      Tab: controllerKeys.tab,
      Enter: controllerKeys.enter,
      Escape: controllerKeys.escape,
      ' ': controllerKeys.space,
      Shift: controllerKeys.shift,
      ArrowRight: controllerKeys.right,
      ArrowLeft: controllerKeys.left,
      ArrowDown: controllerKeys.down,
      ArrowUp: controllerKeys.up
    })[event.key] ?? null;
  }

  function browserInputActive(event) {
    const canvas = runtime.context?.elements.canvas;
    return runtime.started && canvas &&
      (event.target === canvas || document.pointerLockElement === canvas);
  }

  function installBrowserInputBridge() {
    document.addEventListener('keydown', event => {
      if (!browserInputActive(event)) return;
      const code = browserKeyCode(event);
      if (code != null) browserKey(code, true);
    });
    document.addEventListener('keyup', event => {
      if (!browserInputActive(event)) return;
      const code = browserKeyCode(event);
      if (code != null) browserKey(code, false);
    });
    document.addEventListener('pointerdown', event => {
      if (!browserInputActive(event)) return;
      browserButton(event.button === 2 ? 3 : event.button === 1 ? 2 : 1, true);
    });
    document.addEventListener('pointerup', event => {
      if (!browserInputActive(event)) return;
      browserButton(event.button === 2 ? 3 : event.button === 1 ? 2 : 1, false);
    });
    document.addEventListener('pointermove', event => {
      if (!browserInputActive(event) || document.pointerLockElement !== runtime.context?.elements.canvas) return;
      const dx = Math.trunc(Number(event.movementX) || 0);
      const dy = Math.trunc(Number(event.movementY) || 0);
      if (dx || dy) runtime.module?._I_BrowserControllerMouse?.(dx, dy);
    });
    document.addEventListener('wheel', event => {
      if (!browserInputActive(event) || !event.deltaY) return;
      runtime.module?._I_BrowserControllerWheel?.(event.deltaY < 0 ? 1 : -1);
    }, { passive: true });
    window.addEventListener('blur', releaseBrowserInput);
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement !== runtime.context?.elements.canvas) releaseBrowserInput();
    });
  }

  function controllerFrame(detail) {
    if (!runtime.started || !detail?.actions) return;
    const actions = detail.actions;
    const menu = engineState() !== 'gameplay';
    if (runtime.controllerMenu !== menu) {
      releaseController();
      runtime.controllerMenu = menu;
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
    controllerKey(49, active(actions.melee));
    controllerButton(1, active(actions.attack));
    controllerButton(3, active(actions.altAttack));
    controllerWheel(1, active(actions.nextWeapon));
    controllerWheel(-1, active(actions.previousWeapon));

    const deltaMs = Math.max(0, Math.min(100, Number(detail.deltaMs) || 16.667));
    runtime.controllerLookX += (Number(actions.lookX) || 0) * deltaMs * 0.55;
    const dx = Math.trunc(runtime.controllerLookX);
    runtime.controllerLookX -= dx;
    if (dx && typeof runtime.module?._I_BrowserControllerMouse === 'function') {
      // Doom-family profiles intentionally keep vertical look disabled.
      runtime.module._I_BrowserControllerMouse(dx, 0);
    }
  }

  function beginStatePolling(context) {
    if (runtime.pollTimer) window.clearInterval(runtime.pollTimer);
    runtime.pollTimer = window.setInterval(() => {
      const next = engineState();
      if (next !== runtime.state) {
        const captureGameplay = next === 'gameplay' &&
          runtime.captureUntil >= performance.now();
        runtime.state = next;
        context.setEngineState(next, captureGameplay
          ? { capture: true, event: runtime.captureEvent }
          : undefined);
        if (captureGameplay) {
          runtime.captureUntil = 0;
          runtime.captureEvent = null;
        }
      }
      const module = runtime.module;
      if (typeof module?._I_BrowserFrameCount === 'function') {
        const frameCount = Number(module._I_BrowserFrameCount()) || 0;
        const sampledAt = performance.now();
        document.documentElement.dataset.doomFrames = String(frameCount);
        if (runtime.frameSampleAt == null) {
          runtime.frameSampleAt = sampledAt;
          runtime.frameSampleCount = frameCount;
        } else if (sampledAt - runtime.frameSampleAt >= 500) {
          const measuredFps = (frameCount - runtime.frameSampleCount) * 1000 /
            (sampledAt - runtime.frameSampleAt);
          document.documentElement.dataset.doomFps = Math.max(0, measuredFps).toFixed(1);
          runtime.frameSampleAt = sampledAt;
          runtime.frameSampleCount = frameCount;
        }
      }
      if (typeof module?._I_BrowserTargetFPS === 'function') {
        document.documentElement.dataset.doomTargetFps = String(module._I_BrowserTargetFPS());
      }
      if (typeof module?._I_BrowserAudioDeviceCount === 'function') {
        document.documentElement.dataset.doomAudioDevices =
          String(module._I_BrowserAudioDeviceCount());
      }
      if (typeof module?._I_BrowserAudioCallbackCount === 'function') {
        document.documentElement.dataset.doomAudioCallbacks =
          String(module._I_BrowserAudioCallbackCount());
      }
      if (typeof module?._I_BrowserScreenWidth === 'function') {
        document.documentElement.dataset.doomBackbuffer = [
          module._I_BrowserScreenWidth(), module._I_BrowserScreenHeight()
        ].join('x');
      }
      if (typeof module?._I_BrowserPlayerX === 'function') {
        document.documentElement.dataset.doomPlayer = [
          module._I_BrowserPlayerX(),
          module._I_BrowserPlayerY(),
          module._I_BrowserPlayerAngle() >>> 0,
          typeof module._I_BrowserViewPitch === 'function' ? module._I_BrowserViewPitch() >>> 0 : 0
        ].join(',');
      }
      if (typeof module?._I_BrowserAttackDown === 'function') {
        document.documentElement.dataset.doomAttackDown =
          String(module._I_BrowserAttackDown());
      }
      if (typeof module?._I_BrowserNetGame === 'function') {
        document.documentElement.dataset.doomNetgame = String(module._I_BrowserNetGame());
      }
      if (typeof module?._I_BrowserLobbyPlayers === 'function') {
        document.documentElement.dataset.doomLobbyPlayers = String(module._I_BrowserLobbyPlayers());
      }
      if (typeof module?._I_BrowserLobbyController === 'function') {
        document.documentElement.dataset.doomLobbyController = String(module._I_BrowserLobbyController());
      }
      if (typeof module?._I_BrowserWaitingLaunch === 'function') {
        document.documentElement.dataset.doomWaitingLaunch = String(module._I_BrowserWaitingLaunch());
      }
      if (typeof module?._I_BrowserPlayerCount === 'function') {
        document.documentElement.dataset.doomPlayers = String(module._I_BrowserPlayerCount());
      }
      if (typeof module?._I_BrowserConsolePlayer === 'function') {
        document.documentElement.dataset.doomConsolePlayer = String(module._I_BrowserConsolePlayer());
      }
    }, 100);
  }

  function synchronizeEngineState(context, event, captureGameplay) {
    const next = engineState();
    runtime.state = next;
    if (next !== context.shell.engineState() || (captureGameplay && next === 'gameplay')) {
      const capture = captureGameplay && next === 'gameplay';
      context.setEngineState(next, capture
        ? { capture: true, event }
        : undefined);
      if (capture) {
        runtime.captureUntil = 0;
        runtime.captureEvent = null;
      }
    }
    return next;
  }

  async function start(context) {
    if (runtime.started) throw new Error('This engine is already running; reload before selecting another title.');
    runtime.started = true;
    runtime.context = context;
    const game = gameFor(context);
    const iwad = selectedIwad();
    const profile = applyProfile(context, context.preferences.values().qualityProfile, true);
    const deathmatch = runtime.launchMode === 'deathmatch';
    const modern = profile.engine === 'dsda';
    const modernDeathmatch = modern && deathmatch;
    const display = modern ? modernDisplay() : null;

    try {
      await context.shell.resumeAudio();
      context.setLoading(`Preparing ${game.label}…`, '', 2);
      const ownerData = createOwnerData(context);
      const preparedData = await context.dataClient.load(ownerData, {
        onProgress: detail => dataProgress(context, game, detail)
      });

      let multiplayerServer = null;
      if (deathmatch) {
        context.setLoading(`Waking ${game.label} deathmatch…`,
          modernDeathmatch ? 'Starting Zandronum with bots.' : 'Starting the classic dedicated server.', 56);
        multiplayerServer = await runtime.wakeClient.ensureRunning({
          engine: modernDeathmatch ? 'zandronum' : 'classic',
          variant: context.variant, profile: runtime.profile
        });
      }

      const scriptName = modernDeathmatch ? 'zandronum.js' : modern ? 'dsda-doom.js' : game.script;
      const factoryName = modernDeathmatch ? 'createZandronum' : modern ? 'createDsdaDoom' : game.factory;
      context.setLoading(`Loading ${profile.label} engine…`, '', 58);
      context.log(`Loading ${scriptName}.`);
      await loadScript(`/dist/${scriptName}`, factoryName);

      const support = modern
        ? await fetchBytes(modernDeathmatch ? '/dist/zandronum.pk3' : '/dist/dsda-doom.wad',
          `Loading the ${modernDeathmatch ? 'Zandronum' : 'Modernized'} engine`)
        : null;
      const chexPatch = context.variant === 'chex'
        ? await fetchBytes('/dist/chex.deh', 'Loading the Chex compatibility patch')
        : null;
      const moduleOptions = {
        noInitialRun: true,
        canvas: context.elements.canvas,
        print(value) {
          context.log(value);
          console.log(`[idtech1] ${value}`);
        },
        printErr(value) {
          context.log(`ERROR: ${value}`);
          console.error(`[idtech1] ${value}`);
        },
        setStatus(value) {
          if (value) context.setLoading(`Loading ${game.label} engine…`, '', 68);
        },
        onAbort(reason) {
          context.log(`ABORT: ${reason}`);
          runtime.state = 'crashed';
          context.setEngineState('crashed');
        }
      };
      const factory = globalThis[factoryName];
      if (typeof factory !== 'function') throw new Error(`${factoryName} was not exported.`);
      runtime.module = await factory(moduleOptions);

      context.setLoading(`Preparing ${game.label}…`, '', 72);
      await context.framework.mountOwnerFiles(runtime.module, preparedData, {
        root: '/iwads',
        mode: 'memfs',
        onProgress(detail) {
          if (detail.total) {
            const percent = Math.floor(detail.copied * 100 / detail.total);
            context.setLoading(`Preparing ${game.label}…`, `${percent}%`, 72 + percent * 0.18);
          }
        }
      });

      const FS = runtime.module.FS;
      runtime.persistence = await context.persistence.attach(FS, { root: context.persistence.root });
      trackPersistentWrites(FS, runtime.persistence);
      ensureDirectory(FS, '/profiles');
      if (modernDeathmatch) ensureDirectory(FS, '/home/web_user/.config');
      const encoder = new TextEncoder();
      const iwadPath = `/iwads/${iwad.name}`;
      let args;
      if (modernDeathmatch) {
        FS.writeFile('/zandronum.pk3', support);
        const playerNumber = Math.max(1, Number(new URLSearchParams(location.search).get('client')) || 1);
        args = [
          '-iwad', iwadPath,
          '-connect', String(multiplayerServer.connect || '127.0.0.1:10666'),
          '-wss', websocketUrl(multiplayerServer.wsPath),
          '-width', String(display.width), '-height', String(display.height),
          '+cl_startasspectator', '0', '+name', `Browser${playerNumber}`,
          '+vid_renderer', '0', '+fullscreen', '0'
        ];
        context.log('Modernized deathmatch: Zandronum connected through the framework UDP relay with two server bots.');
      } else if (modern) {
        FS.writeFile('/dsda-doom.wad', support);
        const configPath = `${runtime.persistence.root}/dsda-doom.cfg`;
        writeModernConfig(FS, configPath, modernConfig(display, fpsLimit(context)), encoder);
        args = ['-iwad', iwadPath, '-config', configPath, '-save', runtime.persistence.root];
        context.log(`Modernized display: ${display.width}x${display.height} at ${display.scale.toFixed(2)}× render scale.`);
      } else {
        const configPath = `${runtime.persistence.root}/default.cfg`;
        writeInitialFile(FS, configPath, encoder.encode(classicConfig()));
        FS.writeFile('/profiles/crispy.cfg', encoder.encode(profile.config.join('\n') + '\n'));
        args = [
          '-iwad', iwadPath,
          '-config', configPath,
          '-extraconfig', '/profiles/crispy.cfg',
          '-savedir', runtime.persistence.root,
          '-window', '-nofullscreen', '-width', '960', '-height', '720'
        ];
        if (deathmatch) {
          args.push(
            '-connect', String(multiplayerServer.connect || '1'),
            '-wss', websocketUrl(multiplayerServer.wsPath),
            '-nodes', '2', '-deathmatch', '-nosound', '-nomusic',
            ...classicWarpArgs(context.variant)
          );
          context.log('Classic deathmatch: connected to the framework-managed dedicated server; waiting for two browser players.');
        }
      }
      if (chexPatch) FS.writeFile('/iwads/chex.deh', chexPatch);

      context.log(`${profile.label}: W/S move, A/D strafe, Q/E turn, Space uses, and the mouse turns/fires.`);
      context.setLoading(`Starting ${game.label}…`, profile.note, 96);
      context.showRuntime('menu');
      const mainResult = runtime.module.callMain(args);
      if (mainResult && typeof mainResult.catch === 'function') {
        mainResult.catch(error => {
          context.log(error?.stack || error);
          console.error('[idtech1 main]', error);
          runtime.state = 'crashed';
          context.setEngineState('crashed');
        });
      }
      context.shell.resize();
      await context.shell.resumeAudio();
      runtime.state = engineState();
      context.setEngineState(runtime.state);
      document.documentElement.dataset.doomRuntime = 'ready';
      context.elements.canvas.focus({ preventScroll: true });
      beginStatePolling(context);
    } catch (error) {
      runtime.started = false;
      runtime.module = null;
      context.log(error?.stack || error);
      console.error('[idtech1 start]', error);
      throw error;
    }
  }

  globalThis.WasmGameAdapter = Object.freeze({
    async init(context) {
      runtime.context = context;
      const capability = context.framework.requireCapabilities({ wasm: true, indexedDb: true });
      if (!capability.supported) throw new Error(`This browser is missing: ${capability.missing.join(', ')}.`);
      bindEmscriptenCanvas(context);
      runtime.wakeClient = typeof context.framework.createWakeClient === 'function'
        ? context.framework.createWakeClient({
        statusUrl: '/status', wakeUrl: '/wake', interval: 250, timeout: 45000,
        onStatus(status) {
          if (runtime.launchMode !== 'deathmatch' || !status) return;
          document.documentElement.dataset.doomServerState = String(status.state || 'unknown');
          document.documentElement.dataset.doomServerPeers = String(status.peers || 0);
        }
        }) : null;
      installLaunchButtons(context);
      await loadDataManifest(context);
      const queryProfile = new URLSearchParams(location.search).get('profile');
      if (queryProfile && profiles[queryProfile] && availableProfiles(context).has(queryProfile)) {
        context.elements.graphicsProfile.value = queryProfile;
      }
      applyProfile(context, context.elements.graphicsProfile.value, false);
      if (!runtime.diagnosticsInstalled) {
        window.addEventListener('error', event => context.log(`BROWSER ERROR: ${event.message}`));
        window.addEventListener('unhandledrejection', event => context.log(`BROWSER REJECTION: ${event.reason?.stack || event.reason}`));
        runtime.diagnosticsInstalled = true;
      }
      if (!runtime.interactionInstalled) {
        installBrowserInputBridge();
        document.addEventListener('keyup', event => {
          if (!runtime.started || (event.key !== 'Enter' && event.key !== 'Escape')) return;
          runtime.captureUntil = performance.now() + 2000;
          runtime.captureEvent = event;
          queueMicrotask(() => synchronizeEngineState(context, event, true));
        });
        document.addEventListener('keydown', event => {
          if (event.key === 'Escape') runtime.lastEscapeAt = performance.now();
        }, true);
        runtime.interactionInstalled = true;
      }
    },
    start,
    readEngineState() {
      return engineState();
    },
    readCaptureIntent() {
      // These local source ports complete level transitions synchronously;
      // none exposes an asynchronous native loading intent.
      return false;
    },
    resize(detail) {
      if (runtime.profile !== 'modernized' || typeof runtime.module?._I_BrowserResizeViewport !== 'function') return;
      const scale = renderScale();
      runtime.module._I_BrowserResizeViewport(
        Math.min(8192, Math.max(2, Math.round(detail.requestedWidth * scale))),
        Math.min(8192, Math.max(2, Math.round(detail.requestedHeight * scale)))
      );
    },
    captureLost(_detail, context) {
      if (performance.now() - runtime.lastEscapeAt > 750 &&
          typeof runtime.module?._I_BrowserOpenMenu === 'function') runtime.module._I_BrowserOpenMenu();
      synchronizeEngineState(context, null, false);
      runtime.persistence?.save().catch(error => context.log(error));
    },
    inputCaptureChanged(captured, context) {
      if (typeof runtime.module?._I_BrowserSetInputCaptured === 'function') {
        runtime.module._I_BrowserSetInputCaptured(captured ? 1 : 0);
      }
      if (captured) context.shell.resumeAudio();
    },
    controllerFrame(detail) {
      controllerFrame(detail);
    },
    controllerChanged(detail) {
      if (!detail?.connected || detail.selection === 'disabled' || detail.activeIndex == null) releaseController();
    },
    preferencesChanged(values, context) {
      if (!runtime.started) applyProfile(context, values.qualityProfile, true);
    },
    contextRestored(_event, context) {
      context.shell.resize();
    }
  });
})();
