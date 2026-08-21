import { Net, Xash3D } from 'xash3d-fwgs';

import filesystemUrl from 'xash3d-fwgs/filesystem_stdio.wasm';
import xashUrl from '../native/xash-framework.wasm';
import menuUrl from '../native/menu-framework.wasm';
import webgl2Url from 'xash3d-fwgs/libref_webgl2.wasm';
import softUrl from 'xash3d-fwgs/libref_soft.wasm';
import extrasUrl from 'xash3d-fwgs/extras.pk3';
import hlClientUrl from 'hlsdk-portable/cl_dlls/client_emscripten_wasm32.wasm';
import hlServerUrl from 'hlsdk-portable/dlls/hl_emscripten_wasm32.wasm';
import opforClientUrl from '../native/opfor-client-framework.wasm';
import opforServerUrl from '../native/opfor-server-framework.wasm';
import csMenuUrl from '../native/cs-menu-framework.wasm';
import csClientUrl from 'cs16-client/cl_dll/client_emscripten_wasm32.wasm';
import csServerUrl from 'cs16-client/dlls/cs_emscripten_wasm32.wasm';

const ROOT = '/rodir';
const VARIANTS = Object.freeze({
  'half-life': Object.freeze({ game: 'valve', multiplayer: 'optional' }),
  'blue-shift': Object.freeze({ game: 'bshift', multiplayer: false }),
  'opposing-force': Object.freeze({ game: 'gearbox', multiplayer: 'optional' }),
  'counter-strike': Object.freeze({ game: 'cstrike', multiplayer: true })
});

let xash = null;
let engineState = 'launcher';
let persistentMount = null;
let lastEscapeAt = 0;
let manifest = null;
let started = false;
let nativeReady = false;
let activeContext = null;
let telemetryTimer = 0;
let lastIdentityRetryAt = 0;
let shellView = 'launcher';
let loadingKind = null;
let loadProgress = 0;
let lastEngineLine = '';
let networkedHint = false;
let contextIsLost = false;
let pendingViewport = null;
let nativeViewport = '';
let pendingCaptureEvent = null;
let pendingCaptureUntil = 0;
let captureRecoveryEvent = null;
let captureRecoveryUntil = 0;
const controllerHeld = new Map();
let controllerMenu = null;
let controllerLookX = 0;
let controllerLookY = 0;

const CONTROLLER_ACTION = Object.freeze({
  forward: 0, backward: 1, left: 2, right: 3,
  attack: 4, altAttack: 5, jump: 6, crouch: 7, reload: 8, use: 9,
  previousWeapon: 10, nextWeapon: 11, scoreboard: 12, menu: 13,
  sprint: 14, melee: 15, enter: 16, up: 17, down: 18, menuLeft: 19, menuRight: 20
});

const NATIVE_STATES = Object.freeze(['menu', 'gameplay', 'paused', 'debrief', 'loading']);

