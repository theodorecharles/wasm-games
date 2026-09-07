#!/usr/bin/env node
// Native-Wasm diagnostic only: fake browser presentation, no Chrome/GPU proof.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { classicUdpWebSocket } from './helpers/classic-udp-websocket.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.on('uncaughtException', error => { console.error(error.stack); process.exit(1); });
const game = process.argv[2] || 'doom';
const smooth = process.argv.includes('--smooth');
const direct = process.argv.includes('--warp');
const audioEnabled = !process.argv.includes('--nosound');
const suspended = process.argv.includes('--suspended');
const expectDeadlock = process.argv.includes('--expect-deadlock');
const expectUnboundTurn = process.argv.includes('--expect-unbound-turn');
const network = process.argv.includes('--network');
const websocketEndpoint = process.env.IDTECH1_CLASSIC_WS_URL;
const expectedPlayers = Number(process.env.IDTECH1_CLASSIC_EXPECTED_PLAYERS || 3);
const expectedSlot = Number(process.env.IDTECH1_CLASSIC_EXPECTED_SLOT || 2);
if (network && websocketEndpoint) {
  const url = new URL(websocketEndpoint);
  assert.equal(url.hostname, '127.0.0.1');
  assert.notEqual(url.port, '8010', 'diagnostic must not join the live lab');
  assert.equal(url.protocol, 'ws:');
}
const networkTransport = network ? (websocketEndpoint
  ? { WebSocket, close() {} } : classicUdpWebSocket(Number(process.env.IDTECH1_CLASSIC_UDP_PORT))) : null;
const family = game === 'heretic' || game === 'hexen' ? game : 'doom';
const wadNames = { doom: 'DOOM.WAD', doom2: 'DOOM2.WAD', tnt: 'TNT.WAD',
  plutonia: 'PLUTONIA.WAD', heretic: 'HERETIC.WAD', hexen: 'HEXEN.WAD', chex: 'CHEX.WAD' };
