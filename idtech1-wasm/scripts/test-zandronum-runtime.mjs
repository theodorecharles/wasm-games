#!/usr/bin/env node
// Actual native Wasm + WebSocket relay; fake DOM/2D output, not a Chrome test.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Override only the executable pair for old-artifact negative controls; support
// data still comes from this checkout and its hash is recorded separately.
const runtimeDir = process.env.IDTECH1_ZANDRONUM_RUNTIME_DIR || path.join(repo, 'web/dist');
const expectMenuBug = process.argv.includes('--expect-menu-bug');
const checkAudio = process.argv.includes('--audio');
const expectSilent = process.argv.includes('--expect-silent');
const suspended = process.argv.includes('--suspended');
const audioMode = process.env.IDTECH1_ZANDRONUM_AUDIO_MODE || 'both';
const sustainMs = Number(process.env.IDTECH1_TEST_SUSTAIN_MS || 0);
assert.ok(Number.isFinite(sustainMs) && sustainMs >= 0 && sustainMs <= 60000);
const audioContexts = [];
let scheduledBuffers = 0, nonzeroBuffers = 0, maxQueuedSeconds = 0;
class TestAudioContext {
  sampleRate = 44100;
  state = suspended ? 'suspended' : 'running';
  destination = {};
  started = performance.now();
  constructor() { audioContexts.push(this); }
  get currentTime() { return this.state === 'running' ? (performance.now() - this.started) / 1000 : 0; }
  createBuffer(channels, samples, rate) {
    const data = Array.from({ length: channels }, () => new Float32Array(samples));
    return { numberOfChannels: channels, length: samples, sampleRate: rate,
      duration: samples / rate, getChannelData: channel => data[channel] };
  }
  createBufferSource() {
    const context = this;
    return { connect() {}, disconnect() {}, stop() {},
      start(time) {
        scheduledBuffers++;
        maxQueuedSeconds = Math.max(maxQueuedSeconds, time - context.currentTime);
        let nonzero = false;
        for (let c = 0; c < this.buffer.numberOfChannels; c++) {
          for (const sample of this.buffer.getChannelData(c)) {
            assert.ok(Number.isFinite(sample) && Math.abs(sample) <= 1, 'page PCM must be finite and bounded');
            if (sample !== 0) nonzero = true;
          }
        }
        if (nonzero) nonzeroBuffers++;
      }
    };
  }
  resume() { if (this.state !== 'running') this.started = performance.now(); this.state = 'running'; return Promise.resolve(); }
  close() { this.state = 'closed'; return Promise.resolve(); }
}
const origin = process.env.IDTECH1_TEST_URL;
assert.ok(origin, 'Set IDTECH1_TEST_URL to an isolated test supervisor (not the live lab)');
const fromImage = Boolean(process.env.IDTECH1_TEST_FROM_IMAGE) && !process.env.IDTECH1_ZANDRONUM_RUNTIME_DIR;
const artifactBytes = Object.fromEntries(await Promise.all(
  ['zandronum.js', 'zandronum.wasm', 'zandronum.pk3'].map(async file => {
    if (fromImage) {
      const response = await fetch(`${origin}/dist/${file}`);
      assert.ok(response.ok, `image must serve ${file}`);
      return [file, Buffer.from(await response.arrayBuffer())];
    }
    return [file, fs.readFileSync(path.join(
      file.endsWith('.pk3') ? path.join(repo, 'web/dist') : runtimeDir, file))];
  })));
const game = process.argv[2] || 'doom2';
const iwads = { doom: 'DOOM.WAD', doom2: 'DOOM2.WAD', tnt: 'TNT.WAD', plutonia: 'PLUTONIA.WAD',
  heretic: 'HERETIC.WAD', hexen: 'HEXEN.WAD', chex: 'CHEX.WAD' };