function websocketEndpoint() {
  const override = new URLSearchParams(location.search).get('server');
  if (!override) {
    const url = new URL('/websocket', location.href);
    url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return url;
  }

  let url;
  try {
    url = override.includes('://')
      ? new URL(override)
      : new URL(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${override}`);
  } catch (_) {
    throw new Error('The ?server= override must be a WebSocket host[:port] or ws(s) URL.');
  }
  if (!['ws:', 'wss:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('The ?server= override must identify a plain ws(s) WebSocket endpoint.');
  }
  if (url.pathname === '/' || !url.pathname) url.pathname = '/websocket';
  if (url.pathname !== '/websocket') {
    throw new Error('The GoldSource WebRTC bridge must be exposed at /websocket.');
  }
  return url;
}

// Local development WebRTC bridge (artifacts/runtime/cs-bridge-server.mjs).
// Same-origin signaling is tried first; static-only hosts (the game-lab
// container) have no /websocket endpoint, so networked play falls back here.
const BRIDGE_FALLBACK = '127.0.0.1:4190';

class WebRtcXash extends Xash3D {
  constructor(options, endpoint) {
    super(options);
    this.endpoint = endpoint;
    this.net = new Net(this);
    // TEMP: trace which net syscalls the engine invokes during connect.
    for (const m of ['socket', 'bind', 'connect', 'sendto', 'sendtoBatch', 'getaddrinfo', 'gethostbyname']) {
      const orig = this.net[m];
      this.net[m] = (...a) => {
        (this.diagNet = this.diagNet || {})[m] = (this.diagNet[m] || 0) + 1;
        return typeof orig === 'function' ? orig.apply(this.net, a) : 0;
      };
    }
    this.channel = null;
    this.peer = null;
    this.socket = null;
    this.pendingCandidates = [];
    this.signalingVersion = null;
  }

  async init() {
    await Promise.all([super.init(), this.connectWithFallback()]);
  }

  async connectWithFallback() {
    try {
      await this.connect();
    } catch (error) {
      const fallback = new URL(`ws://${BRIDGE_FALLBACK}/websocket`);
      if (this.endpoint.host === fallback.host) throw error;
      this.endpoint = fallback;
      await this.connect();
    }
  }

  createPeer(resolve, reject) {
    if (this.peer) return;
    const peer = new RTCPeerConnection();
    this.peer = peer;
    peer.onicecandidate = event => {
      if (event.candidate && this.socket?.readyState === WebSocket.OPEN) {
        this.sendSignal('candidate', event.candidate.toJSON());
      }
    };
    peer.onconnectionstatechange = () => {
      if (['failed', 'closed'].includes(peer.connectionState)) {
        reject(new Error(`The multiplayer WebRTC connection ${peer.connectionState}.`));
      }
    };
    let openChannels = 0;
    peer.ondatachannel = event => {
      const channel = event.channel;
      channel.binaryType = 'arraybuffer';
      if (channel.label === 'write') {
        channel.onmessage = message => {
          const deliver = value => {
            this.diagRecv = (this.diagRecv || 0) + 1;
            this.net.incoming.enqueue({
              ip: [127, 0, 0, 1], port: 8080,
              data: value instanceof Uint8Array ? value : new Uint8Array(value)
            });
          };
          if (message.data instanceof Blob) message.data.arrayBuffer().then(deliver, reject);
          else deliver(message.data);
        };
      }
      channel.onopen = () => {
        openChannels += 1;
        if (channel.label === 'read') this.channel = channel;
        if (openChannels >= 2 && this.channel) resolve();
      };
    };
  }

  async handleSignal(message, resolve, reject) {
    const decoded = this.decodeSignal(message.data);
    this.signalingVersion = decoded.version;
    this.createPeer(resolve, reject);
    if (decoded.event === 'offer') {
      const data = decoded.data;
      await this.peer.setRemoteDescription(data);
      for (const candidate of this.pendingCandidates.splice(0)) await this.peer.addIceCandidate(candidate);
      const answer = await this.peer.createAnswer();
      await this.peer.setLocalDescription(answer);
      this.sendSignal('answer', answer);
    } else if (decoded.event === 'candidate') {
      if (this.peer.remoteDescription) await this.peer.addIceCandidate(decoded.data);
      else this.pendingCandidates.push(decoded.data);
    }
  }

  decodeSignal(raw) {
    const signal = JSON.parse(raw);
    if (Array.isArray(signal)) {
      const wireEvent = String(signal[0] || '');
      const separator = wireEvent.indexOf(':');
      if (separator <= 0 || !wireEvent.slice(0, separator).match(/^v\d+$/)) {
        throw new Error(`Unsupported multiplayer signaling event: ${wireEvent || '(empty)'}`);
      }
      return {
        version: wireEvent.slice(0, separator),
        event: wireEvent.slice(separator + 1),
        data: signal[1]
      };
    }
    const data = typeof signal.data === 'string' ? JSON.parse(signal.data) : signal.data;
    return { version: null, event: String(signal.event || ''), data };
  }

  sendSignal(event, data) {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    const message = this.signalingVersion
      ? [`${this.signalingVersion}:${event}`, data]
      : { event, data };
    this.socket.send(JSON.stringify(message));
  }

  connect() {
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = callback => value => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        callback(value);
      };
      const done = finish(resolve);
      const fail = finish(reject);
      const timer = setTimeout(() => fail(new Error(
        `Timed out connecting to the GoldSource WebRTC bridge at ${this.endpoint.href}`
      )), 20000);
      const socket = new WebSocket(this.endpoint);
      this.socket = socket;
      socket.onerror = () => fail(new Error(
        `Could not reach the GoldSource WebRTC bridge at ${this.endpoint.href}`
      ));
      socket.onclose = event => {
        if (!settled) fail(new Error(`The GoldSource signaling socket closed (${event.code}).`));
      };
      socket.onmessage = event => this.handleSignal(event, done, fail).catch(fail);
    });
  }

  sendto(packet) {
    this.diagSent = (this.diagSent || 0) + 1;
    this.diagLastLen = packet.data?.length;
    if (this.channel?.readyState === 'open') this.channel.send(packet.data.slice());
  }
}

