#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { unsignedCounter } = require('./native-counter');

const web = path.resolve(process.argv.slice(2).find(argument => !argument.startsWith('--')) ||
  path.join(__dirname, '../web/dist'));
const factory = require(path.join(web, 'dosbox.js'));
const pointerProbe = process.argv.includes('--pointer');
const keyboardOnly = process.argv.includes('--keyboard-only');
const adapterKeyboard = process.argv.includes('--adapter-keyboard');
const fileProbe = process.argv.includes('--files');
assert.ok([pointerProbe, keyboardOnly, adapterKeyboard, fileProbe].filter(Boolean).length <= 1,
  '--keyboard-only, --adapter-keyboard, --pointer and --files are separate diagnostics');
const letterScans = {
  a: 30, b: 48, c: 46, d: 32, e: 18, f: 33, g: 34, h: 35, i: 23,
  j: 36, k: 37, l: 38, m: 50, n: 49, o: 24, p: 25, q: 16, r: 19,
  s: 31, t: 20, u: 22, v: 47, w: 17, x: 45, y: 21, z: 44
};
const baseKeys = [
  [276, 0, 0x4b], [275, 0, 0x4d], [273, 0, 0x48], [274, 0, 0x50],
  [27, 27, 1], [97, 97, 0x1e], [8, 8, 0x0e], [13, 13, 0x1c],
  ...Object.entries(letterScans).map(([letter, scan]) => [letter.charCodeAt(0), letter.charCodeAt(0), scan]),
  ...Object.entries(letterScans).map(([letter, scan]) => [letter.charCodeAt(0), letter.toUpperCase().charCodeAt(0), scan, true]),
  ...Array.from('1234567890', (digit, index) => [digit.charCodeAt(0), digit.charCodeAt(0), index + 2])
];
const specialPhysicalKeys = { 276: 'ArrowLeft', 275: 'ArrowRight', 273: 'ArrowUp', 274: 'ArrowDown',
  27: 'Escape', 8: 'Backspace', 13: 'Enter' };
