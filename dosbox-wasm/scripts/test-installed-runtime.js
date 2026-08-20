#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const siteRoot = path.resolve(process.argv[2] || path.join(__dirname, '../web/dist'));
const variant = String(process.argv[3] || '');
const dataRoot = path.resolve(process.argv[4] || '/home/ted/Development/wasm/data/dosbox');
const durationMs = Math.max(3000, Number(process.argv[5]) || 12000);
const dataManifest = JSON.parse(fs.readFileSync(path.join(siteRoot, 'wasm-game-data.json'), 'utf8'));
const policy = dataManifest.variants?.[variant];
if (!policy) throw new Error(`Unknown DOSBox variant: ${variant || '(missing)'}`);

let audioBuffers = 0;
let frameUpdates = 0;
let changingFrames = 0;
let maximumColors = 0;
let title = '';
const failures = [];

class TestAudioContext {
  constructor() {
    this.destination = {};
    this.state = 'running';
    this.started = Date.now();
  }
  get currentTime() { return (Date.now() - this.started) / 1000; }
  createBuffer(channels, samples) {
    const storage = Array.from({ length: channels }, () => new Float32Array(samples));
    return { getChannelData: channel => storage[channel] };
  }
  createBufferSource() {
    return {
      connect() {},
      start() { audioBuffers += 1; },
      noteOn() { audioBuffers += 1; }
    };
  }
  resume() { this.state = 'running'; return Promise.resolve(); }
}

function inspectPixels(image) {
  const bytes = image?.data;
  if (!bytes?.length) return;
  frameUpdates += 1;
  const colors = new Set();
  const pixels = Math.floor(bytes.length / 4);
  const stride = Math.max(1, Math.floor(pixels / 4096));
  for (let pixel = 0; pixel < pixels; pixel += stride) {
    const offset = pixel * 4;
    colors.add(`${bytes[offset]},${bytes[offset + 1]},${bytes[offset + 2]},${bytes[offset + 3]}`);
    if (colors.size >= 512) break;
  }
  maximumColors = Math.max(maximumColors, colors.size);
  if (colors.size > 1) changingFrames += 1;
}

function createCanvas() {
  const context = {
    createImageData(width, height) {
      return { width, height, data: new Uint8ClampedArray(width * height * 4) };
    },
    putImageData(image) { inspectPixels(image); },
    drawImage(source) {
      const sourceContext = source?._testContext;
      if (sourceContext?.lastImage) inspectPixels(sourceContext.lastImage);
    },
    save() {}, restore() {}, fillRect() {}, clearRect() {},
    getImageData(x, y, width, height) { return this.createImageData(width, height); }
  };
  const originalPut = context.putImageData.bind(context);
  context.putImageData = image => {
    context.lastImage = image;
    originalPut(image);
  };
  return {
    id: 'canvas', width: 0, height: 0, _testContext: context,
    style: { setProperty() {}, removeProperty() {} },
    getContext(type) { return type === '2d' ? context : null; },
    addEventListener() {}, removeEventListener() {},
    getBoundingClientRect() { return { left: 0, top: 0, width: this.width, height: this.height }; },
    requestPointerLock() {}, focus() {}
  };
}

globalThis.AudioContext = TestAudioContext;
globalThis.Audio = class TestAudio {};
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: { userAgent: `dosbox-wasm installed ${variant}`, getGamepads: () => [] }
});
globalThis.screen = { width: 1280, height: 720 };
globalThis.window = globalThis;
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
const primaryCanvas = createCanvas();
globalThis.document = {
  body: { appendChild() {}, removeChild() {} },
  documentElement: {}, head: { appendChild() {} },
  addEventListener() {}, removeEventListener() {},
  getElementById(id) { return id === 'canvas' ? primaryCanvas : null; },
  createElement() { return createCanvas(); },
  get title() { return title; },
  set title(value) { title = String(value); }
};

process.on('uncaughtException', error => failures.push(error));
process.on('unhandledRejection', error => failures.push(error));

