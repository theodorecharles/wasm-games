/**
 * Browser ET client bootstrap. Runs only in a window (no Node require).
 * name → wake server → download (silent) → official menu+music →
 * Join Game → connect → game.
 */
(function () {
  if (typeof window === 'undefined') {
    return;
  }

  /* One stamp for etjs.js + etjs.wasm so EM_ASM addresses match. */
  window.ETJS_ASSET_VER = window.ETJS_ASSET_VER || String(Date.now());

  function firstElement() {
    for (var i = 0; i < arguments.length; i++) {
      var found = document.getElementById(arguments[i]);
      if (found) { return found; }
    }
    return null;
  }

  var frame = firstElement('viewport-frame', 'runtime');
  var canvas = firstElement('et-canvas', 'game-canvas');
  var loadPanel = firstElement('load-panel', 'loading');
  var loadStatus = firstElement('load-status', 'loading-status');
  var loadDetail = firstElement('load-detail', 'loading-detail');
  var loadFill = document.getElementById('load-bar-fill');
  var loadBar = (loadFill && loadFill.parentElement) || document.getElementById('loading-progress');
  var startupConsole = firstElement('startup-console', 'loading-console');
  var pk3Downloader = window.ETJSPk3Download;
  var pk3Cache = window.ETJSPk3
    ? window.ETJSPk3.createPk3Cache({
      backend: (typeof indexedDB !== 'undefined')
        ? window.ETJSPk3.idbBackend()
        : window.ETJSPk3.memoryBackend()
    })
    : null;

  var playReady = false;
  var typingMode = null;
  var held = Object.create(null);
  var loadHidden = false;
  var menuAudio = document.getElementById('menu-music');
  var menuMusicWanted = false;
  var nameGate = firstElement('name-gate', 'launcher');
  var nameForm = firstElement('name-form', 'launcher-form');
  var nameInput = document.getElementById('player-name');
  var nameError = firstElement('name-error', 'error');
  var graphicsProfile = document.getElementById('graphics-profile');
  var dynamicQuality = document.getElementById('dynamic-quality');
  var dynamicFps = firstElement('dynamic-fps', 'fps-target');
  var lastLoadStatus = '';
  var MAX_STARTUP_LINES = 180;
  var GRAPHICS_STORAGE_KEY = 'etjs.graphics';
  var selectedQualityLevel = 3;
  var selectedFpsTarget = 60;
  var adaptiveQuality = true;
  var serverReadyPromise = null;
  var communicationInput = false;
  var communicationInputGraceUntil = 0;
  var communicationLogSequence = 0;
  var wasmShell = null;
  var frameworkEngineState = 'launcher';
  var frameworkCaptureIntent = false;
  var canonicalContext = null;
  var canonicalStart = null;
  var canonicalCaptureLost = null;
  var canonicalPointerMove = null;
  var canonicalPointerButton = null;
  var canonicalInputCaptureChanged = null;
  var canonicalPreferencesChanged = null;
  var canonicalControllerFrame = null;
  var canonicalControllerChanged = null;
  var canonicalContextLost = null;
  var canonicalContextRestored = null;
  var frameworkInputCaptured = false;
  var frameworkContextLost = false;

  function setFrameworkEngineState(next, options) {
    frameworkEngineState = next;
    if (wasmShell && wasmShell.engineState() !== next) {
      wasmShell.setEngineState(next, options);
    }
  }

  function communicationLog(event, detail) {
    var entry = Object.assign({
      sequence: ++communicationLogSequence,
      event: event,
      time: new Date().toISOString()
    }, detail || {});
    /* Keep a local buffer for DevTools and mirror it to the host process so
     * input failures can be diagnosed without asking players to copy a
     * browser console. Only T/Y/V/Escape diagnostics use this endpoint. */
    window.ETJSCommunicationLog = window.ETJSCommunicationLog || [];
    window.ETJSCommunicationLog.push(entry);
    if (window.ETJSCommunicationLog.length > 30) {
      window.ETJSCommunicationLog.shift();
    }
    console.info('[ETJS communication]', entry);
    try {
      fetch('/client-log', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(entry),
        keepalive: true
      }).catch(function () {});
    } catch (e) { /* diagnostics must never break input */ }
  }

  var AUTOEXEC_LINES = [
    'set rate 25000',
    'set snaps 20',
    'set cl_maxpackets 30',
    'set r_drawworld 1',
    'set r_fastsky 0',
    'set r_nocurves 0',
    'set r_dynamiclight 2',
    'set r_vertexLight 0',
    'set r_lightmap 0',
    'set r_mapOverBrightBits 2',
    'set r_overBrightBits 0',
    'set r_picmip 0',
    'set r_lodbias 0',
    'set r_subdivisions 4',
    'set r_detailtextures 1',
    'set r_texturebits 32',
    'set r_colorbits 32',
    'set r_depthbits 24',
    'set r_ext_compressed_textures 0',
    'set r_ext_texture_filter_anisotropic 16',
    'set r_textureMode GL_LINEAR_MIPMAP_LINEAR',
    'set r_flares 1',
    'set r_drawSun 1',
    'set cg_shadows 1',
    'set cg_atmosphericEffects 1',
    'set cg_markTime 20000',
    'set cg_brasstime 2500',
    'set r_ignoreGLErrors 1',
    'set r_allowSoftwareGL 1',
    'set cl_freelook 1',
    'set in_mouse 1',
    'set sensitivity 8',
    'set m_pitch 0.022',
    'set m_yaw 0.022',
    'set cg_drawGun 1',
    'set com_maxfps 125',
    'set com_maxfpsUnfocused 125',
    'set com_unfocused 0',
    'set com_minimized 0',
    'set s_initsound 1',
    'set s_volume 0.8',
    'set s_muteWhenUnfocused 0',
    'set s_muteWhenMinimized 0',
    'set com_ansiColor 0',
    'set con_fontName courbd',
    'set com_recommendedSet 1',
    'set cg_autoAction 0',
    'unbindall',
    'bind w +forward',
    'bind s +back',
    'bind a +moveleft',
    'bind d +moveright',
    'bind LEFTARROW +left',
    'bind RIGHTARROW +right',
    'bind UPARROW +lookup',
    'bind DOWNARROW +lookdown',
    'bind SPACE +moveup',
    'bind c +movedown',
    'bind e +leanright',
    'bind q +leanleft',
    'bind x +prone',
    'bind MOUSE1 +attack',
    'bind MOUSE2 weapalt',
    'bind MOUSE3 weapnext',
    'bind MOUSE4 weapprev',
    'bind MOUSE5 +zoom',
    'bind MWHEELDOWN weapprev',
    'bind MWHEELUP weapnext',
    'bind 0 weaponbank 10',
    'bind 1 weaponbank 1',
    'bind 2 weaponbank 2',
    'bind 3 weaponbank 3',
    'bind 4 weaponbank 4',
    'bind 5 weaponbank 5',
    'bind 6 weaponbank 6',
    'bind 7 weaponbank 7',
    'bind 8 weaponbank 8',
    'bind 9 weaponbank 9',
    'bind SHIFT +sprint',
    'bind CAPSLOCK +speed',
    'bind f +activate',
    'bind h dropobj',
    'bind b +zoom',
    'bind g +mapexpand',
    'bind r +reload',
    'bind k kill',
    'bind o +objectives',
    'bind TAB +scores',
    'bind ALT +stats',
    'bind CTRL +topshots',
    'bind ` toggleconsole',
    'bind ~ toggleconsole',
    'bind l openlimbomenu',
    'bind , mapzoomout',
    'bind . mapzoomin',
    'bind = zoomin',
    'bind - zoomout',
    'bind p classmenu',
    'bind j teammenu',
    'bind i spawnmenu',
    'bind n timerreset',
    'bind t messagemode',
    'bind y messagemode2',
    'bind u messagemode3',
    'bind v mp_quickmessage',
    'bind z mp_fireteammsg',
    'bind F1 "vote yes"',
    'bind F2 "vote no"',
    'bind F3 ready',
    'bind F4 notready',
    'bind m mvactivate',
    'bind BACKSPACE spechelp',
    'bind F7 edithud',
    'bind F11 autoscreenshot',
    'bind F12 toggleRecord',
    'bind KP_ENTER mp_fireteamadmin',
    'bind KP_PLUS "selectbuddy -1"',
    'bind KP_END "selectbuddy 0"',
    'bind KP_DOWNARROW "selectbuddy 1"',
    'bind KP_PGDN "selectbuddy 2"',
    'bind KP_LEFTARROW "selectbuddy 3"',
    'bind KP_5 "selectbuddy 4"',
    'bind KP_RIGHTARROW "selectbuddy 5"',
    'bind KP_HOME "selectbuddy 6"',
    'bind KP_UPARROW "selectbuddy 7"',
    'bind KP_MINUS "selectbuddy -2"'
  ];

  var PROFILE_BOOT_LINES = [
    ['set r_picmip 3', 'set r_subdivisions 20', 'set r_detailtextures 0',
      'set r_texturebits 16', 'set r_ext_compressed_textures 1',
      'set r_ext_texture_filter_anisotropic 0', 'set r_textureMode GL_LINEAR_MIPMAP_NEAREST',
      'set r_dynamiclight 0', 'set cg_shadows 0', 'set cg_atmosphericEffects 0',
      'set cg_markTime 0', 'set r_lodbias 2', 'set r_fastsky 1'],
    ['set r_picmip 2', 'set r_subdivisions 12', 'set r_detailtextures 0',
      'set r_texturebits 0', 'set r_ext_compressed_textures 1',
      'set r_ext_texture_filter_anisotropic 0', 'set r_textureMode GL_LINEAR_MIPMAP_NEAREST',
      'set r_dynamiclight 1', 'set cg_shadows 0', 'set cg_atmosphericEffects 0',
      'set cg_markTime 5000', 'set r_lodbias 1', 'set r_fastsky 0'],
    ['set r_picmip 1', 'set r_subdivisions 4', 'set r_detailtextures 1',
      'set r_texturebits 32', 'set r_ext_compressed_textures 0',
      'set r_ext_texture_filter_anisotropic 4', 'set r_textureMode GL_LINEAR_MIPMAP_LINEAR',
      'set r_dynamiclight 1', 'set cg_shadows 1', 'set cg_atmosphericEffects 0.5',
      'set cg_markTime 10000', 'set r_lodbias 0', 'set r_fastsky 0'],
    ['set r_picmip 0', 'set r_subdivisions 4', 'set r_detailtextures 1',
      'set r_texturebits 32', 'set r_ext_compressed_textures 0',
      'set r_ext_texture_filter_anisotropic 16', 'set r_textureMode GL_LINEAR_MIPMAP_LINEAR',
      'set r_dynamiclight 2', 'set cg_shadows 1', 'set cg_atmosphericEffects 1',
      'set cg_markTime 20000', 'set r_lodbias 0', 'set r_fastsky 0']
  ];

  function selectedAutoexecLines() {
    var level = Math.max(0, Math.min(3, selectedQualityLevel));
    return AUTOEXEC_LINES.concat(PROFILE_BOOT_LINES[level], [
      'set etjs_autoQuality ' + (adaptiveQuality ? '1' : '0'),
      'set etjs_quality ' + level,
      'set etjs_targetFps ' + selectedFpsTarget
    ]);
  }

  var HOLD_KEYS = {
    ArrowLeft: '+left',
    ArrowRight: '+right',
    ArrowUp: '+lookup',
    ArrowDown: '+lookdown',
    Space: '+moveup',
    KeyC: '+movedown',
    KeyW: '+forward',
    KeyS: '+back',
    KeyA: '+moveleft',
    KeyD: '+moveright',
    KeyE: '+leanright',
    KeyQ: '+leanleft',
    KeyX: '+prone',
    ShiftLeft: '+sprint',
    ShiftRight: '+sprint',
    CapsLock: '+speed',
    KeyF: '+activate',
    KeyB: '+zoom',
    KeyG: '+mapexpand',
    KeyR: '+reload',
    KeyO: '+objectives',
    Tab: '+scores',
    AltLeft: '+stats',
    AltRight: '+stats',
    ControlLeft: '+topshots',
    ControlRight: '+topshots'
  };

  var TAP_KEYS = {
    KeyL: 'openlimbomenu',
    KeyP: 'classmenu',
    KeyJ: 'teammenu',
    KeyI: 'spawnmenu',
    KeyH: 'dropobj',
    KeyK: 'kill',
    Digit0: 'weaponbank 10',
    Digit1: 'weaponbank 1',
    Digit2: 'weaponbank 2',
    Digit3: 'weaponbank 3',
    Digit4: 'weaponbank 4',
    Digit5: 'weaponbank 5',
    Digit6: 'weaponbank 6',
    Digit7: 'weaponbank 7',
    Digit8: 'weaponbank 8',
    Digit9: 'weaponbank 9',
    Comma: 'mapzoomout',
    Period: 'mapzoomin',
    Equal: 'zoomin',
    Minus: 'zoomout',
    KeyN: 'timerreset',
    KeyT: 'messagemode',
    KeyY: 'messagemode2',
    KeyU: 'messagemode3',
    KeyV: 'mp_quickmessage',
    KeyZ: 'mp_fireteammsg',
    F1: 'vote yes',
    F2: 'vote no',
    F3: 'ready',
    F4: 'notready',
    KeyM: 'mvactivate',
    Backspace: 'spechelp',
    F7: 'edithud',
    F11: 'autoscreenshot',
    F12: 'toggleRecord',
    NumpadEnter: 'mp_fireteamadmin',
    NumpadAdd: 'selectbuddy -1',
    Numpad1: 'selectbuddy 0',
    Numpad2: 'selectbuddy 1',
    Numpad3: 'selectbuddy 2',
    Numpad4: 'selectbuddy 3',
    Numpad5: 'selectbuddy 4',
    Numpad6: 'selectbuddy 5',
    Numpad7: 'selectbuddy 6',
    Numpad8: 'selectbuddy 7',
    NumpadSubtract: 'selectbuddy -2'
  };

  var MOUSE_HOLD = {
    0: '+attack',
    4: '+zoom'
  };
  var MOUSE_TAP = {
    1: 'weapnext',
    2: 'weapalt',
    3: 'weapprev'
  };

  function playMenuMusic() {
    menuMusicWanted = true;
    resumeAudio();
    if (!menuAudio && typeof Audio === 'function') {
      menuAudio = new Audio('/sound/music/menu_server.wav');
    }
    if (!menuAudio) {
      return;
    }
    menuAudio.loop = true;
    menuAudio.volume = 0.75;
    var p = menuAudio.play();
    if (p && typeof p.catch === 'function') {
      p.catch(function () { /* wait for a later gesture */ });
    }
  }

  function stopMenuMusic() {
    menuMusicWanted = false;
    if (menuAudio) {
      menuAudio.pause();
      try { menuAudio.currentTime = 0; } catch (e) { /* ignore */ }
    }
  }

  function showError(msg) {
    if (msg) {
      frameworkCaptureIntent = false;
      playReady = false;
      appendStartupLine('ERROR: ' + msg, 'error');
      if (loadStatus) {
        loadStatus.textContent = msg;
      }
      if (wasmShell) {
        wasmShell.showLoading();
        setFrameworkEngineState('crashed');
      } else if (loadPanel) {
        loadPanel.hidden = false;
        loadPanel.classList.remove('hidden');
      }
    }
  }

  function appendStartupLine(text, level) {
    if (!startupConsole || text === null || typeof text === 'undefined') {
      return;
    }
    String(text).replace(/\r/g, '').split('\n').forEach(function (raw) {
      /* Strip complete terminal CSI colors before stripping control bytes;
       * reversing that order leaves visible "[0m" fragments behind. */
      var line = raw
        .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '')
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
        .replace(/^\s*\d+\s/, '');
      if (!line) {
        return;
      }
      var row = document.createElement('div');
      row.className = 'startup-console-line';
      row.setAttribute('data-level', level || 'info');
      row.textContent = line;
      startupConsole.appendChild(row);
      while (startupConsole.childNodes.length > MAX_STARTUP_LINES) {
        startupConsole.removeChild(startupConsole.firstChild);
      }
    });
    startupConsole.scrollTop = startupConsole.scrollHeight;
  }

  function setLoadProgress(frac, status, detail) {
    var pct = Math.max(0, Math.min(100, Math.round(frac * 100)));
    if (loadStatus && status) {
      loadStatus.textContent = status;
    }
    if (status && status !== lastLoadStatus) {
      lastLoadStatus = status;
      appendStartupLine(status);
    }
    if (loadDetail) {
      loadDetail.textContent = detail || '';
    }
    if (loadFill) {
      loadFill.style.width = pct + '%';
    }
    if (loadBar) {
      loadBar.setAttribute('aria-valuenow', String(pct));
      if (String(loadBar.tagName || '').toLowerCase() === 'progress') {
        loadBar.value = pct;
      }
    }
  }

  function wakeDedicatedServer() {
    var wakeStarted;
    var wakeTicker;

    if (serverReadyPromise) {
      return serverReadyPromise;
    }
    wakeStarted = Date.now();
    setLoadProgress(0.02, 'Starting game server…',
      'Waking the dedicated server · 0.0s');
    wakeTicker = setInterval(function () {
      setLoadProgress(0.02, 'Starting game server…',
        'Waking the dedicated server · ' +
        ((Date.now() - wakeStarted) / 1000).toFixed(1) + 's');
    }, 250);
    /* Let the loading panel paint before server startup begins. The ET engine
     * is deliberately not started until this resolves, so its MAIN menu can
     * never appear while the dedicated server is still booting. */
    serverReadyPromise = new Promise(function (resolve) {
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(resolve);
      } else {
        setTimeout(resolve, 0);
      }
    }).then(function () {
      return fetch('/wake', { method: 'POST' });
    }).then(function (response) {
      return response.json().then(function (body) {
        if (!response.ok || !body.ok) {
          throw new Error(body.error || ('HTTP ' + response.status));
        }
        return body;
      });
    }).then(function (body) {
      var map = String(body.map || 'rotation map').replace(/[^A-Za-z0-9_.-]/g, '');
      setLoadProgress(0.08, 'Game server is ready…', 'Loading ' + map);
      appendStartupLine('Game server ready on ' + map);
      return body;
    }).catch(function (err) {
      serverReadyPromise = null;
      throw err;
    }).finally(function () {
      if (wakeTicker) {
        clearInterval(wakeTicker);
      }
    });
    return serverReadyPromise;
  }

  var engineReady = false;

  function applyNativeResolution(w, h) {
    if (w < 2) {
      w = window.innerWidth || 1024;
    }
    if (h < 2) {
      h = window.innerHeight || 768;
    }
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    if (canvas.style && !wasmShell) {
      canvas.style.width = '100%';
      canvas.style.height = '100%';
    }
    /* Do not touch Emscripten/SDL GL until the renderer exists. */
    if (!engineReady) {
      return;
    }
    if (window.Module && typeof window.Module.setCanvasSize === 'function') {
      window.Module.setCanvasSize(w, h);
    }
    if (window.Module && typeof window.Module._ETJS_SetResolution === 'function') {
      try { window.Module._ETJS_SetResolution(w, h); } catch (e) { /* not ready */ }
    }
  }

  function sizeCanvas() {
    if (wasmShell) {
      return wasmShell.resize();
    }
    /* QuakeJS resizeViewport: backbuffer = viewport-frame size. */
    var host = frame || (canvas && canvas.parentElement);
    var w = (host && host.offsetWidth) || window.innerWidth || 1024;
    var h = (host && host.offsetHeight) || window.innerHeight || 768;
    applyNativeResolution(w, h);
  }

  function ensureWebGL() {
    var attrs = {
      alpha: false,
      antialias: selectedQualityLevel >= 3,
      depth: true,
      stencil: false,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance'
    };
    var gl = canvas.getContext('webgl2', attrs) || canvas.getContext('webgl', attrs);
    if (!gl) {
      throw new Error('WebGL is required');
    }
    return gl;
  }

  function engineCmd(line) {
    var M = window.Module;
    if (!M || !line) {
      return false;
    }
    if (line.charAt(line.length - 1) !== '\n') {
      line += '\n';
    }
    try {
      if (typeof M.ccall === 'function') {
        M.ccall('Cbuf_AddText', null, ['string'], [line]);
        return true;
      }
    } catch (e) { /* not ready */ }
    return false;
  }

  function addLook(yaw, pitch) {
    var M = window.Module;
    if (!M) {
      return;
    }
    try {
      if (typeof M._ETJS_AddLook === 'function') {
        M._ETJS_AddLook(yaw, pitch);
      } else if (typeof M.ccall === 'function') {
        M.ccall('ETJS_AddLook', null, ['number', 'number'], [yaw, pitch]);
      }
    } catch (e) { /* not ready */ }
  }

  function installDefaultBinds() {
    var stored = window.ETJSBinds ? window.ETJSBinds.loadBinds() : null;
    var lines = window.ETJSBinds
      ? window.ETJSBinds.mergeAutoexec(selectedAutoexecLines(), stored)
      : selectedAutoexecLines();
    engineCmd(lines.join('\n'));
  }

  function pointerLocked() {
    return document.pointerLockElement === canvas ||
      document.webkitPointerLockElement === canvas;
  }

  function focusForInput() {
    if (!canvas) {
      return;
    }
    canvas.focus();
    resumeAudio();
  }

  function resumeAudio() {
    var ctxs = [];
    var M = window.Module;
    if (typeof SDL !== 'undefined' && SDL.audioContext) {
      ctxs.push(SDL.audioContext);
    }
    if (M && M.SDL2 && M.SDL2.audioContext) {
      ctxs.push(M.SDL2.audioContext);
    }
    if (typeof AL !== 'undefined' && AL.currentCtx && AL.currentCtx.audioCtx) {
      ctxs.push(AL.currentCtx.audioCtx);
    }
    ctxs.forEach(function (ctx) {
      if (ctx && ctx.state === 'suspended' && typeof ctx.resume === 'function') {
        ctx.resume();
      }
    });
  }

  function onEngineLine(text, level) {
    if (typeof text !== 'string') {
      return;
    }
    appendStartupLine(text, level);
    if (!canonicalContext && text.indexOf('ETJS join name=') !== -1) {
      var joined = text.replace(/^.*ETJS join name=/, '').split(' ')[0];
      if (window.ETJSName && joined) {
        try { window.ETJSName.savePlayerName(joined); } catch (e) { /* ignore */ }
      }
    }
    if (text.indexOf('----- Common Initialized') !== -1) {
      engineReady = true;
      sizeCanvas();
    }
    if (text.indexOf('Connecting to') !== -1 || text.indexOf('resolved to') !== -1) {
      setFrameworkEngineState('loading');
      setLoadProgress(0.38, 'Connecting to game server…', text);
    } else if (text.indexOf('ETJS splash start') !== -1 ||
               text.indexOf('ETJS UIMENU_MAIN') !== -1 ||
               text.indexOf('ETJS menus loaded count=') !== -1 ||
               text.indexOf('Cinematic ') !== -1 ||
               text.indexOf('ETJS menu ready') !== -1 ||
               text.indexOf('ETJS menu music start') !== -1) {
      engineReady = true;
      frameworkCaptureIntent = false;
      hideLoadPanel();
      playMenuMusic();
    } else if (text.indexOf('ETJS view team=') !== -1 ||
               text.indexOf('ETJS CGameRendering vm') !== -1) {
      hideLoadPanel('gameplay');
      frameworkCaptureIntent = false;
      setFrameworkEngineState('gameplay');
      stopMenuMusic();
    }
  }

  function hideLoadPanel(nextState) {
    if (loadHidden) {
      return;
    }
    loadHidden = true;
    setLoadProgress(1, 'Entering the match…', '');
    if (wasmShell) {
      wasmShell.showRuntime();
      setFrameworkEngineState(nextState || 'menu');
    } else {
      if (loadPanel) {
        loadPanel.hidden = true;
        loadPanel.classList.add('hidden');
      }
      if (frame) {
        frame.hidden = false;
        frame.classList.remove('hidden');
      }
    }
    sizeCanvas();
    playReady = true;
    installDefaultBinds();
    engineCmd('set cg_autoAction 0');
    engineCmd('stoprecord');
  }

  function engineArgs(playerName, cfg) {
    var nameArgs = window.ETJSName.nameToGameArgs(playerName);
    var connect = (cfg && cfg.connect) || (window.location.hostname + ':27961');
    /* ET only keeps 96 startup +commands; put connect first so it cannot
     * be dropped. Everything else lives in autoexec.cfg. */
    var args = nameArgs.concat([
      '+set', 'etjs_connect', connect,
      '+set', 'fs_basepath', '/',
      '+set', 'fs_homepath', canonicalContext && canonicalContext.persistence
        ? canonicalContext.persistence.root : '/home',
      '+set', 'fs_game', 'legacy',
      '+set', 'sv_master1', '',
      '+set', 'r_fullscreen', '0',
      '+set', 'r_mode', '-1',
      '+set', 'r_customwidth', String(canvas.width || 1024),
      '+set', 'r_customheight', String(canvas.height || 768),
      '+set', 'com_hunkMegs', '128',
      '+set', 'com_zoneMegs', '16',
      '+set', 'com_recommendedSet', '1',
      '+set', 'com_introPlayed', '0',
      '+set', 'com_ansiColor', '0',
      '+set', 'con_fontName', 'courbd'
    ]);
    if (cfg && cfg.admin === true) {
      args = args.concat(['+set', 'etjs_admin', '1']);
    }
    return args;
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.async = false;
      s.onload = function () { resolve(src); };
      s.onerror = function () { reject(new Error('failed to load ' + src)); };
      document.body.appendChild(s);
    });
  }

  function fetchPakBytes(file, onProgress) {
    if (!pk3Downloader) {
      return Promise.reject(new Error('PK3 downloader is not loaded'));
    }
    return pk3Downloader.fetchPakBytes(file, onProgress);
  }

  function preloadIntoFS(Module, file, onProgress) {
    var fetchFn = function () {
      return fetchPakBytes(file, function (got, total) {
        if (onProgress) {
          onProgress(got, total, false);
        }
      });
    };
    var done = pk3Cache
      ? pk3Cache.getOrFetch(file.cacheKey || file.name, fetchFn, function (bytes) {
        return bytes && bytes.byteLength === file.bytes;
      }).then(function (got) {
        if (got.cached && onProgress) {
          onProgress(file.bytes || 1, file.bytes || 1, true);
        }
        return got.bytes;
      })
      : fetchFn();
    return Promise.resolve(done).then(function (buf) {
      var data = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
      Module.FS.writeFile(file.parent + '/' + file.name, data, { canOwn: true });
    });
  }

  function preloadGameFiles(Module, files, onProgress) {
    if (!canonicalContext || !canonicalContext.framework || !canonicalContext.dataClient) {
      return Promise.all(files.map(function (file, idx) {
        return preloadIntoFS(Module, file, function (got, total, fromCache) {
          onProgress(idx, got, total, fromCache ? 'cache' : 'network');
        });
      }));
    }
    var framework = canonicalContext.framework;
    var version = files.map(function (file) { return file.cacheKey || file.name; }).join('|');
    var ownerData = framework.createOwnerDataSet({
      namespace: 'wolfet-pk3',
      version: version,
      files: files.map(function (file) {
        return {
          key: (file.parent.slice(1) + '-' + file.name).toLowerCase(),
          name: file.name,
          size: file.bytes,
          magic: [80, 75, 3, 4],
          mountName: file.name,
          validateCached: false
        };
      })
    });
    var keyIndex = {};
    files.forEach(function (file, index) {
      keyIndex[(file.parent.slice(1) + '-' + file.name).toLowerCase()] = index;
    });
    return canonicalContext.dataClient.load(ownerData, {
      onProgress: function (detail) {
        var idx = keyIndex[String(detail.key || '').toLowerCase()];
        if (idx === undefined) { return; }
        var total = files[idx].bytes || 1;
        var got = detail.received || detail.bytes ||
          (detail.phase === 'restored' || detail.phase === 'cached' || detail.phase === 'validated' ? total : 0);
        var source = detail.phase === 'restored' ? 'cache' :
          (detail.phase === 'downloading' ? 'network' : null);
        onProgress(idx, Math.min(got, total), total, source);
      }
    }).then(function (dataSet) {
      var etmain = [];
      var legacy = [];
      dataSet.entries.forEach(function (entry) {
        var idx = keyIndex[entry.policy.key];
        (files[idx].parent === '/etmain' ? etmain : legacy).push(entry);
      });
      return Promise.all([
        framework.mountOwnerFiles(Module, etmain, { root: '/etmain', mode: 'memfs' }),
        framework.mountOwnerFiles(Module, legacy, { root: '/legacy', mode: 'memfs' })
      ]);
    });
  }

  function mkdirp(FS, dir) {
    var parts = dir.split('/').filter(Boolean);
    var cur = '';
    parts.forEach(function (p) {
      cur += '/' + p;
      try { FS.mkdir(cur); } catch (e) { /* exists */ }
    });
  }

  function persistentHomeRoot() {
    return canonicalContext && canonicalContext.persistence
      ? canonicalContext.persistence.root : '/home';
  }

  function bindLinesFromConfig(text) {
    return String(text || '').split(/\r?\n/).filter(function (line) {
      return /^\s*bind\s+/i.test(line);
    }).join('\n');
  }

  function unlinkIfExists(FS, path) {
    try { FS.unlink(path); } catch (e) { /* missing */ }
  }

  /* A mid-game IDBFS flush can snapshot hunkusage.dat or a full in-game
   * writeconfig. After download ET execs etconfig.cfg again; latched r_*
   * values from that dump restart the renderer and drop the connection. */
  function sanitizePersistentHome(FS) {
    var home = persistentHomeRoot();
    ['hunkusage.dat', 'legacy/hunkusage.dat', 'etmain/hunkusage.dat',
      'legacy/eth32.cfg', 'etmain/eth32.cfg', 'eth32.cfg'].forEach(function (rel) {
      unlinkIfExists(FS, home + '/' + rel);
      unlinkIfExists(FS, '/' + rel);
    });
  }

  function writeSafeEtconfig(FS) {
    var stored = window.ETJSBinds ? window.ETJSBinds.loadBinds() : null;
    var bindsOnly = bindLinesFromConfig(stored);
    var home = persistentHomeRoot();
    var body = '// etjs: bindings only — cvars live in autoexec\n' +
      (bindsOnly ? bindsOnly + '\n' : '');
    mkdirp(FS, home + '/legacy');
    try { FS.writeFile(home + '/legacy/etconfig.cfg', body); } catch (e) { /* ignore */ }
    try { FS.writeFile('/legacy/etconfig.cfg', body); } catch (e) { /* ignore */ }
  }

  function writeEth32Config(FS) {
    var text = '';
    try {
      text = (typeof localStorage !== 'undefined' && localStorage.getItem('etjs.eth32cfg')) || '';
    } catch (e) { /* private mode */ }
    if (!text || text.indexOf('aimmode=') < 0) {
      return;
    }
    var home = persistentHomeRoot();
    mkdirp(FS, home + '/legacy');
    try { FS.writeFile(home + '/legacy/eth32nix.ini', text); } catch (e) { /* ignore */ }
  }

  function persistEth32Config() {
    var M = window.Module;
    if (!M || !M.FS) {
      return;
    }
    var home = persistentHomeRoot();
    var paths = [home + '/legacy/eth32nix.ini', '/legacy/eth32nix.ini',
      home + '/legacy/eth32.cfg', '/legacy/eth32.cfg'];
    var i;
    for (i = 0; i < paths.length; i++) {
      try {
        var text = M.FS.readFile(paths[i], { encoding: 'utf8' });
        if (text && text.indexOf('aimmode=') !== -1 && text.length < 65536) {
          localStorage.setItem('etjs.eth32cfg', text);
          return;
        }
      } catch (e) { /* not written yet */ }
    }
  }

  function writeAutoexec(FS) {
    var stored = window.ETJSBinds ? window.ETJSBinds.loadBinds() : null;
    var defaults = selectedAutoexecLines();
    var lines = window.ETJSBinds ? window.ETJSBinds.mergeAutoexec(defaults, stored) : defaults;
    var body = lines.join('\n') + '\n';
    var home = persistentHomeRoot();
    sanitizePersistentHome(FS);
    ['/etmain', '/legacy', home + '/etmain', home + '/legacy'].forEach(function (dir) {
      mkdirp(FS, dir);
      try { FS.writeFile(dir + '/autoexec.cfg', body); } catch (e) { /* ignore */ }
    });
    writeSafeEtconfig(FS);
    writeEth32Config(FS);
  }

  function persistBindsFromFS() {
    var M = window.Module;
    if (!M || !M.FS || !window.ETJSBinds) {
      return;
    }
    var home = persistentHomeRoot();
    var paths = [home + '/legacy/etconfig.cfg', home + '/etmain/etconfig.cfg'];
    var i;
    for (i = 0; i < paths.length; i++) {
      try {
        var text = M.FS.readFile(paths[i], { encoding: 'utf8' });
        if (text && text.length > 262144) {
          console.warn('ETJS skip oversized etconfig', paths[i], text.length);
          continue;
        }
        var bindsOnly = bindLinesFromConfig(text);
        if (bindsOnly) {
          window.ETJSBinds.saveBinds(bindsOnly);
          return;
        }
      } catch (e) { /* not written yet */ }
    }
  }

  function flushFrameworkPersistence() {
    persistBindsFromFS();
    if (!canonicalContext || !canonicalContext.persistence) {
      return Promise.resolve();
    }
    canonicalContext.persistence.markDirty();
    return canonicalContext.persistence.save().then(function () {
      if (typeof document !== 'undefined' && document.documentElement) {
        var saves = Number(document.documentElement.dataset.etjsPersistenceSaves || 0);
        document.documentElement.dataset.etjsPersistenceSaves = String(saves + 1);
      }
    }).catch(function (error) {
      if (typeof document !== 'undefined' && document.documentElement) {
        document.documentElement.dataset.etjsPersistence = 'failed';
      }
      console.warn('ETJS persistence flush failed', error);
    });
  }

  function writeMenuFiles(FS) {
    mkdirp(FS, '/legacy/ui');
    mkdirp(FS, persistentHomeRoot() + '/legacy/ui');
    return Promise.all([
      fetch('/legacy/ui/etjs_menus.txt').then(function (r) { return r.ok ? r.text() : ''; }),
      fetch('/legacy/ui/etjs_official.menu').then(function (r) { return r.ok ? r.text() : ''; }),
      fetch('/legacy/ui/main.menu').then(function (r) { return r.ok ? r.text() : ''; }),
      fetch('/legacy/ui/etjs_main.menu').then(function (r) { return r.ok ? r.text() : ''; }),
      fetch('/legacy/ui/etjs_bare.menu').then(function (r) { return r.ok ? r.text() : ''; }),
      fetch('/legacy/ui/etjs_ingame.menu').then(function (r) { return r.ok ? r.text() : ''; }),
      fetch('/legacy/ui/etjs_options.menu').then(function (r) { return r.ok ? r.text() : ''; })
    ]).then(function (texts) {
      ['/legacy/ui', persistentHomeRoot() + '/legacy/ui'].forEach(function (dir) {
        if (texts[0]) { try { FS.writeFile(dir + '/etjs_menus.txt', texts[0]); } catch (e) { /* ignore */ } }
        if (texts[1]) { try { FS.writeFile(dir + '/etjs_official.menu', texts[1]); } catch (e) { /* ignore */ } }
        if (texts[2]) { try { FS.writeFile(dir + '/main.menu', texts[2]); } catch (e) { /* ignore */ } }
        if (texts[3]) { try { FS.writeFile(dir + '/etjs_main.menu', texts[3]); } catch (e) { /* ignore */ } }
        if (texts[4]) { try { FS.writeFile(dir + '/etjs_bare.menu', texts[4]); } catch (e) { /* ignore */ } }
        if (texts[5]) { try { FS.writeFile(dir + '/etjs_ingame.menu', texts[5]); } catch (e) { /* ignore */ } }
        if (texts[6]) { try { FS.writeFile(dir + '/etjs_options.menu', texts[6]); } catch (e) { /* ignore */ } }
      });
    }).catch(function () { /* menus still served from pak overlay on next run */ });
  }

  function defaultGameFiles() {
    return [
      { parent: '/etmain', name: 'pak0.pk3', url: '/etmain/pak0.pk3', bytes: 228138631 },
      { parent: '/etmain', name: 'pak1.pk3', url: '/etmain/pak1.pk3', bytes: 51616 },
      { parent: '/etmain', name: 'pak2.pk3', url: '/etmain/pak2.pk3', bytes: 89910 },
      { parent: '/etmain', name: 'mp_bin.pk3', url: '/etmain/mp_bin.pk3', bytes: 1638102 },
      { parent: '/legacy', name: 'legacy_v2.84.0.pk3', url: '/legacy/legacy_v2.84.0.pk3', bytes: 34306898 },
      { parent: '/legacy', name: 'etjs.pk3', url: '/legacy/etjs.pk3', bytes: 200364 }
    ];
  }

  function gameFilesFromConfig(cfg) {
    var files = cfg && Array.isArray(cfg.assets) ? cfg.assets : null;
    var required = [
      '/etmain/pak0.pk3', '/etmain/pak1.pk3', '/etmain/pak2.pk3',
      '/etmain/mp_bin.pk3', '/legacy/legacy_v2.84.0.pk3', '/legacy/etjs.pk3'
    ];
    if (!files || files.length < required.length || files.some(function (file) {
      return !file || (file.parent !== '/etmain' && file.parent !== '/legacy') ||
        !/^[A-Za-z0-9_.-]+\.pk3$/.test(file.name || '') ||
        !/^\/(?:etmain|legacy)\/[A-Za-z0-9_.-]+\.pk3(?:\?v=[a-f0-9]+)?$/.test(file.url || '') ||
        !Number.isSafeInteger(file.bytes) || file.bytes <= 0 ||
        !/^sha256:[a-f0-9]{64}$/.test(String(file.cacheKey || '').split('@')[1] || '');
    }) || required.some(function (requiredPath) {
      return !files.some(function (file) { return file.parent + '/' + file.name === requiredPath; });
    })) {
      return defaultGameFiles();
    }
    return files;
  }

  function bindQuakejsInput() {
    /* Matches etlegacy/src/qcommon/keycodes.h (letters are lowercase ASCII). */
    var K_MOUSE1 = 178;
    /* etlegacy keycodes.h: K_CONSOLE is the hardcoded tilde toggle. */
    var K_CONSOLE = 297;
    var CODE_TO_KEY = {
      KeyW: 119, KeyS: 115, KeyA: 97, KeyD: 100,
      KeyC: 99, KeyE: 101, KeyQ: 113, KeyX: 120,
      KeyF: 102, KeyB: 98, KeyG: 103, KeyR: 114, KeyO: 111,
      KeyL: 108, KeyP: 112, KeyJ: 106, KeyI: 105,
      KeyH: 104, KeyK: 107, KeyN: 110, KeyT: 116,
      KeyY: 121, KeyU: 117, KeyV: 118, KeyZ: 122, KeyM: 109,
      Digit0: 48, Digit1: 49, Digit2: 50, Digit3: 51, Digit4: 52,
      Digit5: 53, Digit6: 54, Digit7: 55, Digit8: 56, Digit9: 57,
      Space: 32, Tab: 9, Enter: 13, Escape: 27, Backspace: 127,
      ShiftLeft: 138, ShiftRight: 138,
      ControlLeft: 137, ControlRight: 137,
      AltLeft: 136, AltRight: 136,
      CapsLock: 129,
      Delete: 140, Home: 143, End: 144,
      Backquote: 297,
      ArrowUp: 132, ArrowDown: 133, ArrowLeft: 134, ArrowRight: 135,
      F1: 145, F2: 146, F3: 147, F4: 148, F7: 151, F11: 155, F12: 156,
      Comma: 44, Period: 46, Equal: 61, Minus: 45,
      NumpadEnter: 169, NumpadAdd: 174, NumpadSubtract: 173,
      Numpad1: 166, Numpad2: 167, Numpad3: 168, Numpad4: 163,
      Numpad5: 164, Numpad6: 165, Numpad7: 160, Numpad8: 161
    };
    var MOUSE_TO_KEY = { 0: 178, 2: 179, 1: 180, 3: 181, 4: 182 };

    var moveF = 0;
    var moveR = 0;
    var moveU = 0;
    var ignoreLookUntil = 0;
    var wasLimbo = false;
    var wasDead = false;
    var wasUiOpen = false;
    var containedUiState = -1;
    var controllerMove = { forward: false, backward: false, left: false, right: false, jump: false, crouch: false };
    var controllerButtons = Object.create(null);
    var controllerButtonKeys = Object.create(null);

    function sendKey(key, down) {
      var M = window.Module;
      if (!M || !key) {
        return false;
      }
      try {
        if (typeof M._ETJS_KeyEvent === 'function') {
          M._ETJS_KeyEvent(key, down ? 1 : 0);
          return true;
        }
      } catch (e) { /* not ready */ }
      return false;
    }

    function sendChar(ch) {
      var M = window.Module;
      if (!M || !ch) {
        return false;
      }
      try {
        if (typeof M._ETJS_CharEvent === 'function') {
          M._ETJS_CharEvent(ch);
          return true;
        }
        if (typeof M.ccall === 'function') {
          M.ccall('ETJS_CharEvent', null, ['number'], [ch]);
          return true;
        }
      } catch (e) { /* not ready */ }
      return false;
    }

    function openCommunication(mode) {
      var M = window.Module;
      var opened = false;
      var exportAvailable = !!(M && typeof M._ETJS_OpenCommunication === 'function');
      communicationLog('open-attempt', {
        mode: mode,
        exportAvailable: exportAvailable,
        inWorld: inWorld(),
        uiOpen: engineUiOpen(),
        intermission: intermissionOpen(),
        pointerLocked: pointerLocked(),
        activeElement: document.activeElement && document.activeElement.id || ''
      });
      try {
        if (exportAvailable) {
          opened = M._ETJS_OpenCommunication(mode) !== 0;
        }
      } catch (e) {
        communicationLog('engine-exception', { mode: mode, message: String(e) });
      }
      if (!opened && !exportAvailable) {
        var fallback = mode === 1 ? 'messagemode' :
          (mode === 2 ? 'messagemode2' : 'mp_quickmessage');
        opened = engineCmd(fallback);
      }
      if (opened) {
        /* Pointer lock is released when the stock menu takes KEYCATCH_UI
         * or the ETH32 settings overlay sets cl_aimbotmenu (both publish
         * etjs_uiopen). Retain the keyboard session that opened it so text,
         * Enter/Escape, and voice-menu letter choices continue reaching ET. */
        communicationInput = true;
        communicationInputGraceUntil = Date.now() + 750;
        canvas.focus();
      }
      communicationLog('open-result', {
        mode: mode,
        opened: opened,
        engineUiOpen: engineUiOpen(),
        inputCaptured: inputCaptured()
      });
      return opened;
    }

    function handleCommunicationKey(code) {
      if (code === 'KeyT' || code === 'KeyY') {
        if (openCommunication(code === 'KeyT' ? 1 : 2)) {
          typingMode = 'chat';
        }
        return true;
      }
      if (code === 'KeyV') {
        openCommunication(3);
        return true;
      }
      return false;
    }

    function toggleInGameMenu(reason) {
      communicationLog('escape-menu-attempt', {
        reason: reason,
        inWorld: inWorld(),
        engineUiOpen: engineUiOpen(),
        pointerLocked: pointerLocked()
      });
      var down = sendKey(CODE_TO_KEY.Escape, 1);
      var up = sendKey(CODE_TO_KEY.Escape, 0);
      communicationLog('escape-menu-result', {
        reason: reason,
        keyDownSent: down,
        keyUpSent: up,
        engineUiOpen: engineUiOpen()
      });
      return down;
    }

    function showInGameMenuWhenUncaptured(reason) {
      if (!playReady || !inWorld() || engineUiOpen() || intermissionOpen() ||
          communicationInput || typingMode) {
        return false;
      }
      return toggleInGameMenu(reason);
    }

    canonicalCaptureLost = function (reason) {
      releaseInputHolds();
      return showInGameMenuWhenUncaptured(reason || 'framework-capture-lost');
    };

    function releaseInputHolds() {
      Object.keys(held).forEach(function (code) {
        var key = held[code];
        if (typeof key === 'number') {
          var sent = sendKey(key, 0);
          if (!sent && HOLD_KEYS[code] && HOLD_KEYS[code].charAt(0) === '+') {
            engineCmd('-' + HOLD_KEYS[code].slice(1));
          }
        } else if (typeof key === 'string' && key.charAt(0) === '+') {
          engineCmd('-' + key.slice(1));
        }
        delete held[code];
      });
      moveF = 0;
      moveR = 0;
      moveU = 0;
      sendMove();
    }

    function sendMove() {
      var M = window.Module;
      var move = window.ETJSInput
        ? window.ETJSInput.moveFromHeld({
          KeyW: !!held.KeyW || controllerMove.forward,
          KeyS: !!held.KeyS || controllerMove.backward,
          KeyA: !!held.KeyA || controllerMove.left,
          KeyD: !!held.KeyD || controllerMove.right,
          Space: !!held.Space || controllerMove.jump,
          KeyC: !!held.KeyC || controllerMove.crouch
        })
        : { forward: moveF, right: moveR, up: moveU };
      if (uiOpen()) {
        move = { forward: 0, right: 0, up: 0 };
      }
      moveF = move.forward;
      moveR = move.right;
      moveU = move.up;
      window.__etjsLastMove = move;
      if (M && typeof M._ETJS_SetMove === 'function') {
        try { M._ETJS_SetMove(move.forward, move.right, move.up); } catch (e) { /* not ready */ }
      }
    }

    function controllerKey(name, key, down) {
      var next = !!down;
      if (controllerButtons[name] === next) {
        return;
      }
      controllerButtons[name] = next;
      sendKey(key, next ? 1 : 0);
    }

    function releaseController() {
      Object.keys(controllerButtons).forEach(function (name) {
        if (controllerButtons[name]) {
          var key = controllerButtonKeys[name];
          if (key) { sendKey(key, 0); }
        }
      });
      controllerButtons = Object.create(null);
      controllerButtonKeys = Object.create(null);
      controllerMove = { forward: false, backward: false, left: false, right: false, jump: false, crouch: false };
      sendMove();
    }

    function setControllerKey(name, key, down) {
      if (key) { controllerButtonKeys[name] = key; }
      controllerKey(name, key, down);
    }

    canonicalControllerFrame = function (detail) {
      if (!playReady || !detail || !detail.actions) {
        return;
      }
      var actions = detail.actions;
      var down = function (name) { return Number(actions[name] || 0) > 0.4; };
      if (uiOpen()) {
        controllerMove = { forward: false, backward: false, left: false, right: false, jump: false, crouch: false };
        sendMove();
        ['attack', 'alt-attack', 'weapon', 'previous-weapon', 'next-weapon', 'reload',
          'sprint', 'scoreboard', 'menu', 'activate'].forEach(function (name) {
          setControllerKey(name, controllerButtonKeys[name] || 0, false);
        });
        setControllerKey('menu-up', 132, down('forward'));
        setControllerKey('menu-down', 133, down('backward'));
        setControllerKey('menu-left', 134, down('left'));
        setControllerKey('menu-right', 135, down('right'));
        setControllerKey('menu-accept', 13, down('jump') || down('attack'));
        setControllerKey('menu-back', 27, down('crouch') || down('menu'));
      } else {
        ['menu-up', 'menu-down', 'menu-left', 'menu-right', 'menu-accept', 'menu-back'].forEach(function (name) {
          setControllerKey(name, controllerButtonKeys[name] || 0, false);
        });
        controllerMove.forward = down('forward');
        controllerMove.backward = down('backward');
        controllerMove.left = down('left');
        controllerMove.right = down('right');
        controllerMove.jump = down('jump');
        controllerMove.crouch = down('crouch');
        sendMove();
        setControllerKey('attack', 178, down('attack'));
        setControllerKey('alt-attack', 179, down('altAttack'));
        setControllerKey('weapon', 180, down('weapon'));
        setControllerKey('previous-weapon', 183, down('previousWeapon'));
        setControllerKey('next-weapon', 184, down('nextWeapon'));
        setControllerKey('reload', 114, down('reload'));
        setControllerKey('sprint', 138, down('sprint'));
        setControllerKey('scoreboard', 9, down('scoreboard'));
        setControllerKey('menu', 27, down('menu'));
        setControllerKey('activate', 102, down('melee'));
        var delta = Math.max(1, Number(detail.deltaMs) || 16);
        if (actions.lookX || actions.lookY) {
          addLook(-Number(actions.lookX || 0) * delta * 0.25,
            Number(actions.lookY || 0) * delta * 0.25);
        }
      }
    };

    canonicalControllerChanged = function (detail) {
      if (!detail || detail.activeIndex == null || detail.selection === 'disabled') {
        releaseController();
      }
    };

    function cvarInt(name) {
      var M = window.Module;
      try {
        if (M && typeof M.ccall === 'function') {
          return M.ccall('ETJS_CvarInt', 'number', ['string'], [name]);
        }
      } catch (e) { /* not ready */ }
      return 0;
    }

    var QUALITY_PROFILES = [
      {
        name: 'minimum',
        commands: ['set r_dynamiclight 0', 'set cg_shadows 0', 'set cg_atmosphericEffects 0',
          'set cg_markTime 0', 'set r_lodbias 2', 'set r_fastsky 1']
      },
      {
        name: 'performance',
        commands: ['set r_dynamiclight 1', 'set cg_shadows 0', 'set cg_atmosphericEffects 0',
          'set cg_markTime 5000', 'set r_lodbias 1', 'set r_fastsky 0']
      },
      {
        name: 'balanced',
        commands: ['set r_dynamiclight 1', 'set cg_shadows 1', 'set cg_atmosphericEffects 0.5',
          'set cg_markTime 10000', 'set r_lodbias 0', 'set r_fastsky 0']
      },
      {
        name: 'maximum',
        commands: ['set r_dynamiclight 2', 'set cg_shadows 1', 'set cg_atmosphericEffects 1',
          'set cg_markTime 20000', 'set r_lodbias 0', 'set r_fastsky 0']
      }
    ];
    var qualityCeiling = Math.max(0, Math.min(QUALITY_PROFILES.length - 1, selectedQualityLevel));
    var qualityLevel = qualityCeiling;
    var qualityWindowStart = 0;
    var qualityFrames = 0;
    var lowFpsWindows = 0;
    var highFpsWindows = 0;

    function applyQualityProfile(level, fps) {
      var next = Math.max(0, Math.min(QUALITY_PROFILES.length - 1, level));
      var profile = QUALITY_PROFILES[next];
      qualityLevel = next;
      engineCmd(profile.commands.join('\n'));
      engineCmd('set etjs_quality ' + next);
      window.__etjsQuality = {
        level: next,
        name: profile.name,
        fps: Math.round(fps * 10) / 10,
        targetFps: selectedFpsTarget
      };
      console.log('ETJS quality=' + profile.name + ' fps=' + window.__etjsQuality.fps);
    }

    function monitorQuality(now) {
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(monitorQuality);
      }
      if (!playReady || !inWorld() || document.visibilityState === 'hidden' ||
          cvarInt('etjs_autoQuality') === 0) {
        qualityWindowStart = 0;
        qualityFrames = 0;
        lowFpsWindows = 0;
        highFpsWindows = 0;
        return;
      }
      if (!qualityWindowStart) {
        qualityWindowStart = now;
        qualityFrames = 0;
        return;
      }
      qualityFrames++;
      var elapsed = now - qualityWindowStart;
      if (elapsed < 3000) {
        return;
      }
      var fps = qualityFrames * 1000 / elapsed;
      qualityWindowStart = now;
      qualityFrames = 0;
      lowFpsWindows = fps < selectedFpsTarget * 0.92 ? lowFpsWindows + 1 : 0;
      highFpsWindows = fps >= selectedFpsTarget * 0.985 ? highFpsWindows + 1 : 0;
      if (lowFpsWindows >= 2 && qualityLevel > 0) {
        applyQualityProfile(qualityLevel - 1, fps);
        lowFpsWindows = 0;
        highFpsWindows = 0;
      } else if (highFpsWindows >= 5 && qualityLevel < qualityCeiling) {
        applyQualityProfile(qualityLevel + 1, fps);
        lowFpsWindows = 0;
        highFpsWindows = 0;
      } else {
        window.__etjsQuality = {
          level: qualityLevel,
          name: QUALITY_PROFILES[qualityLevel].name,
          fps: Math.round(fps * 10) / 10,
          targetFps: selectedFpsTarget
        };
      }
    }

    function limboOpen() {
      return cvarInt('etjs_limbo') !== 0;
    }

    function intermissionOpen() {
      return cvarInt('etjs_intermission') !== 0;
    }

    function engineUiOpen() {
      /* Stock ESC menu publishes etjs_uiopen from KEYCATCH_UI. The ETH32
       * settings overlay never takes KEYCATCH_UI (that would raise the
       * native menu), so also honor cl_aimbotmenu as the same pause/unlock. */
      return cvarInt('etjs_uiopen') !== 0 || cvarInt('cl_aimbotmenu') !== 0;
    }

    function inWorld() {
      return cvarInt('etjs_ingame') !== 0;
    }

    function uiOpen() {
      return !inWorld() || engineUiOpen() || limboOpen() || intermissionOpen();
    }

    function isConsoleEvent(ev, code) {
      return code === 'Backquote' || ev.code === 'Backquote' ||
        ev.key === '`' || ev.key === '~';
    }

    function inputCaptured() {
      var captured = (canonicalContext ? frameworkInputCaptured :
        (pointerLocked() || document.activeElement === canvas)) || communicationInput || !!typingMode;
      window.__etjsInputCaptured = captured;
      return captured;
    }

    function consoleOpen() {
      return cvarInt('etjs_console') !== 0;
    }

    function engineWantsKeys() {
      /* Pointer lock is released for the stock menu, limbo, debrief, and the
       * ETH32 overlay. Those surfaces still need Escape, grave, and clicks
       * even though the framework reports capture=false. */
      return playReady && (inputCaptured() || uiOpen() || !!typingMode || consoleOpen());
    }

    function browserChord(ev, code) {
      return ev.metaKey || (ev.ctrlKey && code !== 'ControlLeft' && code !== 'ControlRight');
    }

    function bareControl(code) {
      return code === 'ControlLeft' || code === 'ControlRight';
    }

    function syncCursor() {
      if (uiOpen()) {
        if (canvas && canvas.style) {
          /* ET draws its own cursor. Keep the browser cursor available
           * everywhere else on the page, but never double it over canvas. */
          canvas.style.cursor = 'none';
        }
        if (document.body && document.body.style) {
          document.body.style.cursor = 'default';
        }
      } else if (canvas && canvas.style) {
        canvas.style.cursor = pointerLocked() ? 'none' : 'default';
      }
    }

    function resolveCode(ev) {
      if (ev.code) {
        return ev.code;
      }
      var k = ev.key ? String(ev.key).toLowerCase() : '';
      if (k === 'w') { return 'KeyW'; }
      if (k === 'a') { return 'KeyA'; }
      if (k === 's') { return 'KeyS'; }
      if (k === 'd') { return 'KeyD'; }
      if (k === ' ') { return 'Space'; }
      if (k === 'c') { return 'KeyC'; }
      return '';
    }

    function onKeyDown(ev) {
      var initialCode = resolveCode(ev) || ev.code;
      if (initialCode === 'KeyT' || initialCode === 'KeyY' || initialCode === 'KeyV' ||
          initialCode === 'Escape') {
        communicationLog('keydown', {
          code: initialCode,
          key: ev.key || '',
          repeat: !!ev.repeat,
          playReady: playReady,
          captured: inputCaptured(),
          pointerLocked: pointerLocked(),
          inWorld: inWorld(),
          uiOpen: engineUiOpen(),
          intermission: intermissionOpen(),
          typingMode: typingMode || '',
          target: ev.target && (ev.target.id || ev.target.tagName) || '',
          activeElement: document.activeElement && (document.activeElement.id || document.activeElement.tagName) || '',
          ctrl: !!ev.ctrlKey,
          alt: !!ev.altKey,
          meta: !!ev.metaKey
        });
      }
      /* Browser/system chords always win. Bare Ctrl remains available as an
       * ET key, while Ctrl+Shift+R, Ctrl+R, Cmd+R, Ctrl+L, and devtools never
       * become game input or have their browser defaults cancelled. */
      if (browserChord(ev, initialCode)) {
        /* SDL's Emscripten handler otherwise cancels every Ctrl chord. Stop
         * dispatch without cancelling the browser default, so refresh, copy,
         * location focus and developer tools continue to work. */
        ev.stopImmediatePropagation();
        return;
      }
      if (ev.target && ev.target.closest && ev.target.closest('#name-gate')) {
        return;
      }
      /* Grave is hardcoded CONSOLE_KEY even when pointer lock is down and
       * even when the ETH32 overlay has released capture. Handle it before
       * the capture gate so it cannot get stuck behind a menu or desync
       * from SDL's own listener. */
      if (isConsoleEvent(ev, initialCode)) {
        ev.preventDefault();
        ev.stopImmediatePropagation();
        if (!playReady || ev.repeat) {
          return;
        }
        sendKey(K_CONSOLE, 1);
        sendKey(K_CONSOLE, 0);
        releaseInputHolds();
        if (canvas && typeof canvas.focus === 'function') {
          canvas.focus();
        }
        return;
      }
      if (!engineWantsKeys()) {
        return;
      }
      var code = initialCode;
      if (typingMode) {
        /* Firefox uses `/` to open Quick Find. Cancelling keydown also
         * suppresses SDL's later textinput event, so inject printable Unicode
         * directly into ET before consuming the browser event. */
        if (ev.key && ev.key.length === 1 && !ev.isComposing) {
          ev.preventDefault();
          ev.stopImmediatePropagation();
          sendChar(ev.key.codePointAt(0));
          return;
        }
        if (code === 'Backspace' || code === 'Enter' ||
            code === 'NumpadEnter' || code === 'Tab' || code === 'Escape' ||
            code === 'ArrowUp' || code === 'ArrowDown') {
          ev.preventDefault();
          ev.stopImmediatePropagation();
          /* Cancelling the browser event also hides it from SDL, so deliver
           * these console/chat editing controls explicitly. */
          var editingKey = CODE_TO_KEY[code];
          sendKey(editingKey, 1);
          if (code === 'Backspace') {
            /* Match sdl_input.c: ET sends both K_BACKSPACE and ASCII BS.
             * Console/chat fields depend on the character event in some
             * catcher states. */
            sendChar(8);
          }
          sendKey(editingKey, 0);
        }
        if (code === 'Escape') {
          typingMode = null;
          releaseInputHolds();
        } else if (typingMode === 'chat' && (code === 'Enter' || code === 'NumpadEnter')) {
          typingMode = null;
        }
        return;
      }
      /* The debrief owns the cgame key catcher and its CHAT field is always
       * ready for input. Feed text and editing keys directly to that native
       * field so T, Y and V remain ordinary letters. Voice chat is opened by
       * the debrief's clickable QUICK CHAT button, matching stock ET. */
      if (intermissionOpen() && !engineUiOpen()) {
        if (ev.key && ev.key.length === 1 && !ev.isComposing) {
          ev.preventDefault();
          ev.stopImmediatePropagation();
          sendChar(ev.key.codePointAt(0));
          return;
        }
        if (code === 'Backspace' || code === 'Enter' ||
            code === 'NumpadEnter' || code === 'Delete' ||
            code === 'ArrowLeft' || code === 'ArrowRight' ||
            code === 'Home' || code === 'End') {
          ev.preventDefault();
          ev.stopImmediatePropagation();
          var debriefKey = CODE_TO_KEY[code];
          sendKey(debriefKey, 1);
          if (code === 'Backspace') {
            sendChar(8);
          }
          sendKey(debriefKey, 0);
          return;
        }
      }
      if (uiOpen()) {
        var menuKey = CODE_TO_KEY[code] ||
          (ev.key && ev.key.length === 1 ? ev.key.toLowerCase().charCodeAt(0) : 0);
        if (!menuKey) {
          return;
        }
        ev.preventDefault();
        ev.stopImmediatePropagation();
        if (ev.repeat) {
          return;
        }
        held[code] = menuKey;
        sendKey(menuKey, 1);
        return;
      }
      /* Gameplay bindings all take the same native CL_KeyEvent route.  T/Y/V
       * and Escape are not browser commands: treating them specially bypassed
       * ET's binding/cgame transitions while Ctrl and Tab continued to work. */
      var key = CODE_TO_KEY[code];
      if (!key && ev.key && ev.key.length === 1) {
        key = ev.key.toLowerCase().charCodeAt(0);
      }
      if (!key) {
        return;
      }
      if (bareControl(code)) {
        ev.stopImmediatePropagation();
      } else {
        ev.preventDefault();
      }
      if (ev.repeat) {
        return;
      }
      held[code] = key;
      if (code === 'KeyW') { moveF = 1; }
      else if (code === 'KeyS') { moveF = -1; }
      else if (code === 'KeyD') { moveR = 1; }
      else if (code === 'KeyA') { moveR = -1; }
      else if (code === 'Space') { moveU = 1; }
      else if (code === 'KeyC') { moveU = -1; }
      sendMove();
      var keySent = sendKey(key, 1);
      if (keySent && (code === 'KeyT' || code === 'KeyY' || code === 'KeyU')) {
        typingMode = 'chat';
        communicationInput = true;
      }
      if (!keySent) {
        if (code === 'KeyL') {
          engineCmd('openlimbomenu');
        } else if (HOLD_KEYS[code]) {
          engineCmd(HOLD_KEYS[code]);
        } else if (TAP_KEYS[code]) {
          engineCmd(TAP_KEYS[code]);
        }
      }
    }

    function onKeyUp(ev) {
      var initialCode = resolveCode(ev) || ev.code;
      if (browserChord(ev, initialCode)) {
        ev.stopImmediatePropagation();
        return;
      }
      if (!engineWantsKeys()) {
        return;
      }
      var code = initialCode;
      var key = held[code] || CODE_TO_KEY[code];
      if (key) {
        if (bareControl(code)) {
          ev.stopImmediatePropagation();
        } else {
          ev.preventDefault();
        }
        var sent = sendKey(key, 0);
        if (code === 'KeyW' && moveF > 0) { moveF = 0; }
        else if (code === 'KeyS' && moveF < 0) { moveF = 0; }
        else if (code === 'KeyD' && moveR > 0) { moveR = 0; }
        else if (code === 'KeyA' && moveR < 0) { moveR = 0; }
        else if (code === 'Space' && moveU > 0) { moveU = 0; }
        else if (code === 'KeyC' && moveU < 0) { moveU = 0; }
        sendMove();
        if (!sent && HOLD_KEYS[code] && HOLD_KEYS[code].charAt(0) === '+') {
          engineCmd('-' + HOLD_KEYS[code].slice(1));
        }
        delete held[code];
      }
    }

    function pushCursor(ev) {
      var rect = canvas.getBoundingClientRect();
      var mapped = window.ETJSInput
        ? window.ETJSInput.letterboxTo640(ev.clientX, ev.clientY, rect,
          uiOpen())
        : { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
      pushCursorPoint(mapped.x, mapped.y);
    }

    function pushCursorPoint(x, y) {
      var M = window.Module;
      if (!M || typeof M._ETJS_SetCursor !== 'function') {
        return false;
      }
      try { M._ETJS_SetCursor(x, y); } catch (e) { return false; }
      return true;
    }

    function onMouseDown(ev) {
      if (!playReady || typingMode || (ev.target !== canvas && !pointerLocked())) {
        return;
      }
      if (canonicalContext && !pointerLocked()) {
        return;
      }
      canvas.focus();
      window.__etjsInputCaptured = true;
      syncCursor();
      var contained = uiOpen() ? 1 : 0;
      if (contained !== containedUiState) {
        containedUiState = contained;
        engineCmd('set etjs_containui ' + contained);
      }
      pushCursor(ev);
      var mkey = MOUSE_TO_KEY[ev.button] || (K_MOUSE1 + ev.button);
      /* QuakeJS always delivers mouse down AND up. Menu/limbo must too. */
      if (uiOpen()) {
        held['mouse' + ev.button] = mkey;
        sendKey(mkey, 1);
        return;
      }
      ev.preventDefault();
      ev.stopImmediatePropagation();
      if (window.ETJSInput && !window.ETJSInput.shouldFireOnMouseDown(true, false, pointerLocked())) {
        return;
      }
      held['mouse' + ev.button] = mkey;
      if (!sendKey(mkey, 1)) {
        if (MOUSE_HOLD[ev.button]) {
          engineCmd(MOUSE_HOLD[ev.button]);
        } else if (MOUSE_TAP[ev.button]) {
          engineCmd(MOUSE_TAP[ev.button]);
        }
      }
    }

    function onMouseUp(ev) {
      if (canonicalContext && !pointerLocked()) {
        return;
      }
      var id = 'mouse' + ev.button;
      var mkey = held[id];
      if (mkey) {
        ev.preventDefault();
        ev.stopImmediatePropagation();
        var sent = sendKey(mkey, 0);
        if (!sent && MOUSE_HOLD[ev.button]) {
          engineCmd('-' + MOUSE_HOLD[ev.button].slice(1));
        }
        delete held[id];
      }
    }

    function onMouseMove(ev) {
      if (!playReady || typingMode || !inputCaptured()) {
        return;
      }
      if (canonicalContext && !pointerLocked()) {
        return;
      }
      var limbo = limboOpen();
      var gameUi = limbo || intermissionOpen();
      if (wasLimbo && !limbo) {
        ignoreLookUntil = Date.now() + 600;
      }
      wasLimbo = limbo;
      if (Date.now() < ignoreLookUntil) {
        if (gameUi || !inWorld()) {
          syncCursor();
          pushCursor(ev);
        }
        return;
      }
      var mx = ev.movementX || ev.webkitMovementX || 0;
      var my = ev.movementY || ev.webkitMovementY || 0;
      if (!inWorld() || gameUi || !pointerLocked()) {
        syncCursor();
        pushCursor(ev);
        return;
      }
      if (mx || my) {
        addLook(-mx * 0.12, my * 0.12);
      }
    }

    function onWheel(ev) {
      if (!playReady || typingMode || limboOpen() || !inputCaptured()) {
        return;
      }
      ev.preventDefault();
      ev.stopImmediatePropagation();
      sendKey(ev.deltaY > 0 ? 183 : 184, 1);
      sendKey(ev.deltaY > 0 ? 183 : 184, 0);
    }

    function onContextMenu(ev) {
      if (playReady && pointerLocked()) {
        ev.preventDefault();
      }
    }

    function onMouseOut(ev) {
      if (!playReady) {
        return;
      }
      [0, 1, 2, 3, 4].forEach(function (button) {
        var id = 'mouse' + button;
        var mkey = held[id];
        if (mkey) {
          sendKey(mkey, 0);
          delete held[id];
        }
      });
    }

    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('mousemove', onMouseMove, true);
    window.addEventListener('mousedown', onMouseDown, true);
    window.addEventListener('mouseup', onMouseUp, true);
    window.addEventListener('wheel', onWheel, { capture: true, passive: false });
    window.addEventListener('contextmenu', onContextMenu, true);
    window.addEventListener('blur', function () {
      var shouldShowMenu = !communicationInput && !typingMode;
      releaseInputHolds();
      communicationInput = false;
      window.__etjsInputCaptured = false;
      if (shouldShowMenu && !canonicalContext) {
        showInGameMenuWhenUncaptured('window-blur');
      }
    });
    canvas.addEventListener('blur', function () {
      if (!pointerLocked()) {
        releaseInputHolds();
        window.__etjsInputCaptured = false;
      }
    });
    document.addEventListener('pointerlockchange', function () {
      if (pointerLocked()) {
        ignoreLookUntil = Date.now() + 350;
        frameworkInputCaptured = true;
        window.__etjsInputCaptured = true;
      } else {
        frameworkInputCaptured = false;
        releaseInputHolds();
        window.__etjsInputCaptured = false;
        /* The canonical framework invokes captureLost() exactly once. Retain
         * this direct fallback only for the old standalone bootstrap path. */
        if (!canonicalContext) {
          showInGameMenuWhenUncaptured('pointer-lock-lost');
        }
      }
    });
    canvas.addEventListener('mouseout', onMouseOut, true);

    canonicalPointerMove = function (detail) {
      if (!playReady || !detail) {
        return false;
      }
      var contained = uiOpen() ? 1 : 0;
      if (contained !== containedUiState) {
        containedUiState = contained;
        engineCmd('set etjs_containui ' + contained);
      }
      return pushCursorPoint(detail.x, detail.y);
    };

    canonicalPointerButton = function (detail) {
      if (!playReady || typingMode || !detail) {
        return false;
      }
      canonicalPointerMove(detail);
      var id = 'mouse' + detail.button;
      var mkey = MOUSE_TO_KEY[detail.button] || (K_MOUSE1 + detail.button);
      if (detail.pressed) {
        held[id] = mkey;
        if (sendKey(mkey, 1)) {
          return true;
        }
        if (MOUSE_HOLD[detail.button]) {
          return engineCmd(MOUSE_HOLD[detail.button]);
        }
        return MOUSE_TAP[detail.button] ? engineCmd(MOUSE_TAP[detail.button]) : false;
      }
      if (held[id]) {
        delete held[id];
        if (sendKey(mkey, 0)) {
          return true;
        }
        return MOUSE_HOLD[detail.button]
          ? engineCmd('-' + MOUSE_HOLD[detail.button].slice(1))
          : false;
      }
      return false;
    };

    canonicalInputCaptureChanged = function (captured) {
      frameworkInputCaptured = captured === true;
      window.__etjsInputCaptured = frameworkInputCaptured;
      if (frameworkInputCaptured) {
        ignoreLookUntil = Date.now() + 350;
        focusForInput();
      } else {
        releaseInputHolds();
      }
    };

    canonicalPreferencesChanged = function (values) {
      values = values || {};
      var quality = Number(values.qualityProfile);
      var fps = Number(values.targetFps);
      if (quality >= 0 && quality < QUALITY_PROFILES.length) {
        selectedQualityLevel = quality;
        qualityCeiling = quality;
        applyQualityProfile(quality, 0);
      }
      if ([30, 60, 120].indexOf(fps) !== -1) {
        selectedFpsTarget = fps;
        engineCmd('set com_maxfps ' + fps);
      }
      adaptiveQuality = values.dynamicQuality !== false;
      engineCmd('set etjs_autoQuality ' + (adaptiveQuality ? 1 : 0));
      if (values.playerName) {
        engineCmd('set name "' + String(values.playerName).replace(/[";\r\n]/g, '') + '"');
      }
      if (window.Module && window.Module.FS) {
        writeSafeEtconfig(window.Module.FS);
      }
      setTimeout(function () { void flushFrameworkPersistence(); }, 0);
    };

    canonicalContextLost = function () {
      frameworkContextLost = true;
      releaseInputHolds();
      if (frameworkEngineState === 'gameplay') {
        setFrameworkEngineState('paused');
      }
      console.error('ETJS WebGL context lost');
    };

    canonicalContextRestored = function () {
      frameworkContextLost = false;
      sizeCanvas();
      console.info('ETJS WebGL context restored');
    };
    function pumpMove() {
      var openUi = uiOpen();
      if (openUi && !wasUiOpen) {
        releaseInputHolds();
        if (canvas && typeof canvas.focus === 'function') {
          canvas.focus();
        }
      }
      wasUiOpen = openUi;
      if (consoleOpen()) {
        if (typingMode !== 'chat') {
          typingMode = 'console';
        }
      } else if (typingMode === 'console') {
        typingMode = null;
      }
      if (cvarInt('etjs_eth32save')) {
        engineCmd('set etjs_eth32save 0');
        persistEth32Config();
      }
      sendMove();
      if (communicationInput && !typingMode &&
          Date.now() > communicationInputGraceUntil && !engineUiOpen()) {
        communicationInput = false;
      }
      var dead = cvarInt('etjs_dead') !== 0;
      if (wasDead && !dead) {
        /* The server supplies a fresh spawn view, while the browser keeps an
         * absolute pitch accumulator. Rebase it before the next usercmd so a
         * downward death view cannot clamp the new camera at one pole. */
        engineCmd('set etjs_resetlook 1');
        ignoreLookUntil = Date.now() + 100;
      }
      wasDead = dead;
      var nextFrameworkState = frameworkContextLost ? 'paused' : (frameworkCaptureIntent ? 'loading' :
        (intermissionOpen() ? 'debrief' :
          (!inWorld() ? 'menu' : ((engineUiOpen() || limboOpen()) ? 'paused' : 'gameplay'))));
      if (nextFrameworkState !== 'loading') {
        frameworkCaptureIntent = false;
      }
      setFrameworkEngineState(nextFrameworkState);
      /* Intermission is entered by a snapshot rather than a DOM event. Polling
       * here releases pointer lock immediately even if the mouse is stationary. */
      syncCursor();
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(pumpMove);
      }
    }
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(pumpMove);
      requestAnimationFrame(monitorQuality);
    }
  }

  function startEngine(playerName) {
    setFrameworkEngineState('loading');
    if (wasmShell) {
      wasmShell.showLoading();
    } else if (loadPanel) {
      loadPanel.hidden = false;
      loadPanel.classList.remove('hidden');
    }
    setLoadProgress(0.10, 'Preparing Wolfenstein: Enemy Territory…', 'Starting the game');
    sizeCanvas();
    window.addEventListener('resize', sizeCanvas);

    return fetch('/config.json').then(function (res) { return res.json(); }).catch(function () {
      return { connect: window.location.hostname + ':27961' };
    }).then(function (cfg) {
      var args = engineArgs(playerName, cfg);
      var started = false;

      if (typeof WebAssembly !== 'undefined' && WebAssembly.Memory &&
          WebAssembly.Memory.prototype && !WebAssembly.Memory.prototype.__etjsGrowHook) {
        var origGrow = WebAssembly.Memory.prototype.grow;
        WebAssembly.Memory.prototype.grow = function (pages) {
          var from = this.buffer ? this.buffer.byteLength : 0;
          console.log('ETJS wasm grow pages=' + pages + ' from=' + from);
          try {
            return origGrow.call(this, pages);
          } catch (err) {
            console.error('ETJS wasm grow failed pages=' + pages + ' from=' + from, err);
            throw err;
          }
        };
        WebAssembly.Memory.prototype.__etjsGrowHook = true;
      }

      window.Module = {
        canvas: canvas,
        elementPointerLock: false,
        arguments: args,
        etjsWakeAndJoin: function (address) {
          var connectAddress = String(address || cfg.connect || '127.0.0.1:27961')
            .replace(/[^A-Za-z0-9.:[\]_-]/g, '');
          /* Server startup belongs to the web Play/loading phase. By the time
           * MAIN is visible, JOIN GAME only has to begin the ET connection. */
          frameworkCaptureIntent = true;
          setFrameworkEngineState('loading');
          if (wasmShell) {
            /* Play already woke the dedicated server and admitted the player
             * to the native menu. JOIN is an in-engine connection transition;
             * never reveal the launcher/loading card again from here. */
            wasmShell.showRuntime();
          } else {
            if (frame) {
              frame.hidden = false;
              frame.classList.remove('hidden');
            }
          }
          stopMenuMusic();
          setLoadProgress(0.28, 'Connecting to game server…', connectAddress);
          engineCmd('connect ' + connectAddress);
          return Promise.resolve();
        },
        etjsAdminCommand: function (command) {
          fetch('/admin', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ command: String(command || '') })
          }).then(function (response) {
            return response.json().then(function (body) {
              if (!response.ok || !body.ok) {
                throw new Error(body.error || ('HTTP ' + response.status));
              }
              return body.message || 'OK';
            });
          }).then(function (message) {
            String(message).split(/\r?\n/).slice(0, 80).forEach(function (line) {
              engineCmd('echo "^2[admin]^7 ' + line.replace(/[";\r\n]/g, '') + '"');
            });
          }).catch(function (err) {
            engineCmd('echo "^1[admin]^7 ' + String(err.message || err).replace(/[";\r\n]/g, '') + '"');
          });
        },
        noInitialRun: true,
        locateFile: function (path) {
          return '/client/' + path + '?v=' + (window.ETJS_ASSET_VER || Date.now());
        },
        print: function (text) {
          console.log(text);
          onEngineLine(text, 'info');
        },
        printErr: function (text) {
          var s = String(text || '');
          if (/WARNING|couldn't exec|not found|was not found|skipping|Sound memory|SDL audio/i.test(s)) {
            console.log(s);
          } else {
            console.error(s);
          }
          onEngineLine(s, /WARNING|couldn't exec|not found|was not found|skipping/i.test(s) ? 'warn' : 'error');
        },
        onAbort: function (what) {
          console.error('ETJS abort', what);
          showError('Engine aborted: ' + what);
        },
        websocket: {
          url: (typeof window.location !== 'undefined')
            ? (window.location.protocol === 'https:' ? 'wss://' : 'ws://') + window.location.host + '/ws'
            : 'ws://127.0.0.1:8088/ws'
        },
        preRun: [function () {
          var FS = window.Module.FS;
          var persistentReady = canonicalContext && canonicalContext.persistence
            ? canonicalContext.persistence.attach(FS, { root: canonicalContext.persistence.root })
            : Promise.resolve(null);
          persistentReady.then(function () {
            if (typeof document !== 'undefined' && document.documentElement) {
              document.documentElement.dataset.etjsPersistence = 'ready';
            }
          }).catch(function () {
            if (typeof document !== 'undefined' && document.documentElement) {
              document.documentElement.dataset.etjsPersistence = 'failed';
            }
          });
          window.Module.etjsPersistent = persistentReady;
          window.Module.etjsMenus = persistentReady.then(function () {
            writeAutoexec(FS);
            return writeMenuFiles(FS);
          });
          var files = gameFilesFromConfig(cfg);
          var loaded = files.map(function () { return 0; });
          var totals = files.map(function (f) { return f.bytes || 1; });
          var sources = files.map(function () { return 'pending'; });
          function report() {
            var got = 0;
            var all = 0;
            var i;
            for (i = 0; i < files.length; i++) {
              got += loaded[i];
              all += totals[i];
            }
            var cached = sources.filter(function (source) { return source === 'cache'; }).length;
            var network = sources.filter(function (source) { return source === 'network'; }).length;
            var pending = sources.length - cached - network;
            window.__etjsAssets = {
              cached: cached,
              network: network,
              pending: pending,
              total: files.length
            };
            setLoadProgress(0.05 + 0.85 * (all ? got / all : 0),
              'Preparing Wolfenstein: Enemy Territory…',
              'Getting the battlefield ready · ' + Math.round(100 * (all ? got / all : 0)) + '%');
          }
          report();
          window.Module.etjsReady = Promise.all([
            persistentReady,
            preloadGameFiles(window.Module, files, function (idx, got, total, source) {
              loaded[idx] = got;
              if (total) {
                totals[idx] = total;
              }
              if (source) {
                sources[idx] = source;
              }
              report();
            }),
            window.Module.etjsMenus || Promise.resolve()
          ]);
        }],
        onRuntimeInitialized: function () {
          if (started) {
            return;
          }
          var ready = window.Module.etjsReady || Promise.resolve();
          ready.then(function () {
            if (started) {
              return;
            }
            started = true;
            setLoadProgress(0.96, 'Starting Wolfenstein: Enemy Territory…', 'Opening the main menu');
            if (!wasmShell && frame) {
              frame.hidden = false;
              frame.classList.remove('hidden');
            }
            canvas.width = window.innerWidth || 1024;
            canvas.height = window.innerHeight || 768;
            try {
              window.Module.preinitializedWebGLContext = ensureWebGL();
            } catch (glErr) {
              showError(glErr.message || String(glErr));
              return;
            }
            try {
              if (typeof window.Module.callMain === 'function') {
                window.Module.callMain(args);
              }
            } catch (startErr) {
              console.error('ETJS callMain failed', startErr);
              showError(startErr.message || String(startErr));
            }
            setTimeout(installDefaultBinds, 1200);
            setTimeout(function () { void flushFrameworkPersistence(); }, 4000);
            setInterval(function () {
              if (window.Module && window.Module.FS) {
                writeSafeEtconfig(window.Module.FS);
              }
              persistEth32Config();
              void flushFrameworkPersistence();
            }, 15000);
          }).catch(function (err) {
            console.error('ETJS engine start failed', err);
            showError(err.message || String(err));
          });
        }
      };

      if (!window.WebGLRenderingContext && !window.WebGL2RenderingContext) {
        throw new Error('WebGL is required');
      }
      bindQuakejsInput();
      if (!window.__etjsPreserveGL) {
        window.__etjsPreserveGL = true;
        var origGetContext = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (type, attrs) {
          attrs = attrs || {};
          if (type && String(type).indexOf('webgl') !== -1) {
            attrs.preserveDrawingBuffer = true;
            attrs.antialias = selectedQualityLevel >= 3;
          }
          return origGetContext.call(this, type, attrs);
        };
      }

      var glNoop = function () { return 0; };
      [
        'glActiveTextureARB', 'glAttachObjectARB', 'glBindFramebufferEXT',
        'glBindRenderbufferEXT', 'glCallList', 'glCheckFramebufferStatusEXT',
        'glClientActiveTextureARB', 'glCompileShaderARB', 'glCreateProgramObjectARB',
        'glCreateShaderObjectARB', 'glDeleteFramebuffersEXT', 'glDeleteRenderbuffersEXT',
        'glDetachObjectARB', 'glFramebufferRenderbufferEXT', 'glGenFramebuffersEXT',
        'glGenRenderbuffersEXT', 'glLinkProgramARB', 'glLockArraysEXT',
        'glRenderbufferStorageEXT', 'glRenderbufferStorageMultisampleEXT',
        'glShaderSourceARB', 'glUnlockArraysEXT', 'glUseProgramObjectARB',
        'glGetUniformLocation', 'glUniform1f', 'glGetObjectParameterivARB',
        'glGetShaderiv', 'glGetInfoLogARB', 'glDeleteObjectARB',
        'glFramebufferTexture2DEXT', 'glFramebufferTexture2D', 'glGenerateMipmapEXT'
      ].forEach(function (name) {
        if (typeof window[name] !== 'function') {
          window[name] = glNoop;
        }
        window.Module[name] = glNoop;
      });

      return loadScript('/client/etjs.js?v=' + window.ETJS_ASSET_VER).catch(function () {
        console.error('ETJS engine script not present yet at /client/etjs.js');
        throw new Error('ET client engine is not built');
      });
    });
  }

  function boot(externalContext) {
    if (typeof fetch !== 'function') {
      return;
    }
    canonicalContext = externalContext || null;
    if (canonicalContext && canonicalContext.shell) {
      wasmShell = canonicalContext.shell;
      frameworkEngineState = wasmShell.engineState();
    } else if (window.WasmGameFramework) {
      wasmShell = window.WasmGameFramework.configure({
        launcher: nameGate,
        card: nameForm,
        loading: loadPanel,
        runtime: frame,
        canvas: canvas,
        displayMode: 'dynamic',
        nativeManaged: true,
        syncBackbuffer: false,
        maxDpr: 1,
        pointerLock: true,
        graphics: true,
        identity: true,
        advanced: true,
        engineState: 'launcher',
        readEngineState: function () { return frameworkEngineState; },
        onNativeResizeRequest: function (detail) {
          applyNativeResolution(detail.requestedWidth, detail.requestedHeight);
        },
        preferences: {
          namespace: 'wolfet',
          playerName: nameInput,
          qualityProfile: graphicsProfile,
          targetFps: dynamicFps,
          dynamicQuality: dynamicQuality,
          defaults: {
            playerName: 'Player',
            qualityProfile: '3',
            targetFps: 60,
            dynamicQuality: true
          }
        }
      });
      wasmShell.showLauncher();
    }
    var existing = canonicalContext && canonicalContext.preferences
      ? canonicalContext.preferences.values().playerName
      : (window.ETJSName.loadPlayerName() ||
        (wasmShell && wasmShell.preferences ? wasmShell.preferences.values().playerName : ''));
    if (canonicalContext && canonicalContext.preferences) {
      var frameworkPreferences = canonicalContext.preferences.values();
      selectedQualityLevel = Number(frameworkPreferences.qualityProfile);
      selectedFpsTarget = Number(frameworkPreferences.targetFps);
      adaptiveQuality = !!frameworkPreferences.dynamicQuality;
    } else {
      try {
        var savedGraphics = JSON.parse(localStorage.getItem(GRAPHICS_STORAGE_KEY) || '{}');
        if (/^[0-3]$/.test(String(savedGraphics.level))) {
          selectedQualityLevel = Number(savedGraphics.level);
        }
        if (/^(30|60|120)$/.test(String(savedGraphics.targetFps))) {
          selectedFpsTarget = Number(savedGraphics.targetFps);
        }
        if (typeof savedGraphics.adaptive === 'boolean') {
          adaptiveQuality = savedGraphics.adaptive;
        }
      } catch (e) { /* use maximum, adaptive 60 FPS defaults */ }
    }
    if (graphicsProfile) {
      graphicsProfile.value = String(selectedQualityLevel);
    }
    if (dynamicQuality) {
      dynamicQuality.checked = adaptiveQuality;
    }
    if (dynamicFps) {
      dynamicFps.value = String(selectedFpsTarget);
      dynamicFps.disabled = !adaptiveQuality;
    }
    if (dynamicQuality && dynamicQuality.addEventListener) {
      dynamicQuality.addEventListener('change', function () {
        if (dynamicFps) {
          dynamicFps.disabled = !dynamicQuality.checked;
        }
      });
    }
    if (nameInput) {
      nameInput.value = existing;
      nameInput.focus();
    }
    function beginFromForm(ev) {
      if (ev) {
        ev.preventDefault();
      }
      var raw = nameInput ? nameInput.value : existing;
      var name;
      try {
        name = canonicalContext
          ? window.ETJSName.normalizeName(raw)
          : window.ETJSName.savePlayerName(raw);
        if (!name) {
          throw new Error('A player name is required');
        }
      } catch (err) {
        if (nameError) {
          nameError.textContent = 'Enter a player name.';
        }
        return;
      }
      selectedQualityLevel = graphicsProfile ? Number(graphicsProfile.value) : 3;
      if (!(selectedQualityLevel >= 0 && selectedQualityLevel <= 3)) {
        selectedQualityLevel = 3;
      }
      selectedFpsTarget = dynamicFps ? Number(dynamicFps.value) : 60;
      if ([30, 60, 120].indexOf(selectedFpsTarget) === -1) {
        selectedFpsTarget = 60;
      }
      adaptiveQuality = dynamicQuality ? !!dynamicQuality.checked : true;
      if (!canonicalContext) {
        try {
          localStorage.setItem(GRAPHICS_STORAGE_KEY, JSON.stringify({
            level: selectedQualityLevel,
            targetFps: selectedFpsTarget,
            adaptive: adaptiveQuality
          }));
        } catch (e) { /* storage is optional */ }
      }
      if (wasmShell && wasmShell.preferences) {
        wasmShell.preferences.save();
      }
      setFrameworkEngineState('loading');
      if (wasmShell) {
        wasmShell.showLoading();
      } else {
        if (nameGate) {
          nameGate.hidden = true;
          nameGate.classList.add('hidden');
        }
        if (loadPanel) {
          loadPanel.hidden = false;
          loadPanel.classList.remove('hidden');
        }
      }
      if (startupConsole) {
        startupConsole.textContent = '';
      }
      lastLoadStatus = '';
      appendStartupLine('Wolfenstein: Enemy Territory browser runtime');
      appendStartupLine('Player: ' + name);
      return wakeDedicatedServer().then(function () {
        return startEngine(name);
      }).catch(function (err) {
        showError(err.message || String(err));
        throw err;
      });
    }
    canonicalStart = beginFromForm;
    if (!canonicalContext && nameForm) {
      nameForm.addEventListener('submit', beginFromForm);
    } else if (!canonicalContext) {
      beginFromForm();
    }
    window.addEventListener('error', function (ev) {
      var msg = ev && ev.message ? ev.message : String(ev);
      if (/Array buffer|ASM_CONSTS|Aborted|out of memory/i.test(msg)) {
        showError(msg);
      }
    });
    window.addEventListener('unhandledrejection', function (ev) {
      var msg = ev && ev.reason ? String(ev.reason && ev.reason.message || ev.reason) : 'promise rejection';
      if (/Array buffer|ASM_CONSTS|Aborted|out of memory/i.test(msg)) {
        showError(msg);
      }
    });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') {
        void flushFrameworkPersistence();
      }
    });
    document.addEventListener('pointerdown', function () {
      if (menuMusicWanted) {
        playMenuMusic();
      }
    }, true);
  }

  window.ETJSGameAdapter = {
    init: function (context) {
      boot(context);
    },
    start: function () {
      if (!canonicalStart) {
        return Promise.reject(new Error('The Enemy Territory adapter is not initialized.'));
      }
      return canonicalStart();
    },
    readEngineState: function () {
      return frameworkEngineState;
    },
    readCaptureIntent: function () {
      return frameworkCaptureIntent;
    },
    resize: function (detail) {
      applyNativeResolution(detail.requestedWidth, detail.requestedHeight);
    },
    captureLost: function () {
      if (canonicalCaptureLost) {
        return canonicalCaptureLost('framework-capture-lost');
      }
    },
    pointerMove: function (detail) {
      if (canonicalPointerMove) {
        return canonicalPointerMove(detail);
      }
    },
    pointerButton: function (detail) {
      if (canonicalPointerButton) {
        return canonicalPointerButton(detail);
      }
    },
    inputCaptureChanged: function (captured) {
      if (canonicalInputCaptureChanged) {
        return canonicalInputCaptureChanged(captured);
      }
      frameworkInputCaptured = captured === true;
    },
    preferencesChanged: function (values) {
      if (canonicalPreferencesChanged) {
        return canonicalPreferencesChanged(values);
      }
    },
    controllerFrame: function (detail) {
      if (canonicalControllerFrame) {
        return canonicalControllerFrame(detail);
      }
    },
    controllerChanged: function (detail) {
      if (canonicalControllerChanged) {
        return canonicalControllerChanged(detail);
      }
    },
    contextLost: function () {
      if (canonicalContextLost) {
        return canonicalContextLost();
      }
    },
    contextRestored: function () {
      if (canonicalContextRestored) {
        return canonicalContextRestored();
      }
    }
  };

  if (!document.getElementById('game-canvas')) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { boot(); });
    } else {
      boot();
    }
  }
})();
