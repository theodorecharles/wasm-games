#!/usr/bin/env node
// Executes the actual NBlood Wasm with fake presentation/audio endpoints.
// This is a native diagnostic, never Chrome/GPU/audible acceptance.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const origin = process.env.BUILD_TEST_URL || 'http://127.0.0.1:8007';
const runtimeDirectory = process.env.BUILD_RUNTIME_DIR;
const dataRoot = process.env.BUILD_DATA_DIR || '/home/ted/wasm-game-data';
const input = process.env.BLOOD_TEST_INPUT || 'keyboard';
assert.ok(['keyboard', 'mouse', 'none'].includes(input));
const requestedWeapon = Number(process.env.BLOOD_TEST_WEAPON || 1);
assert.ok(Number.isInteger(requestedWeapon) && requestedWeapon >= 1 && requestedWeapon <= 12);
const observeWeapon = process.argv.includes('--observe-weapon');
const godMode = process.argv.includes('--god');
const alternate = process.argv.includes('--alternate');
const menuStart = process.argv.includes('--menu-start');
const tapAttack = process.argv.includes('--tap-attack');
const sampleRate = Number(process.env.BLOOD_TEST_SAMPLE_RATE || 44100);
assert.ok([44100, 48000].includes(sampleRate));
assert.ok(!alternate || input === 'mouse', 'alternate-fire test uses the native right mouse button');
const duration = Number(process.env.BLOOD_TEST_FIRE_MS || 10000);
assert.ok(Number.isFinite(duration) && duration >= 1000 && duration <= 60000);
const logs = [];
let phase = 'loading-artifacts';
let frames = 0;
let nonzeroFrames = 0;
let audioCallbacks = 0;
let nonzeroAudioCallbacks = 0;
let peakAudioSample = 0;
let frameCallback;
let context;
let module;
let weaponBefore;
const weaponQavs = new Set();
let attackSeen = false;
const artifactHashes = {};
function reportFailure(error) {
  console.error(JSON.stringify({ passed: false, phase, input, frames, audioCallbacks,
    artifactHashes, weaponBefore,
    weaponAtFailure: module?._NBlood_WasmTestState ? weaponState() : null,
    weaponQavs: [...weaponQavs], attackSeen,
    error: error.stack || String(error), diagnostics: context?.__bloodWasmDiagnostics,
    logs: logs.slice(-45) }, null, 2));
  process.exit(1);
}
process.on('uncaughtException', reportFailure);
process.on('unhandledRejection', reportFailure);
const artifacts = {};
for (const file of ['blood.js', 'blood.wasm', 'blood.data']) {
  if (runtimeDirectory) artifacts[file] = fs.readFileSync(path.join(runtimeDirectory, file));
  else {
    const response = await fetch(`${origin}/${file}`);
    assert.equal(response.status, 200, file);
    artifacts[file] = Buffer.from(await response.arrayBuffer());
  }
  artifactHashes[file] = createHash('sha256').update(artifacts[file]).digest('hex');
}
const eventTarget = () => ({ addEventListener() {}, removeEventListener() {}, dispatchEvent() {} });
function canvas() {
  const drawing = {
    createImageData(width, height) { return { width, height, data: new Uint8ClampedArray(width * height * 4) }; },
    getImageData(x, y, width, height) { return this.createImageData(width, height); },
    putImageData(image) {
      frames++;
      if (image.data.some((value, index) => index % 4 !== 3 && value !== 0)) nonzeroFrames++;
    },
    drawImage() {}, fillRect() {}, clearRect() {}, save() {}, restore() {}
  };
  return { ...eventTarget(), width: 800, height: 600,
    style: { setProperty() {}, removeProperty() {} },
    getContext: type => type === '2d' ? drawing : null,
    getBoundingClientRect() { return { left: 0, top: 0, x: 0, y: 0, width: this.width, height: this.height }; },
    focus() {}, setAttribute() {}, requestPointerLock() {} };
}
class DiagnosticAudioContext {
  state = 'running';
  sampleRate = sampleRate;
  destination = {};
  started = performance.now();
  get currentTime() { return (performance.now() - this.started) / 1000; }
  createBuffer(channels, length) {
    const planes = Array.from({ length: channels }, () => new Float32Array(length));
    return { length, numberOfChannels: channels, getChannelData: channel => planes[channel] };
  }
  createScriptProcessor(length, inputs, outputs) {
    const audio = this;
    let timer;
    return {
      connect() {
        timer = setInterval(() => {
          if (!this.onaudioprocess || audio.state !== 'running') return;
          const outputBuffer = audio.createBuffer(outputs, length);
          this.onaudioprocess({ outputBuffer });
          audioCallbacks++;
          let nonzero = false;
          for (let channel = 0; channel < outputs; channel++) {
            const pcm = outputBuffer.getChannelData(channel);
            // SDL mixes float audio before the device clips it; finite peaks
            // above one are legitimate and must not masquerade as an engine crash.
            assert.ok(pcm.every(value => Number.isFinite(value)));
            for (const value of pcm) peakAudioSample = Math.max(peakAudioSample, Math.abs(value));
            nonzero ||= pcm.some(value => value !== 0);
          }
          if (nonzero) nonzeroAudioCallbacks++;
        }, length * 1000 / audio.sampleRate);
      },
      disconnect() { clearInterval(timer); }
    };
  }
  resume() { this.state = 'running'; return Promise.resolve(); }
  close() { this.state = 'closed'; return Promise.resolve(); }
}
const output = canvas();
let initialized;
const ready = new Promise(resolve => { initialized = resolve; });
module = {
  noInitialRun: true, canvas: output,
  getPreloadedPackage() { return Uint8Array.from(artifacts['blood.data']).buffer; },
  instantiateWasm(imports, receive) {
    const binary = new WebAssembly.Module(artifacts['blood.wasm']);
    const instance = new WebAssembly.Instance(binary, imports);
    receive(instance, binary);
    return instance.exports;
  },
  print(line) { logs.push(line); if (process.env.BUILD_TEST_VERBOSE) console.error(line); },
  printErr(line) { logs.push(line); if (process.env.BUILD_TEST_VERBOSE) console.error(line); },
  onRuntimeInitialized() { initialized(); }
};
const sandbox = { Module: module, console, performance, setTimeout, clearTimeout, setInterval, clearInterval,
  WebAssembly, TextEncoder, TextDecoder, Uint8Array, Uint8ClampedArray, URL, Blob, Event,
  encodeURIComponent, ...eventTarget(),
  location: new URL(origin), AudioContext: DiagnosticAudioContext, WebGLRenderingContext: class {},
  navigator: { userAgent: 'Native Wasm diagnostic (not Chrome)', getGamepads: () => [] },
  screen: { width: 800, height: 600 }, innerWidth: 800, innerHeight: 600, devicePixelRatio: 1,
  requestAnimationFrame(callback) { frameCallback = callback; return 1; },
  cancelAnimationFrame() { frameCallback = null; },
  __bloodWasmDiagnostics: { simulationFrames: 0 },
  document: { ...eventTarget(), title: '', hidden: false, visibilityState: 'visible',
    documentElement: { ...eventTarget(), dataset: {} },
    body: { ...eventTarget(), appendChild() {}, removeChild() {} },
    currentScript: { src: `${origin}/blood.js` },
    querySelector: () => output, getElementById: () => output,
    createElement: canvas, exitPointerLock() {}, hasFocus: () => true }
};
sandbox.window = sandbox;
sandbox.self = sandbox;
context = vm.createContext(sandbox);
vm.runInContext(artifacts['blood.js'].toString(), context, { filename: 'blood.js', timeout: 10000 });
await ready;
const policy = JSON.parse(fs.readFileSync(path.join(repo, 'web/wasm-game-data.json'))).variants.blood;
module.FS.mkdirTree('/game');
module.FS.mkdirTree('/persistent');
for (const file of policy.files) {
  const filename = path.resolve(dataRoot, file.path);
  assert.ok(filename.startsWith(path.resolve(dataRoot) + path.sep));
  if (!fs.existsSync(filename) && file.required === false) continue;
  module.FS.writeFile(`/game/${file.name}`, fs.readFileSync(filename));
}
module.FS.chdir('/persistent');
context.testArgs = ['-game_dir=/game', '-noautoload', '-nosetup', '-quick', '-nodemo',
  ...(!menuStart ? ['-map=E1M1.MAP'] : [])];