function mountFiles(module, gameRoot) {
  for (const spec of policy.files) {
    const source = path.join(dataRoot, ...String(spec.path).split('/'));
    const requested = String(spec.mountName || spec.name).replaceAll('\\', '/');
    const relative = policy.preservePaths === true ? requested : requested.split('/').at(-1);
    const target = path.join(gameRoot, ...relative.split('/'));
    assert.ok(fs.statSync(source).isFile(), `${variant}: missing ${source}`);
    module.FS.mkdirTree(path.dirname(target));
    module.FS.writeFile(target, fs.readFileSync(source));
    module.FS.chmod(target, 0o600);
  }
}

function tap(module, code, holdMs = 40) {
  module._DOSBox_WasmControllerKey(code, 1);
  setTimeout(() => module._DOSBox_WasmControllerKey(code, 0), holdMs);
}

(async () => {
  const factory = require(path.join(siteRoot, 'dosbox.js'));
  const module = await factory({
    canvas: primaryCanvas,
    noInitialRun: true,
    locateFile: file => path.join(siteRoot, file),
    print() {},
    printErr(message) {
      const text = String(message || '');
      if (/abort|exception|unreachable|table index|out of bounds/i.test(text)) failures.push(new Error(text));
    },
    onAbort(reason) { failures.push(new Error(`DOSBox aborted: ${reason}`)); }
  });

  const persistenceRoot = `/persistent/dosbox/${variant}`;
  const gameRoot = `${persistenceRoot}/game`;
  module.FS.mkdirTree(gameRoot);
  mountFiles(module, gameRoot);
  module.ccall('DOSBox_WasmSetHome', null, ['string'], [persistenceRoot]);
  module.FS.chdir(gameRoot);
  const commands = policy.commands.map(command => command.replaceAll('/game', gameRoot));
  try {
    module.callMain([
      ...policy.dosboxArguments,
      '-userconf',
      ...commands.flatMap(command => ['-c', command])
    ]);
  } catch (error) {
    if (error !== 'unwind') throw error;
  }

  // Exercise the exact native event queue used by browser key events. Enter
  // advances intros/menus, arrows move selection, and common action keys prove
  // that non-navigation controls reach the DOS program as well.
  const sequence = [13, 13, 274, 13, 32, 306, 308, 273, 276, 275];
  sequence.forEach((code, index) => setTimeout(() => tap(module, code), 1500 + index * 550));
  await new Promise(resolve => setTimeout(resolve, durationMs));

  assert.deepEqual(failures, [], failures.map(error => error?.stack || String(error)).join('\n'));
  assert.ok(module._DOSBox_WasmMachineSlices() > 10, `${variant}: native machine loop did not advance`);
  assert.ok(module._DOSBox_WasmAudioCallbacks() > 0, `${variant}: SDL audio callback did not run`);
  assert.ok(audioBuffers > 0, `${variant}: Web Audio did not receive buffers`);
  assert.ok(primaryCanvas.width > 0 && primaryCanvas.height > 0,
    `${variant}: canvas is ${primaryCanvas.width}x${primaryCanvas.height}`);
  assert.ok(frameUpdates > 0, `${variant}: SDL never presented a framebuffer`);
  assert.ok(changingFrames > 0 && maximumColors > 1,
    `${variant}: framebuffer remained uniform across ${frameUpdates} updates`);
  assert.ok(module.FS.analyzePath(`${persistenceRoot}/.dosbox/dosbox-0.74-3.conf`).exists,
    `${variant}: persistent configuration was not created`);

  console.log(JSON.stringify({
    variant,
    title,
    canvas: `${primaryCanvas.width}x${primaryCanvas.height}`,
    machineSlices: module._DOSBox_WasmMachineSlices(),
    audioCallbacks: module._DOSBox_WasmAudioCallbacks(),
    audioNonzeroCallbacks: module._DOSBox_WasmAudioNonzeroCallbacks(),
    audioBuffers,
    frameUpdates,
    changingFrames,
    maximumColors
  }));
  process.exit(0);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
