#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const web = path.resolve(process.argv[2] || path.join(__dirname, '../web/dist'));
const factory = require(path.join(web, 'dosbox.js'));

let audioBuffers = 0;
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
      start() { audioBuffers++; },
      noteOn() { audioBuffers++; }
    };
  }
  resume() { this.state = 'running'; return Promise.resolve(); }
}

function createCanvas() {
  const context = {
    createImageData(width, height) {
      return { width, height, data: new Uint8ClampedArray(width * height * 4) };
    },
    putImageData() {},
    drawImage() {},
    save() {},
    restore() {},
    fillRect() {},
    clearRect() {},
    getImageData(x, y, width, height) {
      return this.createImageData(width, height);
    }
  };
  return {
    width: 0,
    height: 0,
    style: { setProperty() {}, removeProperty() {} },
    getContext(type) { return type === '2d' ? context : null; },
    addEventListener() {},
    removeEventListener() {},
    getBoundingClientRect() { return { left: 0, top: 0, width: this.width, height: this.height }; },
    requestPointerLock() {},
    focus() {}
  };
}

globalThis.AudioContext = TestAudioContext;
globalThis.Audio = class TestAudio {};
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: { userAgent: 'dosbox-wasm native regression', getGamepads: () => [] }
});
globalThis.screen = { width: 1280, height: 720 };
globalThis.window = globalThis;
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
globalThis.document = {
  body: { appendChild() {}, removeChild() {} },
  documentElement: {},
  addEventListener() {},
  removeEventListener() {},
  getElementById() { return null; },
  createElement() { return createCanvas(); }
};

const failures = [];
process.on('uncaughtException', error => failures.push(error));
process.on('unhandledRejection', error => failures.push(error));

(async () => {
  const canvas = createCanvas();
  const module = await factory({
    canvas,
    noInitialRun: true,
    locateFile: file => path.join(web, file),
    print() {},
    printErr() {}
  });

  assert.ok(module.FS.filesystems.IDBFS, 'the production module must link IDBFS');
  for (const name of [
    '_DOSBox_WasmControllerKey', '_DOSBox_WasmControllerMouse',
    '_DOSBox_WasmControllerButton', '_DOSBox_WasmSetHome',
    '_DOSBox_WasmCanvasWidth', '_DOSBox_WasmCanvasHeight',
    '_DOSBox_WasmMachineSlices',
    '_DOSBox_WasmAudioCallbacks', '_DOSBox_WasmAudioNonzeroCallbacks'
  ]) assert.equal(typeof module[name], 'function', `${name} must be exported`);

  const persistenceRoot = '/persistent/dosbox/jill1';
  const gameRoot = `${persistenceRoot}/game`;
  module.FS.mkdirTree(gameRoot);
  module.FS.writeFile(`${gameRoot}/WAIT.COM`, new Uint8Array([0xeb, 0xfe]));
  module.ccall('DOSBox_WasmSetHome', null, ['string'], [persistenceRoot]);
  module.callMain([
    '-userconf',
    '-c', `mount c ${gameRoot}`,
    '-c', 'c:',
    '-c', 'WAIT.COM'
  ]);

  await new Promise(resolve => setTimeout(resolve, 350));
  module._DOSBox_WasmControllerKey(273, 1);
  module._DOSBox_WasmControllerKey(273, 0);
  module._DOSBox_WasmControllerMouse(2, -1);
  module._DOSBox_WasmControllerButton(0, 1);
  module._DOSBox_WasmControllerButton(0, 0);
  await new Promise(resolve => setTimeout(resolve, 350));

  assert.deepEqual(failures, [], failures.map(error => error?.stack || String(error)).join('\n'));
  assert.ok(module.FS.analyzePath(`${persistenceRoot}/.dosbox/dosbox-0.74-3.conf`).exists,
    'DOSBox did not create its configuration below the IDBFS root');
  assert.ok(canvas.width > 0 && canvas.height > 0, `canvas is ${canvas.width}x${canvas.height}`);
  assert.equal(module._DOSBox_WasmCanvasWidth(), canvas.width);
  assert.equal(module._DOSBox_WasmCanvasHeight(), canvas.height);
  assert.ok(module._DOSBox_WasmMachineSlices() > 0, 'the native browser machine loop did not run');
  assert.ok(module._DOSBox_WasmAudioCallbacks() > 0, 'SDL audio callback did not run');
  assert.equal(module._DOSBox_WasmAudioNonzeroCallbacks(), 0,
    'the silent test program produced uninitialized audio samples');
  assert.ok(audioBuffers > 0, 'SDL did not queue audio buffers');
  console.log(`DOSBox native browser seam stayed live at ${canvas.width}x${canvas.height} with ` +
    `${module._DOSBox_WasmAudioCallbacks()} audio callbacks and ${audioBuffers} queued buffers`);
  process.exit(0);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