phase = 'startup';
vm.runInContext('Module.callMain(testArgs)', context, { timeout: 10000 });
async function advance(milliseconds) {
  const until = performance.now() + milliseconds;
  while (performance.now() < until) {
    await new Promise(resolve => setTimeout(resolve, 16));
    const next = frameCallback;
    frameCallback = null;
    if (next) {
      context.nextFrame = next;
      vm.runInContext('nextFrame(performance.now())', context, { timeout: 5000 });
    }
    if (observeWeapon && (phase === 'firing' || phase === 'release')) {
      weaponQavs.add(module._NBlood_WasmTestState(1));
      // BUTTONFLAGS reserves bits 0/1 for jump/crouch, then shoot/shoot2.
      attackSeen ||= Boolean(module._NBlood_WasmTestState(3) & (alternate ? 8 : 4));
    }
  }
}
async function key(scan, duration = 100) {
  module._Build_WasmKeyEvent(scan, 1);
  await advance(duration);
  module._Build_WasmKeyEvent(scan, 0);
  await advance(100);
}
function weaponState() {
  if (!observeWeapon) return null;
  const state = module._NBlood_WasmTestState;
  return { weapon: state(0), qav: state(1), weaponState: state(2), attack: state(3),
    timer: state(4), health: state(5), god: state(6), ammoType: state(7), callbacks: state(8),
    ammo: Array.from({ length: 12 }, (_, index) => state(16 + index)) };
}
if (menuStart) {
  phase = 'native-new-game-menus';
  await advance(350);
  assert.equal(module._NBlood_WasmRuntimeState(), 0);
  for (let presses = 0; presses < 4 && !module._NBlood_WasmCaptureTarget(); presses++) {
    await key(0x1c);
    await advance(200);
  }
  assert.equal(module._NBlood_WasmCaptureTarget(), 1, 'menus must reach a stock difficulty row');
  await key(0x1c);
}
const deadline = performance.now() + 20000;
while ((module._NBlood_WasmRuntimeState() !== 1 || context.__bloodWasmDiagnostics.simulationFrames < 20)
  && performance.now() < deadline) await advance(100);