assert.ok(iwads[game]);
process.on('uncaughtException', error => { console.error(error.stack); process.exit(1); });
let presented = 0;
const logs = [];
const events = { addEventListener() {}, removeEventListener() {} };
function canvas() {
  const ctx = {
    createImageData(w, h) { return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; },
    getImageData(x, y, w, h) { return this.createImageData(w, h); },
    putImageData() { presented++; }, drawImage() {}, fillRect() {}, clearRect() {}, save() {}, restore() {}
  };
  return { ...events, width: 960, height: 720, style: { setProperty() {}, removeProperty() {} },
    getContext: type => type === '2d' ? ctx : null, focus() {}, requestPointerLock() {},
    getBoundingClientRect() { return { x: 0, y: 0, left: 0, top: 0, width: this.width, height: this.height }; }
  };
}
const screenCanvas = canvas();
const sandbox = { console, performance, setTimeout, clearTimeout, setInterval, clearInterval,
  AudioContext: TestAudioContext, Audio: class { pause() {} play() { return Promise.resolve(); } },
  WebAssembly, WebSocket, TextDecoder, TextEncoder, URL, Blob, Uint8Array, Uint8ClampedArray,
  ...events, screen: { width: 960, height: 720 }, innerWidth: 960, innerHeight: 720,
  scrollX: 0, scrollY: 0, devicePixelRatio: 1,
  navigator: { userAgent: 'native diagnostic (not Chrome)', getGamepads: () => [] },
  requestAnimationFrame: callback => setTimeout(() => callback(performance.now()), 16),
  cancelAnimationFrame: clearTimeout,
  document: { ...events, hidden: false, visibilityState: 'visible',
    currentScript: { src: `${origin}/dist/zandronum.js` },
    body: { ...events, appendChild() {}, removeChild() {} }, documentElement: {},
    querySelector: () => screenCanvas, getElementById: () => screenCanvas,
    createElement: canvas, exitPointerLock() {}, hasFocus: () => true
  }
};
sandbox.window = sandbox;
sandbox.self = sandbox;
const context = vm.createContext(sandbox);
vm.runInContext(artifactBytes['zandronum.js'].toString('utf8'), context,
  { filename: 'zandronum.js', timeout: 10000 });
const module = await context.createZandronum({
  noInitialRun: true, canvas: screenCanvas,
  instantiateWasm(imports, receive) {
    const binary = new WebAssembly.Module(artifactBytes['zandronum.wasm']);
    const instance = new WebAssembly.Instance(binary, imports);
    receive(instance, binary);
    return instance.exports;
  },
  print(line) { logs.push(line); if (process.env.IDTECH1_VERBOSE) console.error(line); },
  printErr(line) { logs.push(line); if (process.env.IDTECH1_VERBOSE) console.error(line); }
});
module.FS.mkdirTree('/iwads');
module.FS.mkdirTree('/home/web_user/.config');
module.FS.writeFile(`/iwads/${iwads[game]}`, fs.readFileSync(path.join(
  process.env.IDTECH1_DATA_DIR || '/home/ted/wasm-game-data/crispy', iwads[game])));
module.FS.writeFile('/zandronum.pk3', artifactBytes['zandronum.pk3']);
const response = await fetch(`${origin}/wake`, { method: 'POST',
  headers: { 'content-type': 'application/json' }, body: JSON.stringify({ engine: 'zandronum', variant: game }) });
assert.ok(response.ok, await response.clone().text());
const status = await response.json();
assert.equal(status.variant, game);
assert.equal(status.mode, 'modernized');
context.runtime = module;
context.args = ['-iwad', `/iwads/${iwads[game]}`, '-connect', status.connect,
  '-wss', origin.replace(/^http/, 'ws') + status.wsPath, '-width', '960', '-height', '720',
  '+cl_startasspectator', '0', '+name', 'NativeProbe', '+vid_renderer', '0', '+fullscreen', '0'];