assert.ok(wadNames[game], `Unknown game: ${game}`);
const artifactDir = process.env.IDTECH1_RUNTIME_DIR || path.join(repo, 'web/dist');
const digest = filename => createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
const artifactHashes = {
  js: digest(path.join(artifactDir, `crispy-${family}.js`)),
  wasm: digest(path.join(artifactDir, `crispy-${family}.wasm`)),
  adapter: digest(path.join(repo, 'web/game-adapter.js'))
};
const dataDir = process.env.IDTECH1_DATA_DIR || '/home/ted/wasm-game-data/crispy';
let presented = 0;
let frameCallback = null;
let audioCallbacks = 0;
let nonzeroAudioCallbacks = 0;
const audioContexts = [];
const log = [];
class TestAudioContext {
  sampleRate = 44100;
  state = suspended ? 'suspended' : 'running';
  destination = {};
  started = performance.now();
  constructor() { audioContexts.push(this); }
  get currentTime() { return (performance.now() - this.started) / 1000; }
  createBuffer(channels, samples) {
    const data = Array.from({ length: channels }, () => new Float32Array(samples));
    return { numberOfChannels: channels, getChannelData: channel => data[channel] };
  }
  createScriptProcessor(samples, inputs, outputs) {
    const audioContext = this;
    let timer;
    return {
      connect() {
        timer = setInterval(() => {
          if (!this.onaudioprocess || audioContext.state !== 'running') return;
          const outputBuffer = audioContext.createBuffer(outputs, samples);
          this.onaudioprocess({ outputBuffer });
          audioCallbacks++;
          if (outputBuffer.getChannelData(0).some(value => value !== 0)) nonzeroAudioCallbacks++;
        }, samples / audioContext.sampleRate * 1000);
      },
      disconnect() { clearInterval(timer); }
    };
  }
  resume() { this.state = 'running'; return Promise.resolve(); }
  close() { this.state = 'closed'; return Promise.resolve(); }
}
const listeners = () => ({ addEventListener() {}, removeEventListener() {} });
function canvas() {
  const context = {
    createImageData(width, height) {
      return { width, height, data: new Uint8ClampedArray(width * height * 4) };
    },
    getImageData(x, y, width, height) { return this.createImageData(width, height); },
    putImageData() { presented++; },
    drawImage() {}, fillRect() {}, clearRect() {}, save() {}, restore() {}
  };
  return {
    ...listeners(), width: 960, height: 720,
    style: { setProperty() {}, removeProperty() {} },
    getContext(type) { return type === '2d' ? context : null; },
    getBoundingClientRect() { return { x: 0, y: 0, left: 0, top: 0, width: this.width, height: this.height }; },
    focus() {}, requestPointerLock() {}, setAttribute() {}
  };
}
const screenCanvas = canvas();
const sandbox = {
  console, performance, setTimeout, clearTimeout, setInterval, clearInterval,
  ...(networkTransport ? { WebSocket: networkTransport.WebSocket } : {}),
  AudioContext: TestAudioContext,
  TextDecoder, TextEncoder, URL, Blob, WebAssembly, Uint8Array, Uint8ClampedArray,
  WebGLRenderingContext: class {},
  navigator: { userAgent: 'Native Wasm diagnostic (not a browser)', getGamepads: () => [] },
  screen: { width: 960, height: 720 }, innerWidth: 960, innerHeight: 720,
  devicePixelRatio: 1, scrollX: 0, scrollY: 0,
  ...listeners(),
  requestAnimationFrame(callback) { frameCallback = callback; return 1; },
  cancelAnimationFrame() { frameCallback = null; },
  document: {
    ...listeners(), title: '', hidden: false, visibilityState: 'visible',
    body: { ...listeners(), appendChild() {}, removeChild() {} },
    documentElement: { ...listeners() },
    currentScript: { src: `http://native.invalid/dist/crispy-${family}.js` },
    querySelector() { return screenCanvas; },
    getElementById() { return screenCanvas; },
    createElement: canvas, exitPointerLock() {}, hasFocus: () => true
  }
};
sandbox.window = sandbox;
sandbox.self = sandbox;
const context = vm.createContext(sandbox);
const source = fs.readFileSync(path.join(artifactDir, `crispy-${family}.js`), 'utf8');
vm.runInContext(source, context, { filename: `crispy-${family}.js`, timeout: 10000 });
const factoryName = `createCrispy${family[0].toUpperCase()}${family.slice(1)}`;
const module = await context[factoryName]({
  noInitialRun: true, canvas: screenCanvas,
  instantiateWasm(imports, receiveInstance) {
    const binary = new WebAssembly.Module(fs.readFileSync(path.join(artifactDir, `crispy-${family}.wasm`)));
    const instance = new WebAssembly.Instance(binary, imports);
    receiveInstance(instance, binary);
    return instance.exports;
  },
  print(line) { log.push(line); if (process.env.IDTECH1_VERBOSE) console.error(line); },
  printErr(line) { log.push(line); if (process.env.IDTECH1_VERBOSE) console.error(line); }
});
context.runtime = module;
module.FS.mkdirTree('/iwads');
module.FS.mkdirTree('/profiles');
module.FS.mkdirTree('/persistent');
module.FS.writeFile(`/iwads/${wadNames[game]}`, fs.readFileSync(path.join(dataDir, wadNames[game])));
// Read the actual adapter settings so this test cannot silently drift to a
// different audio device or a less demanding profile than the shipped game.
const adapterSource = fs.readFileSync(path.join(repo, 'web/game-adapter.js'), 'utf8');
const profileSource = adapterSource.slice(adapterSource.indexOf('const profiles ='),
  adapterSource.indexOf('const modernProfileVersion'));
const configSource = adapterSource.slice(adapterSource.indexOf('function classicConfig()'),
  adapterSource.indexOf('function modernConfig('));
assert.ok(profileSource.startsWith('const profiles ='));
assert.ok(configSource.startsWith('function classicConfig()'));
const settings = vm.runInNewContext(`${profileSource}\n${configSource}\n({ profiles, config: classicConfig() })`);
module.FS.writeFile('/persistent/default.cfg', settings.config);
if (expectUnboundTurn) {
  // Isolate the former key-encoding bug from the separately repaired audio wait.
  module.FS.writeFile('/persistent/default.cfg', settings.config.replace('key_left 16', 'key_left 113'));
}
module.FS.writeFile('/profiles/crispy.cfg', settings.profiles[smooth ? 'smooth' : 'original'].config.join('\n') + '\n');
context.args = ['-iwad', `/iwads/${wadNames[game]}`, '-config', '/persistent/default.cfg',
  '-extraconfig', '/profiles/crispy.cfg', '-savedir', '/persistent',
  '-window', '-nofullscreen', '-width', '960', '-height', '720'];
