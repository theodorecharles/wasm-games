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
  let inputMode = 'menu';
  let resumeAvailable = false;
  let captured = false;
  let lastResize = null;
  let lifecycleBound = false;
  const controllerHeldKeys = new Set();
  const controllerHeldButtons = new Set();
  const forwardedPointerButtons = new Set();
  let controllerLookX = 0;
  let controllerLookY = 0;
  let audioBridge = null;
  const proofMatch = String(document.location?.search || '')
    .match(/(?:^|[?&])proof(?:=([^&]*))?(?:&|$)/);
  const proofId = proofMatch
    ? decodeURIComponent(String(proofMatch[1] || 'enabled').replace(/\+/g, ' '))
    : null;
  const proof = proofMatch ? {
    schemaVersion: 1,
    proofId,
    variant: null,
    startedAt: new Date().toISOString(),
    lifecycle: [],
    states: [],
    logs: [],
    input: {
      keyDown: 0, keyUp: 0, text: 0,
      pointerRelative: 0, pointerDx: 0, pointerDy: 0,
      pointerAbsolute: 0, pointerDown: 0, pointerUp: 0,
      captureChanges: 0, events: []
    },
    workerMessages: {},
    audio: { state: 'not-created', buffers: 0, sources: 0, starts: 0, messages: 0 },
    persistence: { ready: false, root: null, requests: 0 },
    errors: []
  } : null;
  if (proof) globalThis.__idtech4Proof = proof;
  let proofPublishTimer = null;

  function publishProof(immediate = false) {
    if (!proof) return;
    const publish = () => {
      proofPublishTimer = null;
      document.documentElement.dataset.idtech4Proof = JSON.stringify(proof);
    };
    if (immediate || typeof globalThis.setTimeout !== 'function') {
      publish();
    } else if (!proofPublishTimer) {
      proofPublishTimer = globalThis.setTimeout(publish, 250);
    }
  }
  publishProof(true);

  function proofNow() {
    const value = globalThis.performance?.now?.() ?? Date.now();
    return Math.round(Number(value) * 10) / 10;
  }

  function appendProof(collection, value, limit) {
    if (!proof) return;
    collection.push(value);
    if (collection.length > limit) collection.splice(0, collection.length - limit);
    publishProof();
  }

  function noteLifecycle(name, detail = {}) {
    if (proof) appendProof(proof.lifecycle, { at: proofNow(), name, ...detail }, 200);
  }

  function noteInput(message) {
    if (!proof || !message?.type) return;
    const event = { at: proofNow(), type: message.type };
    if (message.type === 'key') {
      if (message.down) proof.input.keyDown++; else proof.input.keyUp++;
      Object.assign(event, { scan: message.scan, key: message.key, down: Boolean(message.down), repeat: Boolean(message.repeat) });
    } else if (message.type === 'text') {
      proof.input.text++;
      event.codepoint = message.codepoint;
    } else if (message.type === 'pointer-relative') {
      proof.input.pointerRelative++;
      proof.input.pointerDx += Number(message.dx) || 0;
      proof.input.pointerDy += Number(message.dy) || 0;
      Object.assign(event, { dx: Number(message.dx) || 0, dy: Number(message.dy) || 0 });
    } else if (message.type === 'pointer-absolute') {
      proof.input.pointerAbsolute++;
      Object.assign(event, { x: message.x, y: message.y });
    } else if (message.type === 'pointer-button') {
      if (message.down) proof.input.pointerDown++; else proof.input.pointerUp++;
      Object.assign(event, { button: Number(message.button) || 0, down: Boolean(message.down) });
    } else if (message.type === 'capture') {
      proof.input.captureChanges++;
      event.captured = Boolean(message.captured);
    } else {
      return;
    }
    appendProof(proof.input.events, event, 400);
  }

  function noteOutbound(message) {
    if (!proof || !message?.type) return;
    noteInput(message);
    if (message.type === 'persist') proof.persistence.requests++;
    proof.workerMessages[`out:${message.type}`] = (proof.workerMessages[`out:${message.type}`] || 0) + 1;
    publishProof();
  }

  function noteInbound(message) {
    if (!proof || !message?.type) return;
    proof.workerMessages[`in:${message.type}`] = (proof.workerMessages[`in:${message.type}`] || 0) + 1;
    if (message.type === 'log') {
      const lines = String(message.text || '').split(/\r?\n/).filter(Boolean);
      for (const line of lines) appendProof(proof.logs, { at: proofNow(), text: line }, 4000);
    }
    if (message.type === 'persistence-ready') {
      proof.persistence.ready = true;
      proof.persistence.root = message.root || null;
    }
    if (message.type === 'engine-state' || message.type === 'ready') {
      appendProof(proof.states, {
        at: proofNow(), type: message.type, state: message.state || 'menu',
        inputMode: message.inputMode || null, resumeAvailable: message.resumeAvailable === true
      }, 500);
    }
    if (message.type === 'error') appendProof(proof.errors, { at: proofNow(), text: String(message.text || '') }, 100);
    publishProof();
  }

  function createAudioBridge() {
    const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContextClass) {
      document.documentElement.dataset.d3wasmAudioState = 'unavailable';
      if (proof) proof.audio.state = 'unavailable';
      publishProof();
      return null;
    }

    const context = new AudioContextClass({ latencyHint: 'interactive' });
    const master = context.createGain();
    const buffers = new Map();
    const sources = new Map();
    let starts = 0;
    master.connect(context.destination);

    const setAudioState = () => {
      document.documentElement.dataset.d3wasmAudioState = context.state;
      document.documentElement.dataset.d3wasmAudioBuffers = String(buffers.size);
      document.documentElement.dataset.d3wasmAudioStarts = String(starts);
      if (proof) Object.assign(proof.audio, {
        state: context.state,
        buffers: buffers.size,
        sources: sources.size,
        starts
      });
      publishProof();
    };
    context.addEventListener?.('statechange', setAudioState);
    setAudioState();

    function sourceRecord(id) {
      let source = sources.get(id);
      if (!source) {
        source = {
          buffer: 0, queue: [], scheduled: 0, nextStart: 0, nodes: new Set(),
          playing: false, looping: false, relative: false,
          gain: 1, pitch: 1, position: [0, 0, 0],
          referenceDistance: 1, maxDistance: 10000, rolloffFactor: 1
        };
        sources.set(id, source);
      }
      return source;
    }

    function decodeBuffer(record) {
      if (!record || record.audioBuffer) return record?.audioBuffer || null;
      const stereo = record.format === 0x1102 || record.format === 0x1103;
      const sixteenBit = record.format === 0x1101 || record.format === 0x1103;
      const channels = stereo ? 2 : 1;
      const bytesPerSample = sixteenBit ? 2 : 1;
      const frames = Math.floor(record.data.byteLength / (channels * bytesPerSample));
      if (!frames || !record.frequency) return null;
      const audioBuffer = context.createBuffer(channels, frames, record.frequency);
      const bytes = new Uint8Array(record.data);
      const view = new DataView(record.data);
      for (let channel = 0; channel < channels; channel++) {
        const output = audioBuffer.getChannelData(channel);
        for (let frame = 0; frame < frames; frame++) {
          const sample = frame * channels + channel;
          output[frame] = sixteenBit
            ? Math.max(-1, view.getInt16(sample * 2, true) / 32768)
            : (bytes[sample] - 128) / 128;
        }
      }
      record.audioBuffer = audioBuffer;
      return audioBuffer;
    }

    function setParam(param, value) {
      if (param && typeof param.setValueAtTime === 'function') {
        param.setValueAtTime(value, context.currentTime);
      } else if (param) {
        param.value = value;
      }
    }

    function updateNode(source, node) {
      setParam(node.gain.gain, Math.max(0, source.gain));
      setParam(node.audio.playbackRate, Math.max(0.01, source.pitch));
      if (!node.panner) return;
      node.panner.refDistance = Math.max(0.001, source.referenceDistance);
      node.panner.maxDistance = Math.max(node.panner.refDistance, source.maxDistance);
      node.panner.rolloffFactor = Math.max(0, source.rolloffFactor);
      if ('positionX' in node.panner) {
        setParam(node.panner.positionX, source.position[0]);
        setParam(node.panner.positionY, source.position[1]);
        setParam(node.panner.positionZ, source.position[2]);
      } else {
        node.panner.setPosition(...source.position);
      }
    }

    function stopSource(source) {
      for (const node of source.nodes) {
        try { node.audio.stop(); } catch (_) {}
        try { node.audio.disconnect(); } catch (_) {}
        try { node.gain.disconnect(); } catch (_) {}
        try { node.panner?.disconnect(); } catch (_) {}
      }
      source.nodes.clear();
      source.scheduled = 0;
      source.nextStart = 0;
      source.playing = false;
    }

    function scheduleBuffer(source, bufferId, when, loop) {
      const audioBuffer = decodeBuffer(buffers.get(bufferId));
      if (!audioBuffer) return when;
      const audio = context.createBufferSource();
      const gain = context.createGain();
      const panner = source.relative ? null : context.createPanner();
      const node = { audio, gain, panner };
      audio.buffer = audioBuffer;
      audio.loop = loop;
      audio.connect(gain);
      if (panner) {
        panner.panningModel = 'equalpower';
        panner.distanceModel = 'inverse';
        gain.connect(panner);
        panner.connect(master);
      } else {
        gain.connect(master);
      }
      updateNode(source, node);
      source.nodes.add(node);
      audio.addEventListener('ended', () => {
        source.nodes.delete(node);
        try { audio.disconnect(); } catch (_) {}
        try { gain.disconnect(); } catch (_) {}
        try { panner?.disconnect(); } catch (_) {}
      }, { once: true });
      audio.start(when);
      starts++;
      setAudioState();
      return loop ? when : when + audioBuffer.duration / Math.max(0.01, source.pitch);
    }

    function scheduleSource(source) {
      if (!source.playing) return;
      let when = Math.max(context.currentTime + 0.01, source.nextStart || 0);
      if (source.queue.length) {
        while (source.scheduled < source.queue.length) {
          when = scheduleBuffer(source, source.queue[source.scheduled], when, false);
          source.scheduled++;
        }
      } else if (source.buffer && !source.nodes.size) {
        when = scheduleBuffer(source, source.buffer, when, source.looping);
      }
      source.nextStart = when;
    }

    function updateListener(param, values) {
      const listener = context.listener;
      if (param === 0x1004 && values.length >= 3) {
        if ('positionX' in listener) {
          setParam(listener.positionX, values[0]);
          setParam(listener.positionY, values[1]);
          setParam(listener.positionZ, values[2]);
        } else {
          listener.setPosition(values[0], values[1], values[2]);
        }
      }
      if (param === 0x100f && values.length >= 6) {
        if ('forwardX' in listener) {
          setParam(listener.forwardX, values[0]);
          setParam(listener.forwardY, values[1]);
          setParam(listener.forwardZ, values[2]);
          setParam(listener.upX, values[3]);
          setParam(listener.upY, values[4]);
          setParam(listener.upZ, values[5]);
        } else {
          listener.setOrientation(...values.slice(0, 6));
        }
      }
    }

    return {
      resume() {
        const result = context.state === 'suspended' ? context.resume() : Promise.resolve();
        void result.then(setAudioState).catch(() => setAudioState());
      },
      handle(message) {
        if (proof) proof.audio.messages++;
        publishProof();
        switch (message.type) {
          case 'audio-init':
            this.resume();
            break;
          case 'audio-buffer':
            buffers.set(message.id, {
              format: message.format, frequency: message.frequency,
              data: message.data, audioBuffer: null
            });
            setAudioState();
            break;
          case 'audio-delete-buffer':
            buffers.delete(message.id);
            setAudioState();
            break;
          case 'audio-create-source':
            sourceRecord(message.id);
            break;
          case 'audio-delete-source': {
            const source = sources.get(message.id);
            if (source) stopSource(source);
            sources.delete(message.id);
            break;
          }
          case 'audio-source-int': {
            const source = sourceRecord(message.id);
            if (message.param === 0x1009) {
              stopSource(source);
              source.buffer = message.value;
              source.queue = [];
            } else if (message.param === 0x1007) {
              source.looping = Boolean(message.value);
            } else if (message.param === 0x202) {
              source.relative = Boolean(message.value);
            }
            break;
          }
          case 'audio-source-float': {
            const source = sourceRecord(message.id);
            if (message.param === 0x1003) source.pitch = message.value;
            if (message.param === 0x100a) source.gain = message.value;
            if (message.param === 0x1020) source.referenceDistance = message.value;
            if (message.param === 0x1023) source.maxDistance = message.value;
            if (message.param === 0x1021) source.rolloffFactor = message.value;
            for (const node of source.nodes) updateNode(source, node);
            break;
          }
          case 'audio-source-position': {
            const source = sourceRecord(message.id);
            source.position = [message.x, message.y, message.z];
            for (const node of source.nodes) updateNode(source, node);
            break;
          }
          case 'audio-source-queue': {
            const source = sourceRecord(message.id);
            source.queue.push(...message.buffers);
            scheduleSource(source);
            break;
          }
          case 'audio-source-unqueue': {
            const source = sourceRecord(message.id);
            const count = Math.min(message.count, source.queue.length);
            source.queue.splice(0, count);
            source.scheduled = Math.max(0, source.scheduled - count);
            break;
          }
          case 'audio-source-action': {
            const source = sourceRecord(message.id);
            if (message.action === 1) {
              if (!source.playing) {
                stopSource(source);
                source.playing = true;
              }
              scheduleSource(source);
            } else {
              stopSource(source);
            }
            break;
          }
          case 'audio-listener-float':
            if (message.param === 0x100a) setParam(master.gain, Math.max(0, message.value));
            break;
          case 'audio-listener-vector':
            updateListener(message.param, message.values || []);
            break;
        }
      }
    };
  }

  function resumeAudioBridge() {
    audioBridge?.resume();
  }


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
    if (!worker) return;
    noteOutbound(message);
    worker.postMessage(message);
  }

  function acceptsUncapturedPointer() {
    return inputMode === 'menu' || inputMode === 'console';
  }

  function releaseForwardedPointerButtons() {
    for (const button of forwardedPointerButtons) {
      post({ type: 'pointer-button', button, down: false });
    }
    forwardedPointerButtons.clear();
  }

  function forwardPointerButton(button, down, x, y) {
    if (down) forwardedPointerButtons.add(button); else forwardedPointerButtons.delete(button);
    post({ type: 'pointer-button', button, down, x, y });
  }

  function honorKeyboardResumeGesture(ctx, event) {
    if (!resumeAvailable) return;
    const exitsMenu = inputMode === 'menu' && event.code === 'Escape';
    const exitsConsole = inputMode === 'console' && (event.code === 'Escape' || event.code === 'Backquote');
    if (!exitsMenu && !exitsConsole) return;
    state = 'gameplay';
    inputMode = 'gameplay';
    resumeAvailable = false;
    ctx.setEngineState('gameplay', { capture: true, event });
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
      resumeAudioBridge();
      if (!started || event.ctrlKey || event.metaKey || event.altKey) return;
      const scan = keyScan(event.code);
      if (!scan) return;
      post({ type: 'key', scan, key: event.key.length === 1 ? event.key.charCodeAt(0) : 0, down: true, repeat: event.repeat });
      if (!event.repeat) honorKeyboardResumeGesture(ctx, event);
      // The physical scan code toggles the console.  Sending the printable
      // backquote as text as well inserts a stray character into commands.
      if (event.code !== 'Backquote' && event.key.length === 1 && !event.repeat) {
        post({ type: 'text', codepoint: event.key.charCodeAt(0) });
      }
      if (['Escape', 'Enter', 'Tab', 'Backspace', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(event.key)) event.preventDefault();
    }, true);
    document.addEventListener('keyup', event => {
      if (!started) return;
      const scan = keyScan(event.code);
      if (scan) post({ type: 'key', scan, key: event.key.length === 1 ? event.key.charCodeAt(0) : 0, down: false });
    }, true);
    ctx.elements.canvas.addEventListener('pointermove', event => {
      if (captured && document.pointerLockElement === ctx.elements.canvas) {
        post({ type: 'pointer-relative', dx: event.movementX, dy: event.movementY });
      }
    });
    const forwardCapturedPointerButton = event => {
      resumeAudioBridge();
      if (!started || !captured || document.pointerLockElement !== ctx.elements.canvas) return;
      const button = Number(event.button) || 0;
      forwardPointerButton(button, event.type === 'pointerdown');
      event.preventDefault();
    };
    document.addEventListener('pointerdown', forwardCapturedPointerButton, true);
    document.addEventListener('pointerup', forwardCapturedPointerButton, true);
  }

  globalThis.WasmGameAdapter = Object.freeze({
    async init(ctx) {
      const descriptor = engines[ctx.variant];
      if (!descriptor) throw new Error(`Unsupported id Tech 4 variant: ${ctx.variant}`);
      if (proof) proof.variant = ctx.variant;
      publishProof();
      noteLifecycle('init', { variant: ctx.variant });
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
      noteLifecycle('initialized', { files: policy.files.length });
    },

    async start(ctx) {
      if (started) return;
      const descriptor = engines[ctx.variant];
      noteLifecycle('start-requested');
      if (descriptor.worker === '/d3-worker.js') audioBridge ||= createAudioBridge();
      resumeAudioBridge();
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
      noteLifecycle('data-ready', {
        source: document.documentElement.dataset.wasmDataSource,
        entries: data.entries.length
      });
      ctx.setLoading(`Starting ${descriptor.label}…`, '', 90);
      const canvas = ctx.elements.canvas;
      const offscreen = canvas.transferControlToOffscreen();
      const preferences = ctx.preferences.values();
      const width = Math.max(640, Number(lastResize?.requestedWidth || canvas.width || 1280));
      const height = Math.max(480, Number(lastResize?.requestedHeight || canvas.height || 720));
      worker = new Worker(descriptor.worker);
      worker.onmessage = event => {
        const message = event.data || {};
        noteInbound(message);
        if (message.type?.startsWith('audio-')) {
          audioBridge?.handle(message);
          return;
        }
        if (message.type === 'log') ctx.log(message.text);
        if (message.type === 'status') ctx.setLoading(`Preparing ${descriptor.label}…`);
        if (message.type === 'persistence-ready') ctx.log(`Save/config persistence restored at ${message.root}.`);
        if (message.type === 'engine-state' || message.type === 'ready') {
          if (state !== message.state) releaseController();
          state = message.state || 'menu';
          inputMode = message.inputMode || (state === 'gameplay' ? 'gameplay' : 'menu');
          resumeAvailable = message.resumeAvailable === true;
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
        if (proof) appendProof(proof.errors, { at: proofNow(), text: String(event.message || 'Worker error') }, 100);
        ctx.setEngineState('crashed');
        ctx.setStatus(`${descriptor.label} worker failed: ${event.message}`, true);
      };
      started = true;
      if (proof) {
        proof.workerMessages['out:start'] = (proof.workerMessages['out:start'] || 0) + 1;
        publishProof();
      }
      noteLifecycle('worker-started', { worker: descriptor.worker, width, height });
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
      if (started && !captured && acceptsUncapturedPointer()) {
        post({ type: 'pointer-absolute', x: detail.x, y: detail.y });
      }
    },
    pointerButton(detail) {
      if (!started) return;
      resumeAudioBridge();
      const button = Number(detail.button) || 0;
      const down = Boolean(detail.pressed);
      const wasForwarded = forwardedPointerButtons.has(button);
      if (!captured && !acceptsUncapturedPointer() && !(wasForwarded && !down)) return;
      forwardPointerButton(button, down, detail.x, detail.y);
    },
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
      const next = Boolean(nextCaptured);
      if (captured && !next) releaseForwardedPointerButtons();
      captured = next;
      if (started) post({ type: 'capture', captured });
    },
    captureLost() { if (started) post({ type: 'open-menu' }); },
    preferencesChanged(values) {
      if (started) post({ type: 'preferences', playerName: values.playerName, engineArguments: profileArguments[values.qualityProfile] || profileArguments.high });
    }
  });
})();