if (audioMode === 'sfx') context.args.push('-nomusic');
if (audioMode === 'music') context.args.push('-nosfx');
if (audioMode === 'disabled') context.args.push('-nosound');
if (audioMode === 'muted') context.args.push('+snd_sfxvolume', '0', '+snd_musicvolume', '0');
vm.runInContext('runtime.callMain(args)', context, { timeout: 15000 });
const deadline = Date.now() + 15000;
while ((module._I_BrowserRuntimeState() !== 1 || module._I_BrowserPlayerCount() < 3 ||
    module._I_BrowserFrameCount() < 35) && Date.now() < deadline) {
  await new Promise(resolve => setTimeout(resolve, 50));
}
assert.equal(module._I_BrowserRuntimeState(), 1, logs.slice(-30).join('\n'));
assert.equal(module._I_BrowserNetGame(), 1);
assert.ok(module._I_BrowserPlayerCount() >= 3, 'one human client must join two bots');
// A random deathmatch spawn may face a wall; test both directions rather than
// interpreting collision as an input failure. Wait for the complete snapshot,
// not only GS_LEVEL (which changes before the player actor is received).
const snapshotDeadline = Date.now() + 5000;
while (!logs.some(line => line.includes('Snapshot received.')) && Date.now() < snapshotDeadline) {
  await new Promise(resolve => setTimeout(resolve, 30));
}
assert.ok(logs.some(line => line.includes('Snapshot received.')));
const callbacksBeforeResume = module._I_BrowserAudioCallbackCount?.() || 0;
for (const context of audioContexts) await context.resume();
await new Promise(resolve => setTimeout(resolve, 250));
const before = [module._I_BrowserPlayerX(), module._I_BrowserPlayerY()];
let after = before;
let movementKey;
for (const key of [119, 115, 97, 100]) {
  module._I_BrowserControllerKey(key, 1);
  await new Promise(resolve => setTimeout(resolve, 400));
  module._I_BrowserControllerKey(key, 0);
  after = [module._I_BrowserPlayerX(), module._I_BrowserPlayerY()];
  movementKey = String.fromCharCode(key);
  if (after.some((value, index) => value !== before[index])) break;
}
assert.notDeepEqual(after, before, 'native multiplayer player must move');
module._I_BrowserControllerButton(1, 1);
await new Promise(resolve => setTimeout(resolve, 150));
const attacking = module._I_BrowserAttackDown();
module._I_BrowserControllerButton(1, 0);
await new Promise(resolve => setTimeout(resolve, 150));
assert.equal(attacking, 1);
assert.equal(module._I_BrowserAttackDown(), 0);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function tapKey(key) {
  module._I_BrowserControllerKey(key, 1);
  await delay(100);
  module._I_BrowserControllerKey(key, 0);
  await delay(100);
}
async function expectState(state, message) {
  const deadline = Date.now() + 2000;
  while (module._I_BrowserRuntimeState() !== state && Date.now() < deadline) await delay(30);
  assert.equal(module._I_BrowserRuntimeState(), state, message);
}
await tapKey(27);
const menus = { negativeControl: expectMenuBug };
if (expectMenuBug) {
  assert.equal(module._I_BrowserRuntimeState(), 1, 'old export incorrectly reports gameplay after Escape');
  assert.equal(typeof module._I_BrowserOpenMenu, 'undefined', 'old client lacks capture-loss menu hook');
  menus.escapeReportedGameplay = true;
  menus.missingCaptureLossHook = true;
} else {
  await expectState(0, 'Escape must report menu even during a network level');
  await tapKey(27);
  await expectState(1, 'Escape closes the menu and resumes gameplay');
  module._I_BrowserOpenMenu();
  await expectState(0, 'capture-loss hook opens the native menu');
  module._I_BrowserOpenMenu();
  await expectState(0, 'repeated capture-loss hook must not close the menu');
  await tapKey(27);
  await expectState(1, 'capture-loss menu can be closed');
  await tapKey(96);
  await expectState(0, 'the open native console must release gameplay capture');
  await tapKey(96);
  await expectState(1, 'closing the console restores gameplay state');
  Object.assign(menus, { escapeOpenClose: true, captureLossOpenClose: true,
    captureLossIdempotent: true, consoleOpenClose: true });
}
const callbacksBeforeSustain = module._I_BrowserAudioCallbackCount?.() || 0;
const framesBeforeSustain = module._I_BrowserFrameCount();
let peakActiveVoices = module._I_BrowserAudioActiveVoices?.() || 0;
const sustainDeadline = Date.now() + sustainMs;
while (Date.now() < sustainDeadline) {
  await delay(250);
  peakActiveVoices = Math.max(peakActiveVoices, module._I_BrowserAudioActiveVoices?.() || 0);
}
if (sustainMs) {
  assert.ok(module._I_BrowserFrameCount() > framesBeforeSustain + sustainMs / 100);
  assert.ok(module._I_BrowserAudioCallbackCount() > callbacksBeforeSustain + sustainMs / 50);
  assert.ok(peakActiveVoices < 128, 'two-bot match must not accumulate ended sound channels');
}
const audio = { mode: audioMode, suspendedStart: suspended, callbacksBeforeResume, sustainMs, peakActiveVoices,
  devices: module._I_BrowserAudioDeviceCount?.() || 0,
  callbacks: module._I_BrowserAudioCallbackCount?.() || 0,
  musicSamples: module._I_BrowserAudioMusicSamples?.() || 0,
  sfxSamples: module._I_BrowserAudioSfxSamples?.() || 0,
  voicesStarted: module._I_BrowserAudioVoicesStarted?.() || 0,
  voicesFinished: module._I_BrowserAudioVoicesFinished?.() || 0,
  activeVoices: module._I_BrowserAudioActiveVoices?.() || 0,
  scheduledBuffers, nonzeroBuffers, maxQueuedSeconds };