function configurationFor(variant) {
  const selected = VARIANTS[variant];
  if (!selected) throw new Error(`Unsupported GoldSource variant: ${variant}`);
  return selected;
}

function ownerPolicy(context) {
  const root = manifest;
  const selected = root?.variants?.[context.variant];
  if (!selected?.files?.length) throw new Error(`No game-data policy exists for ${context.variant}.`);
  return {
    namespace: selected.namespace || root.namespace,
    version: selected.version || root.version,
    files: selected.files.filter(file => file.mount !== false).map(file => ({ ...file, validateCached: false }))
  };
}

async function loadManifest() {
  if (!manifest) {
    const response = await fetch('/wasm-game-data.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Game-data manifest failed with HTTP ${response.status}.`);
    manifest = Object.freeze(await response.json());
  }
  return manifest;
}

async function writeBlob(FS, path, blob) {
  const slash = path.lastIndexOf('/');
  if (slash > 0) FS.mkdirTree(path.slice(0, slash));
  const stream = FS.open(path, 'w');
  try {
    for (let offset = 0; offset < blob.size; offset += 4 * 1024 * 1024) {
      const bytes = new Uint8Array(await blob.slice(offset, offset + 4 * 1024 * 1024).arrayBuffer());
      FS.write(stream, bytes, 0, bytes.length, offset);
    }
  } finally {
    FS.close(stream);
  }
}

async function waitForNativeMain(instance, timeoutMs = 30000) {
  const startedAt = performance.now();
  while (!instance?.em?.Module?.calledRun) {
    if (performance.now() - startedAt >= timeoutMs) {
      throw new Error('Xash native startup timed out before main completed.');
    }
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

function trackPersistentWrites(FS, mount) {
  if (!mount || typeof FS.write !== 'function') return;
  const originalWrite = FS.write.bind(FS);
  FS.write = (stream, ...args) => {
    const written = originalWrite(stream, ...args);
    const path = String(stream?.path || (stream?.node && typeof FS.getPath === 'function' ? FS.getPath(stream.node) : '') || '');
    if (path === mount.root || path.startsWith(`${mount.root}/`) ||
        path === '/rwdir' || path.startsWith('/rwdir/')) mount.markDirty();
    return written;
  };
}

function bindWritableRoot(FS, root) {
  try { FS.rmdir('/rwdir'); } catch (_) {}
  FS.symlink(root, '/rwdir');
}

function synchronizeNativeViewport(detail) {
  const requestedWidth = Number(detail?.bufferWidth);
  const requestedHeight = Number(detail?.bufferHeight);
  if (!Number.isFinite(requestedWidth) || !Number.isFinite(requestedHeight) ||
      requestedWidth <= 0 || requestedHeight <= 0) return;
  const width = Math.max(320, Math.round(requestedWidth));
  const height = Math.max(240, Math.round(requestedHeight));
  pendingViewport = { bufferWidth: width, bufferHeight: height };
  if (!nativeReady || !xash?.running) return;
  const viewport = `${width}x${height}`;
  if (viewport === nativeViewport) return;
  nativeViewport = viewport;
  globalThis.__goldsourceNativeViewport = viewport;
  nativeCall('WasmGame_Resize', null, ['number', 'number'], [width, height]);
}

function engineOptions(context, selected, networked) {
  const isCs = context.variant === 'counter-strike';
  const preferences = context.preferences.values();
  const playerName = safePlayerName(preferences.playerName);
  const fps = Math.max(30, Math.min(120, Number(preferences.targetFps) || 120));
  const width = Math.max(320, Math.round(Number(context.elements.canvas.width) || 1280));
  const height = Math.max(240, Math.round(Number(context.elements.canvas.height) || 720));
  const argumentsList = [
    '-windowed', '-width', String(width), '-height', String(height),
    '-rodir', ROOT,
    '-console', '+hud_scale', '1', '+volume', '0.15',
    // Voice capture opens an Emscripten audio capture device, which surfaces
    // as a browser microphone permission prompt; voice is not wired up here.
    '+voice_enable', '0',
    '+name', playerName, '+fps_max', String(fps)
  ];
  if (!isCs) argumentsList.push('+sv_cheats', '1');
  if (selected.game !== 'valve') argumentsList.push('-game', selected.game);
  if (isCs) argumentsList.push('+_vgui_menus', '0');
  const filesMap = {
    '/rwdir/filesystem_stdio.wasm': filesystemUrl,
    [`${context.persistence.root}/filesystem_stdio.wasm`]: filesystemUrl,
    'dlls/bshift_emscripten_wasm32.wasm': hlServerUrl,
    'dlls/opfor_emscripten_wasm32.wasm': opforServerUrl,
    'dlls/cs_emscripten_wasm32.wasm': csServerUrl,
    'dlls/mp_emscripten_wasm32.wasm': csServerUrl
  };
  return {
    canvas: context.elements.canvas,
    renderer: 'gles3compat',
    arguments: argumentsList,
    filesMap,
    dynamicLibraries: isCs
      ? ['dlls/cs_emscripten_wasm32.wasm', 'dlls/mp_emscripten_wasm32.wasm']
      : selected.game === 'bshift'
        ? ['dlls/bshift_emscripten_wasm32.wasm']
        : selected.game === 'gearbox'
          ? ['dlls/opfor_emscripten_wasm32.wasm']
          : [],
    libraries: {
      filesystem: filesystemUrl,
      xash: xashUrl,
      menu: isCs ? csMenuUrl : menuUrl,
      client: isCs ? csClientUrl : selected.game === 'gearbox' ? opforClientUrl : hlClientUrl,
      // Xash always preloads the generic server slot. Keep that slot on the
      // base module and preload Opposing Force once under the Gearbox DLL name
      // that its liblist requests at runtime.
      server: isCs ? csServerUrl : hlServerUrl,
      render: { gles3compat: webgl2Url, gl4es: webgl2Url, soft: softUrl }
    },
    module: {
      print: line => {
        context.log(line);
        noteEngineLine(context, line);
        if (/host_error|sys_error|fatal error/i.test(line)) {
          publishState(context, 'crashed');
        }
      },
      printErr: line => context.log(line)
    },
    networked
  };
}

function safePlayerName(value) {
  return String(value || 'Player').replace(/[\\";\r\n]/g, '').trim().slice(0, 32) || 'Player';
}

function applyPreferences(values) {
  if (!nativeReady || !xash?.running) return;
  const name = safePlayerName(values.playerName);
  const fps = Math.max(30, Math.min(120, Number(values.targetFps) || 120));
  for (const command of [
    'bind w +forward', 'bind s +back', 'bind a +moveleft', 'bind d +moveright',
    'bind SPACE +jump', 'bind CTRL +duck', 'bind SHIFT +speed', 'bind e +use',
    'bind r +reload', 'bind q lastinv', 'bind g drop', 'bind f "impulse 100"',
    'bind b buy', 'bind m chooseteam', 'bind TAB +showscores',
    'bind 1 slot1', 'bind 2 slot2', 'bind 3 slot3', 'bind 4 slot4', 'bind 5 slot5',
    'bind 6 slot6', 'bind 7 slot7', 'bind 8 slot8', 'bind 9 slot9', 'bind 0 slot10',
    'bind MWHEELUP invprev', 'bind MWHEELDOWN invnext',
    'bind MOUSE1 +attack', 'bind MOUSE2 +attack2',
    '+mlook', 'lookstrafe 0', 'lookspring 0', 'm_filter 0'
  ]) xash.Cmd_ExecuteString(command);
  if (activeContext?.variant !== 'counter-strike') xash.Cmd_ExecuteString('sv_cheats 1');
  xash.Cmd_ExecuteString(`name "${name}"`);
  xash.Cmd_ExecuteString(`fps_max ${fps}`);
}

// The engine loads levels synchronously and never presents its own loading
// plaque to the WebGL canvas, so without intervention the user stares at a
// black canvas for the entire load. The shell's loading overlay is swapped in
// whenever the native state machine reports booting/loading, with the live
// engine console line as the detail text and a stage-anchored progress bar.
const LOAD_STAGES = [
  [/game started|spawn server/i, 10],
  [/spooling demo|execing (sp|listen)server/i, 18],
  [/setting up renderer|loading maps\//i, 32],
  [/custom resource/i, 48],
  [/precach|loading (models|sounds|sprites)|loading decs/i, 64],
  [/signon|gamestate/i, 85]
];

function noteEngineLine(context, line) {
  const text = String(line || '').trim();
  if (!text) return;
  lastEngineLine = text.length > 140 ? `${text.slice(0, 137)}…` : text;
  globalThis.__goldsourceLastEngineLine = lastEngineLine;
  const history = globalThis.__goldsourceEngineHistory || [];
  history.push(text);
  globalThis.__goldsourceEngineHistory = history.slice(-500);
  if (loadingKind === 'loading') {
    for (const [pattern, floor] of LOAD_STAGES) {
      if (pattern.test(text)) {
        loadProgress = Math.max(loadProgress, floor);
        break;
      }
    }
  }
  if (shellView === 'loading') context.setLoading(undefined, lastEngineLine, undefined);
}

// Counter-Strike's main menu is a single-purpose join screen rendered by the
// engine menu library itself (patches/cs16/main-menu.patch adds a "Join Game"
// item that issues the bridge connect command); no DOM overlay is used.
function syncShellView(context, state) {
  if (state === 'booting' || state === 'loading') {
    if (state !== loadingKind) {
      loadProgress = state === 'booting' ? 96 : 6;
      loadingKind = state;
    }
    if (shellView !== 'loading') {
      context.showLoading();
      shellView = 'loading';
    }
    loadProgress = Math.min(loadProgress + 0.35, state === 'booting' ? 99 : 95);
    const title = state === 'booting'
      ? 'Starting the engine…'
      : networkedHint ? 'Joining the match…' : 'Loading the level…';
    context.setLoading(title, lastEngineLine, loadProgress);
    return;
  }
  loadingKind = null;
  if (state !== 'crashed' && shellView !== 'runtime') {
    context.showRuntime(state);
    shellView = 'runtime';
  }
}

function publishState(context, state, options) {
  engineState = state;
  document.documentElement.dataset.goldsourceState = state;
  syncShellView(context, state);
  // The shell's state enum has no 'booting'; it lives in its loading view.
  const shellState = state === 'booting' ? 'loading' : state;
  if (context.shell.engineState() !== shellState || options?.capture === true) context.setEngineState(shellState, options);
}

function nativeCall(name, returnType = 'number', argumentTypes = [], argumentsList = []) {
  if (!nativeReady || !xash?.running || !xash.em?.Module?.ccall) return null;
  try {
    return xash.em.Module.ccall(name, returnType, argumentTypes, argumentsList);
  } catch (error) {
    activeContext?.log(`GoldSource native contract ${name} failed: ${error}`);
    console.error(`[goldsource] native contract ${name} failed:`, error);
    return null;
  }
}

function nativeState() {
  const code = nativeCall('WasmGame_RuntimeState');
  return Number.isInteger(code) ? NATIVE_STATES[code] || 'crashed' : null;
}

function nativeCaptureIntent() {
  return nativeCall('WasmGame_CaptureIntent') === 1;
}

function controllerAction(action, pressed) {
  const next = Boolean(pressed);
  if (controllerHeld.get(action) === next) return;
  controllerHeld.set(action, next);
  nativeCall('WasmGame_ControllerAction', null, ['number', 'number'], [action, next ? 1 : 0]);
}

function releaseController() {
  for (const [action, pressed] of controllerHeld) {
    if (pressed) nativeCall('WasmGame_ControllerAction', null, ['number', 'number'], [action, 0]);
  }
  controllerHeld.clear();
  controllerMenu = null;
  controllerLookX = 0;
  controllerLookY = 0;
}

function applyControllerFrame(detail) {
  if (!nativeReady || !xash?.running || !detail?.actions) return;
  const actions = detail.actions;
  const menu = synchronizeEngineState() !== 'gameplay';
  if (controllerMenu !== menu) {
    releaseController();
    controllerMenu = menu;
  }
  const active = value => Number(value) >= 0.4;
  if (menu) {
    controllerAction(CONTROLLER_ACTION.up, active(actions.forward));
    controllerAction(CONTROLLER_ACTION.down, active(actions.backward));
    controllerAction(CONTROLLER_ACTION.menuLeft, active(actions.left));
    controllerAction(CONTROLLER_ACTION.menuRight, active(actions.right));
    controllerAction(CONTROLLER_ACTION.enter, active(actions.jump) || active(actions.attack));
    controllerAction(CONTROLLER_ACTION.menu, active(actions.menu) || active(actions.crouch) || active(actions.altAttack));
    return;
  }

  for (const [name, action] of Object.entries(CONTROLLER_ACTION)) {
    if (['enter', 'up', 'down', 'menuLeft', 'menuRight', 'use'].includes(name)) continue;
    controllerAction(action, active(actions[name]));
  }
  controllerAction(CONTROLLER_ACTION.use, active(actions.weapon));

  const deltaMs = Math.max(0, Math.min(100, Number(detail.deltaMs) || 16.667));
  controllerLookX += (Number(actions.lookX) || 0) * deltaMs * 0.5;
  controllerLookY += (Number(actions.lookY) || 0) * deltaMs * 0.5;
  const dx = Math.trunc(controllerLookX);
  const dy = Math.trunc(controllerLookY);
  controllerLookX -= dx;
  controllerLookY -= dy;
  if (dx || dy) nativeCall('WasmGame_ControllerMouse', null, ['number', 'number'], [dx, dy]);
}

function synchronizeEngineState(context = activeContext, event = null, captureGameplay = false) {
  if (contextIsLost) return 'paused';
  const state = nativeState();
  const now = performance.now();
  if (pendingCaptureEvent && now > pendingCaptureUntil) pendingCaptureEvent = null;
  const captureEvent = event || pendingCaptureEvent;
  const shouldCapture = (captureGameplay || Boolean(pendingCaptureEvent)) &&
    (state === 'gameplay' || (state === 'loading' && nativeCaptureIntent()));
  if (context && state) publishState(context, state, shouldCapture ? { capture: true, event: captureEvent } : undefined);
  if (shouldCapture) {
    captureRecoveryEvent = captureEvent;
    captureRecoveryUntil = now + 1500;
    pendingCaptureEvent = null;
  }
  return state || engineState;
}

function rememberCaptureIntent(event) {
  if (!event) return;
  pendingCaptureEvent = event;
  pendingCaptureUntil = performance.now() + 5000;
}

function synchronizeNativePointer(detail) {
  if (detail?.captured === true) {
    const dx = Math.round(Number(detail.movementX));
    const dy = Math.round(Number(detail.movementY));
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
    globalThis.__goldsourcePointerDeltas = (globalThis.__goldsourcePointerDeltas || 0) + 1;
    globalThis.__goldsourceLastPointerDelta = [dx, dy];
    nativeCall('WasmGame_PointerDelta', null, ['number', 'number'], [dx, dy]);
    return;
  }
  const x = Math.round(Number(detail?.x));
  const y = Math.round(Number(detail?.y));
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  globalThis.__goldsourcePointerMoves = (globalThis.__goldsourcePointerMoves || 0) + 1;
  globalThis.__goldsourceLastPointer = [x, y];
  nativeCall('WasmGame_PointerMove', null, ['number', 'number'], [x, y]);
}

function playerNameStatus(context = activeContext) {
  if (!context || context.config.identity === false) return 2;
  const expected = safePlayerName(context.preferences.values().playerName);
  const status = nativeCall('WasmGame_PlayerNameStatus', 'number', ['string'], [expected]);
  if (!Number.isInteger(status)) return -1;
  document.documentElement.dataset.goldsourceIdentity = ['mismatch', 'pending', 'server'][status] || 'mismatch';
  if (status === 0 && performance.now() - lastIdentityRetryAt >= 500) {
    lastIdentityRetryAt = performance.now();
    applyPreferences(context.preferences.values());
  }
  return status;
}

function pollNativeContract(context) {
  synchronizeEngineState(context);
  playerNameStatus(context);
}

async function start(context) {
  if (started) return;
  started = true;
  nativeReady = false;
  activeContext = context;
  const selected = configurationFor(context.variant);
  try {
    context.setLoading('Preparing the game…', '', 4);
    const policy = ownerPolicy(context);
    const dataSet = context.framework.createOwnerDataSet(policy);
    const ownerData = await context.dataClient.load(dataSet, {
      onProgress: detail => {
        const total = Number(detail.total) || 0;
        const received = Number(detail.received) || 0;
        const percent = total ? Math.min(55, 5 + Math.round((received / total) * 50)) : 12;
        context.setLoading('Preparing the game…', '', percent);
      }
    });

    const override = new URLSearchParams(location.search).has('server');
    const networked = selected.multiplayer === true || (selected.multiplayer === 'optional' && override);
    networkedHint = networked;
    const endpoint = networked ? websocketEndpoint() : null;
    context.setLoading('Initializing Xash3D-FWGS…', networked ? `Connecting through ${endpoint.href}` : 'Loading WebAssembly modules.', 58);
    // The engine's SDL2 input layer resolves its event target through the
    // hardcoded `#canvas` selector, so the shell canvas must answer to it
    // before the engine registers its mouse handlers.
    context.elements.canvas.id = 'canvas';
    const options = engineOptions(context, selected, networked);
    xash = networked ? new WebRtcXash(options, endpoint) : new Xash3D(options);
    globalThis.__csXash = xash; // TEMP: expose for WebRTC diagnostics
    await xash.init();

    persistentMount = await context.persistence.attach(xash.em.FS, { root: context.persistence.root });
    bindWritableRoot(xash.em.FS, persistentMount.root);
    trackPersistentWrites(xash.em.FS, persistentMount);

    context.setLoading('Preparing the game…', '', 72);
    await context.framework.mountOwnerFiles(xash.em, ownerData, {
      root: ROOT,
      preservePaths: true,
      chunkBytes: 8 * 1024 * 1024,
      onProgress: detail => {
        const total = Number(detail.total) || 0;
        const copied = Number(detail.copied) || 0;
        const percent = total ? 72 + Math.round((copied / total) * 18) : 88;
        context.setLoading('Preparing the game…', '', percent);
      }
    });
    const extrasResponse = await fetch(extrasUrl);
    if (!extrasResponse.ok) throw new Error(`Xash support data failed with HTTP ${extrasResponse.status}.`);
    await writeBlob(xash.em.FS, `${ROOT}/extras.pk3`, await extrasResponse.blob());
    xash.em.FS.chdir('/rwdir');

    // Keep the shell loading overlay up through engine boot; publishState
    // swaps to the runtime view when the native state machine reaches menu.
    lastEngineLine = 'WASD + mouse; Escape releases capture.';
    publishState(context, 'booting');
    xash.main();
    // Xash3D.main() only schedules native main when side modules are still
    // compiling. Module.calledRun is set in the same synchronous turn that
    // initializes the command pool and enters the engine loop, so wait for it
    // before issuing commands or invoking the browser/native contract.
    await waitForNativeMain(xash);
    nativeReady = true;
    nativeViewport = `${options.arguments[options.arguments.indexOf('-width') + 1]}x${options.arguments[options.arguments.indexOf('-height') + 1]}`;
    synchronizeNativeViewport(pendingViewport || {
      bufferWidth: context.elements.canvas.width,
      bufferHeight: context.elements.canvas.height
    });
    // Queue these after native startup so config execution cannot restore the
    // engine defaults over the launcher identity and browser controls.
    queueMicrotask(() => {
      applyPreferences(context.preferences.values());
      pollNativeContract(context);
    });
    telemetryTimer = setInterval(() => pollNativeContract(context), 50);
  } catch (error) {
    started = false;
    nativeReady = false;
    engineState = 'crashed';
    throw error;
  }
}

window.addEventListener('keydown', event => {
  if (event.key === 'Escape') lastEscapeAt = performance.now();
}, true);
window.addEventListener('keyup', event => {
  if (event.key === 'Escape' || event.key === 'Enter' || event.key === 'Tab' || event.code === 'Backquote') {
    rememberCaptureIntent(event);
    queueMicrotask(() => synchronizeEngineState(activeContext, event, true));
  }
}, true);
window.addEventListener('beforeunload', () => {
  if (telemetryTimer) clearInterval(telemetryTimer);
});

globalThis.WasmGameAdapter = Object.freeze({
  async init(context) {
    await loadManifest();
    configurationFor(context.variant);
    const capabilities = context.framework.requireCapabilities({ wasm: true, webgl2: true, audio: true, indexedDb: true });
    if (!capabilities.supported) throw new Error(`This browser is missing: ${capabilities.missing.join(', ')}.`);
    // The framework normalizes absolute menu coordinates and captured
    // movementX/movementY. Suppress SDL's parallel DOM mouse path before Xash
    // installs it so a locked movement is applied exactly once.
    context.elements.canvas.addEventListener('mousemove', event => event.stopImmediatePropagation(), true);
  },
  start,
  readEngineState(context) { return synchronizeEngineState(context); },
  readCaptureIntent() { return nativeCaptureIntent(); },
  resize(detail) {
    synchronizeNativeViewport(detail);
    return detail;
  },
  pointerMove(detail) {
    synchronizeNativePointer(detail);
  },
  pointerButton(detail, event) {
    synchronizeNativePointer(detail);
    if (detail?.pressed === false) {
      rememberCaptureIntent(event);
      queueMicrotask(() => synchronizeEngineState(activeContext, event, true));
    }
  },
  captureLost(_detail, context) {
    if (!nativeReady || !xash?.running) return;
    const now = performance.now();
    if (synchronizeEngineState(context) === 'gameplay') {
      if (captureRecoveryEvent && now <= captureRecoveryUntil) {
        const event = captureRecoveryEvent;
        queueMicrotask(() => synchronizeEngineState(context, event, true));
      } else if (now - lastEscapeAt > 750) {
        xash.Cmd_ExecuteString('togglemenu');
      }
    }
    queueMicrotask(() => synchronizeEngineState(context));
    persistentMount?.save().catch(error => context.log(error));
  },
  inputCaptureChanged(captured, context) {
    if (!nativeReady) return;
    nativeCall('WasmGame_SetInputCaptured', null, ['number'], [captured ? 1 : 0]);
    if (captured) {
      applyPreferences(context.preferences.values());
      void context.shell.resumeAudio();
    }
    synchronizeEngineState(context);
    playerNameStatus(context);
  },
  preferencesChanged(values, context) {
    applyPreferences(values);
    playerNameStatus(context);
  },
  controllerFrame(detail) {
    applyControllerFrame(detail);
  },
  controllerChanged(detail) {
    if (!detail?.connected || detail.selection === 'disabled' || detail.activeIndex == null) releaseController();
  },
  contextLost(_event, context) {
    contextIsLost = true;
    publishState(context, 'paused');
    context.log('WebGL context lost; waiting for browser restoration.');
  },
  contextRestored(_event, context) {
    contextIsLost = false;
    if (nativeReady) xash?.Cmd_ExecuteString('vid_restart');
    queueMicrotask(() => synchronizeEngineState(context));
    context.log('WebGL context restored; renderer restart requested.');
  },
  executeCommand(command) {
    if (!nativeReady || !xash?.running) return false;
    xash.Cmd_ExecuteString(String(command));
    return true;
  },
  readFile(path) {
    if (!nativeReady || !xash?.running) return null;
    try {
      const bytes = xash.em.FS.readFile(String(path));
      return new TextDecoder().decode(bytes);
    } catch (_) {
      return null;
    }
  }
});
