(function () {
  'use strict';

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
    ControlLeft: 224, ShiftLeft: 225, AltLeft: 226, MetaLeft: 227,
    ControlRight: 228, ShiftRight: 229, AltRight: 230, MetaRight: 231
  });
  const runtime = {
    context: null,
    worker: null,
    state: 'launcher',
    stateBeforeContextLoss: 'launcher',
    drawCount: 0,
    framebufferVariation: 0,
    cursorX: 0,
    cursorY: 0,
    contextWidth: 0,
    contextHeight: 0,
    windowScale: 1,
    browserKeys: new Set(),
    started: false,
    nativeStarted: false,
    pendingResize: null,
    canvasWidth: 0,
    canvasHeight: 0,
    configBytes: 0,
    indexBytes: 0,
    hotCacheFiles: 0,
    hotCacheBytes: 0,
    pointerEvents: 0,
    keyEvents: 0,
    audioBridge: null,
    audioSink: null,
    audio: {
      state: 'unavailable', sampleRate: 0, buffers: 0, dropped: 0, frames: 0,
      queuedSeconds: 0, underruns: 0, underrunSeconds: 0,
      highWaterQueuedSeconds: 0, sequenceGaps: 0
    }
  };

  function decodeCaseBasename(name) {
    const normalized = String(name || '').replaceAll('\\', '/');
    const match = normalized.match(/^(?:(?:RCT1\/)?(?:Data|ObjData|Scenarios|Tracks))\/__case__\/([0-9a-f]+)$/);
    if (!match) return normalized.split('/').pop();
    if (match[1].length % 2 !== 0) throw new Error(`Invalid case-preservation path: ${name}`);
    const bytes = Uint8Array.from(match[1].match(/../g) || [], pair => Number.parseInt(pair, 16));
    const basename = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (!basename || basename === '.' || basename === '..' || basename.includes('/') || basename.includes('\\')) {
      throw new Error(`Invalid case-preservation filename: ${name}`);
    }
    return basename;
  }

  function groupedMediaFiles(entries) {
    const groups = new Map([['Data', []], ['ObjData', []], ['Scenarios', []], ['Tracks', []]]);
    for (const entry of entries) {
      const name = String(entry.mountName || entry.file?.name || '').replaceAll('\\', '/');
      const parts = name.split('/');
      const directory = parts[0] === 'RCT1' ? `RCT1/${parts[1]}` : parts[0];
      if (!['Data', 'ObjData', 'Scenarios', 'Tracks', 'RCT1/Data', 'RCT1/Scenarios', 'RCT1/Tracks'].includes(directory)) {
        throw new Error(`Unexpected installation path: ${name}`);
      }
      if (!groups.has(directory)) groups.set(directory, []);
      const basename = decodeCaseBasename(name);
      const source = entry.file;
      if (!(source instanceof Blob)) throw new Error(`${name} is not backed by a browser Blob.`);
      groups.get(directory).push(new File([source], basename, {
        type: source.type,
        lastModified: source.lastModified || 0
      }));
    }
    for (const [directory, values] of groups) {
      if (!values.length) throw new Error(`The ${directory} directory is empty.`);
    }
    return Array.from(groups, ([directory, files]) => ({ directory, files }));
  }

  function nativeState() {
    return runtime.state;
  }

  function keyScan(code) {
    if (scancodes[code]) return scancodes[code];
    if (/^Key[A-Z]$/.test(code)) return code.charCodeAt(3) - 61;
    if (/^Digit[1-9]$/.test(code)) return 30 + Number(code.slice(5)) - 1;
    if (code === 'Digit0') return 39;
    return 0;
  }

  function keyModifiers(event) {
    return (event.shiftKey ? 0x0003 : 0) |
      (event.ctrlKey ? 0x00c0 : 0) |
      (event.altKey ? 0x0300 : 0) |
      (event.metaKey ? 0x0c00 : 0);
  }

  function publishTelemetry(detail) {
    if (detail) {
      runtime.state = String(detail.state || runtime.state);
      runtime.drawCount = Math.max(0, Number(detail.drawCount) || 0);
      runtime.framebufferVariation = Math.max(0, Number(detail.framebufferVariation) || 0);
      runtime.cursorX = Number(detail.cursorX) || 0;
      runtime.cursorY = Number(detail.cursorY) || 0;
      runtime.contextWidth = Math.max(0, Number(detail.contextWidth) || 0);
      runtime.contextHeight = Math.max(0, Number(detail.contextHeight) || 0);
      runtime.windowScale = Math.max(0.01, Number(detail.windowScale) || 1);
      runtime.canvasWidth = Math.max(0, Number(detail.canvasWidth) || 0);
      runtime.canvasHeight = Math.max(0, Number(detail.canvasHeight) || 0);
      runtime.configBytes = Math.max(0, Number(detail.configBytes) || 0);
      runtime.indexBytes = Math.max(0, Number(detail.indexBytes) || 0);
      runtime.hotCacheFiles = Math.max(0, Number(detail.hotCacheFiles) || 0);
      runtime.hotCacheBytes = Math.max(0, Number(detail.hotCacheBytes) || 0);
      runtime.pointerEvents = Math.max(0, Number(detail.pointerEvents) || 0);
      runtime.keyEvents = Math.max(0, Number(detail.keyEvents) || 0);
    }
    runtime.context?.setEngineState(runtime.state);
    const html = document.documentElement;
    html.dataset.openrct2State = runtime.state;
    html.dataset.openrct2DrawCount = String(runtime.drawCount);
    html.dataset.openrct2FramebufferVariation = String(runtime.framebufferVariation);
    html.dataset.openrct2CursorX = String(runtime.cursorX);
    html.dataset.openrct2CursorY = String(runtime.cursorY);
    html.dataset.openrct2ContextWidth = String(runtime.contextWidth);
    html.dataset.openrct2ContextHeight = String(runtime.contextHeight);
    html.dataset.openrct2WindowScale = String(runtime.windowScale);
    html.dataset.openrct2CanvasWidth = String(runtime.canvasWidth);
    html.dataset.openrct2CanvasHeight = String(runtime.canvasHeight);
    html.dataset.openrct2ConfigBytes = String(runtime.configBytes);
    html.dataset.openrct2IndexBytes = String(runtime.indexBytes);
    html.dataset.openrct2HotCacheFiles = String(runtime.hotCacheFiles);
    html.dataset.openrct2HotCacheBytes = String(runtime.hotCacheBytes);
    html.dataset.openrct2PointerEvents = String(runtime.pointerEvents);
    html.dataset.openrct2KeyEvents = String(runtime.keyEvents);
    html.dataset.openrct2AudioState = runtime.audio.state;
    html.dataset.openrct2AudioSampleRate = String(runtime.audio.sampleRate);
    html.dataset.openrct2AudioBuffers = String(runtime.audio.buffers);
    html.dataset.openrct2AudioDropped = String(runtime.audio.dropped);
    html.dataset.openrct2AudioFrames = String(runtime.audio.frames);
    html.dataset.openrct2AudioQueuedSeconds = String(runtime.audio.queuedSeconds || 0);
    html.dataset.openrct2AudioUnderruns = String(runtime.audio.underruns || 0);
    html.dataset.openrct2AudioUnderrunSeconds = String(runtime.audio.underrunSeconds || 0);
    html.dataset.openrct2AudioHighWaterSeconds = String(runtime.audio.highWaterQueuedSeconds || 0);
    html.dataset.openrct2AudioSequenceGaps = String(runtime.audio.sequenceGaps || 0);
  }

  function post(type, detail) {
    runtime.worker?.postMessage({ type, ...(detail || {}) });
  }

  function releaseKeyboard() {
    if (runtime.nativeStarted) {
      for (const scancode of runtime.browserKeys) post('key', { scancode, pressed: 0, modifiers: 0 });
    }
    runtime.browserKeys.clear();
  }

  function keyboardInput(event, pressed) {
    if (!runtime.nativeStarted || event.isComposing) return;
    const scancode = keyScan(event.code);
    if (!scancode) return;
    if (pressed) runtime.browserKeys.add(scancode); else runtime.browserKeys.delete(scancode);
    post('key', { scancode, pressed: pressed ? 1 : 0, modifiers: keyModifiers(event), repeat: Boolean(event.repeat) });
    if (pressed && !event.repeat && !event.ctrlKey && !event.metaKey && !event.altKey && event.key.length === 1) {
      post('text-input', { text: event.key });
    }
    if (['Escape', 'Enter', 'Tab', 'Backspace', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(event.key)) {
      event.preventDefault();
    }
  }

  function controlledShutdown() {
    if (!runtime.worker) return;
    releaseKeyboard();
    post('persist');
    void runtime.audioSink?.close();
  }

  function waitForFirstDraw(context, groups, canvas, native) {
    return new Promise((resolve, reject) => {
      const worker = runtime.worker = new Worker('/openrct2-worker.js', { name: 'openrct2-runtime' });
      const timeout = setTimeout(() => reject(new Error('OpenRCT2 did not draw its first frame within ten minutes.')), 600000);
      let settled = false;
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        callback(value);
      };
      worker.addEventListener('message', event => {
        const message = event.data || {};
        if (message.type === 'status') {
          context.setLoading(message.title || 'Starting OpenRCT2…', message.detail || '', message.progress);
          return;
        }
        if (message.type === 'log') {
          context.log(message.text || '');
          return;
        }
        if (message.type === 'persistence') {
          document.documentElement.dataset.openrct2Persistence = JSON.stringify(message.status || {});
          return;
        }
        if (message.type === 'audio') {
          runtime.audioSink?.enqueue(message);
          return;
        }
        if (message.type === 'audio-error') {
          context.log(`Audio bridge warning: ${message.text || 'unknown worker audio error'}`);
          return;
        }
        if (message.type === 'state') {
          publishTelemetry(message);
          if (message.drawCount > 0) finish(resolve);
          return;
        }
        if (message.type === 'error') {
          runtime.state = 'crashed';
          publishTelemetry();
          finish(reject, new Error(message.text || 'OpenRCT2 worker failed.'));
        }
      });
      worker.addEventListener('error', event => {
        runtime.state = 'crashed';
        publishTelemetry();
        finish(reject, new Error(event.message || 'OpenRCT2 worker crashed.'));
      });
      worker.postMessage({
        type: 'start',
        canvas,
        width: Math.max(2, canvas.width),
        height: Math.max(2, canvas.height),
        groups,
        native,
        framework: context.config.framework,
        persistence: {
          namespace: context.persistence.namespace,
          root: context.persistence.root,
          debounceMs: context.config.persistence?.debounceMs,
          intervalMs: context.config.persistence?.intervalMs,
          requestDurability: context.config.persistence?.requestDurability
        },
        audioSampleRate: runtime.audioSink?.context?.sampleRate || 48000
      }, [canvas]);
    });
  }

  globalThis.WasmGameAdapter = Object.freeze({
    async init(context) {
      runtime.context = context;
      runtime.audioBridge = await import('/openrct2-audio-bridge.mjs');
      context.elements.canvas.addEventListener('contextmenu', event => event.preventDefault());
      context.elements.canvas.addEventListener('wheel', event => {
        if (!runtime.nativeStarted) return;
        event.preventDefault();
        post('pointer-wheel', { deltaX: Math.sign(event.deltaX), deltaY: Math.sign(event.deltaY) });
      }, { passive: false });
      document.addEventListener('keydown', event => keyboardInput(event, true), true);
      document.addEventListener('keyup', event => keyboardInput(event, false), true);
      globalThis.addEventListener('blur', releaseKeyboard);
      globalThis.addEventListener('pagehide', controlledShutdown);
      document.addEventListener('visibilitychange', () => {
        if (!runtime.audioSink) return;
        if (document.hidden) void runtime.audioSink.suspend();
        else if (runtime.started) void runtime.audioSink.resume();
      });
    },

    async start(context) {
      if (runtime.started) {
        context.showRuntime(nativeState());
        context.shell.resize?.();
        return;
      }
      runtime.started = true;
      runtime.state = 'loading';
      const AudioContextCtor = globalThis.AudioContext || globalThis.webkitAudioContext;
      runtime.audioSink = runtime.audioBridge.createMainAudioSink({
        AudioContextCtor,
        onState(state) {
          runtime.audio = state;
          publishTelemetry();
        }
      });
      void runtime.audioSink?.resume();
      publishTelemetry();
      context.setLoading('Preparing OpenRCT2…', 'Restoring the selected installation.', 5);
      try {
        await context.shell.resumeAudio();
        const media = await context.dataClient.media.load(undefined, {
          onProgress(detail) {
            const total = Math.max(1, Number(detail.total) || 1);
            const index = Math.max(0, Number(detail.index) || 0);
            context.setLoading('Restoring installation…', detail.name || '', 8 + Math.round((index / total) * 42));
          }
        });
        const groups = groupedMediaFiles(media.entries);
        const canvas = context.elements.canvas.transferControlToOffscreen();
        context.setLoading('Starting OpenRCT2…', 'Mounting the installation in the native worker.', 55);
        await waitForFirstDraw(context, groups, canvas, context.config.runtime);
        runtime.nativeStarted = true;
        if (runtime.pendingResize) post('resize', runtime.pendingResize);
        context.log(`[openrct2-wasm] ${media.entries.length} files mounted through worker-backed WORKERFS`);
        context.showRuntime(nativeState());
        context.shell.resize?.();
        context.setLoading('Running', '', 100);
      } catch (error) {
        runtime.state = 'crashed';
        publishTelemetry();
        throw error;
      }
    },

    resize(detail) {
      const width = Math.max(2, Math.floor(detail.requestedWidth));
      const height = Math.max(2, Math.floor(detail.requestedHeight));
      runtime.pendingResize = { width, height };
      if (runtime.nativeStarted) post('resize', runtime.pendingResize);
      publishTelemetry();
    },

    readEngineState() { return nativeState(); },
    readCaptureIntent() { return false; },
    pointerMove(detail) {
      if (runtime.nativeStarted && detail?.captured === false) post('pointer-move', { x: detail.x, y: detail.y });
    },
    pointerButton(detail) {
      if (runtime.nativeStarted) post('pointer-button', {
        button: detail.button,
        pressed: detail.pressed ? 1 : 0,
        x: detail.x,
        y: detail.y
      });
    },
    captureLost() { releaseKeyboard(); },
    inputCaptureChanged() {},
    preferencesChanged() {},
    persistenceChanged() {},
    contextLost() {
      runtime.stateBeforeContextLoss = runtime.state;
      releaseKeyboard();
      runtime.state = 'paused';
      void runtime.audioSink?.suspend();
      publishTelemetry();
    },
    contextRestored() {
      runtime.state = runtime.stateBeforeContextLoss;
      publishTelemetry();
      void runtime.audioSink?.resume();
      runtime.context?.shell.resize?.();
    }
  });
})();