const policyCases = [
  ...baseKeys.map(([code, ascii, scan, shift]) => ({ code, ascii, scan, shift,
    wasd: false, physical: specialPhysicalKeys[code] ||
      (code >= 97 ? `Key${String.fromCharCode(code).toUpperCase()}` : `Digit${String.fromCharCode(code)}`) })),
  ...[['KeyW', 273, 0, 0x48], ['KeyA', 276, 0, 0x4b], ['KeyS', 274, 0, 0x50], ['KeyD', 275, 0, 0x4d],
    ['ArrowUp', 273, 0, 0x48], ['ArrowLeft', 276, 0, 0x4b], ['ArrowDown', 274, 0, 0x50], ['ArrowRight', 275, 0, 0x4d],
    ['KeyQ', 113, 113, 0x10], ['Tab', 9, 9, 0x0f], ['Escape', 27, 27, 1], ['Enter', 13, 13, 0x1c]]
    .map(([physical, code, ascii, scan]) => ({ physical, code, ascii, scan, wasd: true })),
  ...[['KeyW', 119, 0x11], ['KeyA', 97, 0x1e], ['KeyS', 115, 0x1f], ['KeyD', 100, 0x20],
    ['Digit9', 57, 0x0a], ['Digit0', 48, 0x0b], ['Digit6', 54, 7], ['Backspace', 8, 0x0e],
    ['Digit6', 54, 7], ['Enter', 13, 0x1c]]
    .map(([physical, code, scan]) => ({ physical, code, ascii: code, scan, wasd: false }))
];
const expectedKeys = adapterKeyboard ? policyCases.map(({ code, ascii, scan, shift }) => [code, ascii, scan, shift]) : baseKeys;

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
  const listeners = new Map();
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
    addEventListener(type, listener) {
      const list = listeners.get(type) || [];
      // SDL registers the same hooks again when the DOS video mode changes.
      // A real canvas keeps one copy of each listener.
      if (!list.includes(listener)) list.push(listener);
      listeners.set(type, list);
    },
    dispatch(type, values) {
      const event = { type, preventDefault() {}, ...values };
      for (const listener of listeners.get(type) || []) listener(event);
    },
    removeEventListener(type, listener) {
      listeners.set(type, (listeners.get(type) || []).filter(value => value !== listener));
    },
    getBoundingClientRect() { return { left: 80, top: 40, width: 1200, height: 900 }; },
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
globalThis.scrollX = 0;
globalThis.scrollY = 0;
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
globalThis.document = {
  body: { appendChild() {}, removeChild() {} },
  documentElement: {},
  addEventListener() {},
  removeEventListener() {},
  exitPointerLock() {},
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
    ...(keyboardOnly || adapterKeyboard ? [] : ['_DOSBox_WasmCpuCycles']),
    '_DOSBox_WasmAudioCallbacks', '_DOSBox_WasmAudioNonzeroCallbacks'
  ]) assert.equal(typeof module[name], 'function', `${name} must be exported`);

  const persistenceRoot = '/persistent/dosbox/jill1';
  const gameRoot = `${persistenceRoot}/game`;
  const savedConfigPath = `${persistenceRoot}/.dosbox/dosbox-0.74-3.conf`;
  const savedConfig = '[sdl]\nautolock=true\nsensitivity=50\n';
  module.FS.mkdirTree(gameRoot);
  if (pointerProbe) {
    module.FS.mkdirTree(`${persistenceRoot}/.dosbox`);
    module.FS.writeFile(savedConfigPath, savedConfig);
  }
  const probeDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'dosbox-input-probe-'));
  try {
    const probe = path.join(probeDirectory, 'KEYTEST.COM');
    execFileSync('nasm', ['-f', 'bin', `-DKEY_COUNT=${expectedKeys.length}`, path.join(__dirname,
      pointerProbe ? 'fixtures/mouse-probe.asm' : fileProbe ? 'fixtures/file-probe.asm' : 'fixtures/keyboard-probe.asm'), '-o', probe]);
    module.FS.writeFile(`${gameRoot}/KEYTEST.COM`, fs.readFileSync(probe));
  } finally {
    fs.rmSync(probeDirectory, { recursive: true, force: true });
  }
  module.ccall('DOSBox_WasmSetHome', null, ['string'], [persistenceRoot]);
  if (pointerProbe) module.FS.writeFile('/browser-pointer.conf',
    fs.readFileSync(path.join(web, 'browser-pointer.conf')));
  module.callMain([
    '-userconf',
    ...(pointerProbe ? ['-conf', '/browser-pointer.conf'] : []),
    '-c', `mount c ${gameRoot}`,
    '-c', 'c:',
    '-c', 'KEYTEST.COM'
  ]);

  await new Promise(resolve => setTimeout(resolve, 350));
  if (fileProbe) {
    const result = Buffer.from(module.FS.readFile(`${gameRoot}/RESULT.BIN`));
    const bytes = Buffer.from(module.FS.readFile(`${gameRoot}/FILE.BIN`));
    assert.deepEqual(failures, [], failures.map(error => error?.stack || String(error)).join('\n'));
    assert.equal(result[0], 1, 'DOS file operations must all succeed with the expected counts/offsets');
    assert.equal(bytes.length, 90008);
    assert.equal(bytes.toString('ascii', 0, 4), 'FORM');
    assert.equal(bytes.readUInt32BE(4), 90000, 'a seek-back header update must survive close');
    assert.deepEqual(result.subarray(1), bytes.subarray(0, 8), 'DOS reopen/read must see the patched header');
    assert.ok(bytes.subarray(8).every(value => value === 0x5a), 'all three large writes must survive');
    const openBytes = Buffer.from(module.FS.readFile(`${gameRoot}/OPEN.BIN`));
    // Observation only: an open guest file can still have buffered writes.
    // Guest close above is the completed-save oracle, not this snapshot.
    console.log('Open-file header visible before close:', openBytes.equals(bytes.subarray(0, 8)));
    console.log('DOS filesystem: 90 KB multipart write, 32-bit position, header backpatch, close and reopen passed.');
    process.exit(0);
  }
  if (pointerProbe) {
    const sample = async (type, x, y) => {
      canvas.dispatch(type, { button: 0, pageX: 80 + x * 1200, pageY: 40 + y * 900 });
      await new Promise(resolve => setTimeout(resolve, 80));
      module._DOSBox_WasmControllerKey(13, 1);
      module._DOSBox_WasmControllerKey(13, 0);
      await new Promise(resolve => setTimeout(resolve, 80));
    };
    await sample('mousemove', 0.25, 0.75);
    await sample('mousedown', 0.25, 0.75);
    await sample('mouseup', 0.25, 0.75);
    await sample('mousemove', 0.75, 0.25);
    await sample('mousemove', 0.5, 0.5);
    const bytes = Buffer.from(module.FS.readFile(`${gameRoot}/MOUSE.BIN`));
    const records = Array.from({ length: bytes.length / 6 }, (_, i) => ({
      buttons: bytes.readUInt16LE(i * 6), x: bytes.readUInt16LE(i * 6 + 2), y: bytes.readUInt16LE(i * 6 + 4)
    }));
    assert.deepEqual(failures, [], failures.map(error => error?.stack || String(error)).join('\n'));
    const expectedPositions = [[160, 360], [160, 360], [160, 360], [480, 120], [320, 240]];
    assert.equal(records.length, expectedPositions.length, 'DOS mouse probe must finish all samples');
    for (const [index, record] of records.entries()) {
      const [x, y] = expectedPositions[index];
      assert.ok(Math.abs(record.x - x) <= 1 && Math.abs(record.y - y) <= 1,
        `absolute scaled pointer must reach the DOS cursor: ${JSON.stringify(records)}`);
    }
    assert.deepEqual(records.map(record => record.buttons), [0, 1, 0, 0, 0], 'the first click must reach DOS, not desktop auto-lock');
    assert.equal(module.FS.readFile(savedConfigPath, { encoding: 'utf8' }), savedConfig,
      'the temporary mouse override must not rewrite the saved user configuration');
    console.log(`DOS mouse BIOS accepted scaled absolute coordinates and first-click press/release: ${JSON.stringify(records)}`);
    process.exit(0);
  }
  if (adapterKeyboard) {
    // Exercise the real adapter's DOM listeners and visible toggle against the
    // production native event queue, not a duplicate JavaScript key mapping.
    const { exercise } = require('./test-adapter');
    await exercise('jill1', { keyboardProbe: async ({ canvasListeners, modeButton, module: adapterModule }) => {
      const original = adapterModule._DOSBox_WasmControllerKey;
      adapterModule._DOSBox_WasmControllerKey = (code, pressed) => module._DOSBox_WasmControllerKey(code, pressed);
      const send = (type, code) => canvasListeners.get(type)({ code, repeat: false,
        stopImmediatePropagation() {}, preventDefault() {} });
      try {
        for (const { physical, wasd, shift } of policyCases) {
          if (modeButton.getAttribute('aria-pressed') !== String(wasd)) modeButton.listeners.get('click')();
          if (shift) send('keydown', 'ShiftLeft');
          send('keydown', physical);
          send('keyup', physical);
          if (shift) send('keyup', 'ShiftLeft');
          await new Promise(resolve => setTimeout(resolve, 80));
        }
      } finally {
        adapterModule._DOSBox_WasmControllerKey = original;
      }
    } });
  } else {
    for (const [code, , , shift] of expectedKeys) {
      if (shift) module._DOSBox_WasmControllerKey(304, 1);
      module._DOSBox_WasmControllerKey(code, 1);
      module._DOSBox_WasmControllerKey(code, 0);
      if (shift) module._DOSBox_WasmControllerKey(304, 0);
      await new Promise(resolve => setTimeout(resolve, 80));
    }
  }
  module._DOSBox_WasmControllerMouse(2, -1);
  module._DOSBox_WasmControllerButton(0, 1);
  module._DOSBox_WasmControllerButton(0, 0);
  await new Promise(resolve => setTimeout(resolve, 350));

  assert.deepEqual(failures, [], failures.map(error => error?.stack || String(error)).join('\n'));
  const actualKeys = Array.from(module.FS.readFile(`${gameRoot}/KEYS.BIN`));
  if (process.env.DOSBOX_KEYBOARD_PROOF) fs.writeFileSync(process.env.DOSBOX_KEYBOARD_PROOF, JSON.stringify({
    scope: adapterKeyboard ? 'Actual adapter DOM handlers and movement/typing control into production Wasm and a DOS BIOS diagnostic. Original letters/Shift/digits, WASD arrows and restored save-name typing. Not Chrome held-key/gameplay acceptance.' :
      'Production Wasm native event queue and actual DOS BIOS diagnostic. All lowercase and Shift-uppercase letters, digits, arrows, Escape, Backspace and Enter. Not Chrome held-key/gameplay acceptance.',
    keyboardOnly,
    adapterKeyboard,
    artifacts: ['dosbox.js', 'dosbox.wasm', ...(adapterKeyboard ? ['game-adapter.js'] : [])].map(file => ({file,
      sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(web, file))).digest('hex')})),
    cases: expectedKeys.map(([code, ascii, scan, shift], index) => ({
      code, shift: Boolean(shift), ...(adapterKeyboard ? { physical: policyCases[index].physical, wasd: policyCases[index].wasd } : {}),
      expected: [ascii, scan], actual: actualKeys.slice(index * 2, index * 2 + 2)
    }))
  }, null, 2) + '\n');
  assert.deepEqual(actualKeys, expectedKeys.flatMap(([, ascii, scan]) => [ascii, scan]),
    'DOS BIOS must receive distinct arrows, Escape, all letters/Shift letters, digits, Backspace, and Enter');
  assert.ok(module.FS.analyzePath(`${persistenceRoot}/.dosbox/dosbox-0.74-3.conf`).exists,
    'DOSBox did not create its configuration below the IDBFS root');
  assert.ok(canvas.width > 0 && canvas.height > 0, `canvas is ${canvas.width}x${canvas.height}`);
  assert.equal(module._DOSBox_WasmCanvasWidth(), canvas.width);
  assert.equal(module._DOSBox_WasmCanvasHeight(), canvas.height);
  assert.ok(unsignedCounter(module._DOSBox_WasmMachineSlices()) > 0, 'the native browser machine loop did not run');
  assert.ok(module._DOSBox_WasmAudioCallbacks() > 0, 'SDL audio callback did not run');
  assert.equal(module._DOSBox_WasmAudioNonzeroCallbacks(), 0,
    'the silent test program produced uninitialized audio samples');
  assert.ok(audioBuffers > 0, 'SDL did not queue audio buffers');
  console.log(`DOSBox BIOS accepted ${expectedKeys.length} key cases; native browser seam stayed live at ${canvas.width}x${canvas.height} with ` +
    `${module._DOSBox_WasmAudioCallbacks()} audio callbacks and ${audioBuffers} queued buffers`);
  process.exit(0);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