if (checkAudio) {
  if (audioMode === 'disabled') {
    assert.equal(audio.devices, 0);
    assert.equal(nonzeroBuffers, 0);
  } else if (audioMode === 'muted') {
    assert.equal(audio.devices, 1);
    assert.ok(audio.callbacks > 20);
    assert.equal(nonzeroBuffers, 0, 'native volume controls must silence page PCM');
  } else {
    assert.equal(audio.devices, 1, logs.slice(-20).join('\n'));
    assert.ok(audio.callbacks > 20 && nonzeroBuffers > 10, 'native output must reach non-silent page buffers');
    assert.ok(maxQueuedSeconds < 0.3, 'SDL audio queue must remain bounded');
    if (audioMode !== 'sfx') assert.ok(audio.musicSamples > 1000, 'native music synthesis must contribute PCM');
    else assert.equal(audio.musicSamples, 0);
    if (audioMode !== 'music') {
      assert.ok(audio.sfxSamples > 1000, 'native effects must contribute PCM');
      assert.ok(audio.voicesStarted > 0 && audio.voicesFinished > 0, 'completed effects must retire native channels');
      assert.ok(audio.activeVoices <= 256);
      assert.equal(audio.voicesStarted - audio.voicesFinished, audio.activeVoices);
    }
    else assert.equal(audio.sfxSamples, 0);
    if (suspended) assert.ok(callbacksBeforeResume < 20 && audio.callbacks > callbacksBeforeResume + 20);
  }
}
if (expectSilent) {
  assert.equal(audio.devices, 0);
  assert.equal(nonzeroBuffers, 0, 'old artifact must reproduce silent output');
}
console.log(JSON.stringify({ game, frames: module._I_BrowserFrameCount(), presented,
  runtimeOrigin: fromImage ? 'image-http' : 'local-artifacts',
  artifactHashes: Object.fromEntries(Object.entries(artifactBytes).map(([file, bytes]) =>
    [file, createHash('sha256').update(bytes).digest('hex')])),
  players: module._I_BrowserPlayerCount(), before, after, movementKey, attacking,
  menus,
  audio,
  scope: 'real native Wasm/UDP relay; fake DOM/2D; no browser/GPU/audio acceptance' }, null, 2));
process.exit(0);