assert.equal(module._NBlood_WasmRuntimeState(), 1, logs.slice(-20).join('\n'));
assert.ok(context.__bloodWasmDiagnostics.simulationFrames >= 20);
assert.ok(nonzeroFrames > 0);
assert.ok(observeWeapon || (requestedWeapon === 1 && !godMode), 'arsenal testing requires the test-only observer');
if (observeWeapon) {
  assert.equal(typeof module._NBlood_WasmTestState, 'function', 'use the separate diagnostic build');
  phase = 'weapon-selection';
  if (godMode) module._NBlood_WasmTestCommand(0);
  if (requestedWeapon !== 1) module._NBlood_WasmTestCommand(1);
  const scan = 0x02 + (requestedWeapon > 10 ? 5 : requestedWeapon - 1);
  for (let tries = 0; tries < 4; tries++) {
    await key(scan);
    await advance(1500);
    if (module._NBlood_WasmTestState(0) === requestedWeapon) break;
  }
  assert.equal(module._NBlood_WasmTestState(0), requestedWeapon, 'native weapon selection');
  assert.equal(Boolean(module._NBlood_WasmTestState(6)), godMode);
}
if (process.argv.includes('--walk')) {
  phase = 'movement';
  const position = [...context.__bloodWasmDiagnostics.playerPosition];
  await key(0x12);
  await key(0x11, 1500);
  assert.notDeepEqual([...context.__bloodWasmDiagnostics.playerPosition], position, 'native movement must change position');
}
const before = JSON.parse(JSON.stringify(context.__bloodWasmDiagnostics));
weaponBefore = weaponState();
phase = 'firing';
const attack = pressed => {
  if (input === 'keyboard') module._Build_WasmKeyEvent(0x9d, pressed);
  if (input === 'mouse') module._Build_WasmPointerButton(alternate ? 2 : 0, pressed);
};
if (tapAttack) {
  const end = performance.now() + duration;
  while (performance.now() < end) {
    attack(1);
    // Exercise the native two-frame release guard used for very quick taps.
    attack(0);
    await advance(180);
  }
} else {
  attack(1);
  await advance(duration);
}
phase = 'release';
attack(0);
let gesture = tapAttack ? 'quick-taps' : 'hold-release';
if (alternate && [6, 7].includes(requestedWeapon)) {
  // TNT/spray alternate fire primes on the first press and drops on the
  // second; the release alone intentionally leaves a primed explosive held.
  await advance(150);
  module._Build_WasmPointerButton(2, 1);
  await advance(250);
  module._Build_WasmPointerButton(2, 0);
  gesture = 'prime-release-drop';
}
const settleMs = [5, 6, 7, 11, 12].includes(requestedWeapon) ? 4000 : 1500;
await advance(settleMs);
assert.equal(module._NBlood_WasmRuntimeState(), 1);
assert.ok(context.__bloodWasmDiagnostics.simulationFrames > before.simulationFrames + 30);
assert.ok(audioCallbacks > 10 && nonzeroAudioCallbacks > 5);
const weaponAfter = weaponState();
if (observeWeapon) {
  assert.equal(weaponAfter.attack & 12, 0, 'attack press must be released');
  if (input !== 'none') {
    assert.ok(attackSeen, 'native player must receive the requested attack flag');
    if (alternate && requestedWeapon === 9) {
      // Life Leech's alternate fire calls AltFireLifeLeech directly, outside
      // QAV callbacks, transferring its ammunition into the dropped weapon.
      assert.ok(weaponAfter.ammo[8] < weaponBefore.ammo[8], 'dropped Life Leech must receive ammunition');
    } else assert.ok(weaponAfter.callbacks > weaponBefore.callbacks, 'actual weapon callback must execute');
    assert.ok([...weaponQavs].some(qav => qav !== weaponBefore.qav), 'weapon animation must leave idle');
  } else assert.equal(weaponAfter.callbacks, weaponBefore.callbacks);
}
console.log(JSON.stringify({ passed: true, input, alternate, menuStart, sampleRate, duration, settleMs, gesture, artifactHashes,
  runtimeOrigin: runtimeDirectory ? 'local-artifacts' : 'image-http',
  frames, nonzeroFrames, audioCallbacks, nonzeroAudioCallbacks, peakAudioSample,
  before, after: context.__bloodWasmDiagnostics,
  weaponBefore, weaponAfter, attackSeen, weaponQavs: [...weaponQavs],
  scope: observeWeapon
    ? 'instrumented native Wasm: test-only observer/console setup; actual weapon callbacks; fake DOM/2D/WebAudio; no Chrome/audible acceptance'
    : 'production native Wasm; fake DOM/2D/WebAudio; no Chrome/audible acceptance; firing input injected but weapon state not instrumented'
}, null, 2));
process.exit(0);