if (!audioEnabled) context.args.push('-nosound', '-nomusic');
if (game === 'chex') {
  module.FS.writeFile('/iwads/chex.deh', fs.readFileSync(path.join(repo, 'web/dist/chex.deh')));
  context.args.push('-deh', '/iwads/chex.deh');
}
if (direct) context.args.push('-warp', '1', ...(family !== 'hexen' && !['doom2', 'tnt', 'plutonia'].includes(game) ? ['1'] : []));
if (network) context.args.push('-connect', '1', '-wss', websocketEndpoint || 'ws://native.invalid/classic-diagnostic',
  '-nodes', '0', '-deathmatch');
const started = performance.now();
try {
  vm.runInContext('runtime.callMain(args)', context, { timeout: 5000 });
} catch (error) {
  if (!expectDeadlock || error.code !== 'ERR_SCRIPT_EXECUTION_TIMEOUT') throw error;
  assert.ok(audioEnabled);
  assert.ok(audioContexts.length > 0, 'negative control must reach SDL audio initialization');
  assert.ok(!log.some(line => line.includes('OPL_Init: Using driver')));
  assert.equal(module._I_BrowserFrameCount(), 0);
  console.log(JSON.stringify({ game, profile: smooth ? 'smooth' : 'original',
    expectedDeadlock: true, artifactHashes, frames: 0, audioCallbacks, elapsedMs: performance.now() - started,
    lastMessages: log.slice(-4),
    scope: 'negative control: original native Wasm hangs before OPL initialization' }));
  process.exit(0);
}
assert.ok(!expectDeadlock, 'negative control must reproduce the startup deadlock');
async function advance(milliseconds) {
  const until = performance.now() + milliseconds;
  while (performance.now() < until) {
    await new Promise(resolve => setTimeout(resolve, 16));
    const callback = frameCallback;
    frameCallback = null;
    if (callback) {
      context.nextFrame = callback;
      vm.runInContext('nextFrame(performance.now())', context, { timeout: 2000 });
    }
  }
}
if (network) {
  assert.ok(Number.isInteger(expectedPlayers) && expectedPlayers >= 3 && expectedPlayers <= 8);
  assert.ok(Number.isInteger(expectedSlot) && expectedSlot >= 2 && expectedSlot < expectedPlayers);
  const joinDeadline = performance.now() + 70000;
  while ((module._I_BrowserWaitingLaunch() || module._I_BrowserPlayerCount() !== expectedPlayers ||
      module._I_BrowserFrameCount() < 35) && performance.now() < joinDeadline)
    await advance(50);
  assert.equal(module._I_BrowserNetGame(), 1, log.slice(-20).join('\n'));
  assert.equal(module._I_BrowserWaitingLaunch(), 0);
  assert.equal(module._I_BrowserPlayerCount(), expectedPlayers, 'unchanged Wasm must join the expected peers');
  assert.equal(module._I_BrowserConsolePlayer(), expectedSlot, 'bots retain slots 0/1');
  const joinedMs = performance.now() - started;
  const samples = [];
  const until = performance.now() + Number(process.env.IDTECH1_BOT_TEST_MS || 25000);
  while (performance.now() < until) {
    // Real native inputs to the reference client; no AI/world-state mutation.
    module._I_BrowserControllerKey(119, 1);
    module._I_BrowserControllerButton(1, 1);
    await advance(350);
    module._I_BrowserControllerKey(119, 0);
    module._I_BrowserControllerButton(1, 0);
    module._I_BrowserControllerKey(113, 1);
    await advance(180);
    module._I_BrowserControllerKey(113, 0);
    await advance(250);
    assert.ok(!log.some(line => /consist[ae]ncy failure|error:/i.test(line)), log.slice(-20).join('\n'));
    samples.push({ frame: module._I_BrowserFrameCount(), x: module._I_BrowserPlayerX(),
      y: module._I_BrowserPlayerY(), players: module._I_BrowserPlayerCount() });
  }
  assert.ok(samples.at(-1).frame > 300, 'sustained synchronized native tics, not just lobby admission');
  assert.ok(samples.every(sample => sample.players === expectedPlayers), 'all clients must remain connected');
  assert.ok(new Set(samples.map(sample => `${sample.x},${sample.y}`)).size > 3, 'reference player must move');
  if (audioEnabled) {
    assert.ok(audioCallbacks > 5, 'native network audio callbacks must progress');
    assert.ok(nonzeroAudioCallbacks > 0, 'network audio must produce nonzero samples');
  }
  console.log(JSON.stringify({ passed: true, game, profile: smooth ? 'smooth' : 'original',
    artifactHashes, joinedMs, consolePlayer: expectedSlot, samples, audioEnabled, audioCallbacks,
    nonzeroAudioCallbacks, messages: log.slice(-12),
    scope: websocketEndpoint ? 'unchanged Wasm and real managed WebSocket/UDP relay; fake DOM/2D/audio destination, not Chrome'
      : 'unchanged shipped Wasm with real UDP bot peers; fake DOM/2D and diagnostic relay framing, not Chrome' }, null, 2));
  const drain = Number(process.env.IDTECH1_CLASSIC_DRAIN_MS || 0);
  assert.ok(Number.isFinite(drain) && drain >= 0 && drain <= 5000);
  if (drain) await advance(drain);
  networkTransport.close();
  process.exit(0);
}
async function key(code, milliseconds = 120) {
  module._I_BrowserControllerKey(code, 1);
  await advance(milliseconds);
  module._I_BrowserControllerKey(code, 0);
  await advance(120);
}
const deadline = started + 5000;
while (module._I_BrowserFrameCount() < 3 && performance.now() < deadline) await advance(50);
assert.ok(module._I_BrowserFrameCount() >= 3, 'startup must reach the cooperative main loop');
const startupMs = performance.now() - started;
for (const audioContext of audioContexts) await audioContext.resume();
const startupState = module._I_BrowserRuntimeState();
assert.equal(startupState, direct ? 1 : 0);
if (!direct) {
  await key(27);
  for (let i = 0; i < 4 && module._I_BrowserRuntimeState() !== 1; i++) await key(13);
  await advance(200);
  assert.equal(module._I_BrowserRuntimeState(), 1, 'native New Game menu must enter a level');
}
// Doom marks GS_LEVEL before its melt transition finishes. Gameplay tics are
// intentionally suspended during that animation, so do not enqueue both ends
// of an input press while the native transition is still running.
await advance(1800);
const beforeMove = { x: module._I_BrowserPlayerX(), y: module._I_BrowserPlayerY() };
await key(119, 650);
const afterMove = { x: module._I_BrowserPlayerX(), y: module._I_BrowserPlayerY() };
assert.notDeepEqual(afterMove, beforeMove, 'native W key must move the player');
const beforeTurn = module._I_BrowserPlayerAngle();
await key(113, 300);
const afterTurn = module._I_BrowserPlayerAngle();
if (expectUnboundTurn) {
  assert.equal(afterTurn, beforeTurn, 'legacy ASCII config must reproduce unbound Q');
  console.log(JSON.stringify({ game, profile: smooth ? 'smooth' : 'original',
    expectedUnboundTurn: true, artifactHashes, beforeTurn, afterTurn,
    frames: module._I_BrowserFrameCount(), scope: 'negative control: old ASCII key configuration' }));
  process.exit(0);
}
assert.notEqual(afterTurn, beforeTurn, 'native Q key must turn the player');
module._I_BrowserControllerKey(1073742048, 1);
await advance(220);
const attacking = module._I_BrowserAttackDown();
module._I_BrowserControllerKey(1073742048, 0);
await advance(220);
assert.equal(attacking, 1, 'native fire key must attack');
// Hexen updates attackdown when the current weapon animation returns to ready.
const releaseDeadline = performance.now() + 1500;
while (module._I_BrowserAttackDown() && performance.now() < releaseDeadline) await advance(50);
assert.equal(module._I_BrowserAttackDown(), 0, 'native attack must release');
await key(27);
assert.equal(module._I_BrowserRuntimeState(), family === 'doom' ? 0 : 2,
  'Escape must open the native menu (Heretic/Hexen also pause the game)');
await key(27);
assert.equal(module._I_BrowserRuntimeState(), 1, 'Escape must resume the level');
await advance(500);
const report = {
  game, profile: smooth ? 'smooth' : 'original', direct, startupMs, startupState, artifactHashes,
  frames: module._I_BrowserFrameCount(), state: module._I_BrowserRuntimeState(),
  beforeMove, afterMove, beforeTurn, afterTurn, attacking, menuResume: true, presented,
  audioEnabled, suspended, audioCallbacks, nonzeroAudioCallbacks,
  scope: 'native Wasm with fake DOM and 2D presentation; not Chrome/render/audio acceptance'
};
assert.ok(report.frames > 20, 'native main loop must advance');
assert.ok(report.presented > 20, 'software presentation must advance');
if (audioEnabled) {
  assert.ok(log.some(line => line.includes("OPL_Init: Using driver 'SDL'.")), 'real OPL detection must succeed');
  assert.ok(nonzeroAudioCallbacks > 10, 'native mixer must produce nonzero PCM');
}
console.log(JSON.stringify(report, null, 2));
process.exit(0);
