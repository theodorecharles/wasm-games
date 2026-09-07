#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { dispatchNativeInput } = require('./native-interactive-input');
const { unsignedCounter, counterDelta } = require('./native-counter');

const siteRoot = path.resolve(process.argv[2] || path.join(__dirname, '../web/dist'));
const variant = String(process.argv[3] || '');
const dataRoot = path.resolve(process.argv[4] || '/home/ted/wasm-game-data/dosbox');
const durationMs = Math.max(3000, Number(process.argv[5]) || 12000);
const minimumTimerMs = Math.max(0, Number(process.env.DOSBOX_NATIVE_MIN_TIMER_MS) || 0);
if (minimumTimerMs) {
  const hostSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (callback, delay, ...args) =>
    hostSetTimeout(callback, Math.max(minimumTimerMs, Number(delay) || 0), ...args);
}
const reportRoot = process.env.DOSBOX_NATIVE_REPORT_DIR && path.resolve(process.env.DOSBOX_NATIVE_REPORT_DIR);
const sampleIntervalMs = Math.max(100, Number(process.env.DOSBOX_NATIVE_SAMPLE_MS) || 5000);
const interactive = process.env.DOSBOX_NATIVE_INTERACTIVE === '1';
if (interactive) assert.ok(reportRoot, 'interactive input requires a report directory for screen inspection');
if (reportRoot) fs.mkdirSync(reportRoot, { recursive: true });
const dataManifest = JSON.parse(fs.readFileSync(path.join(siteRoot, 'wasm-game-data.json'), 'utf8'));
const policy = dataManifest.variants?.[variant];
if (!policy) throw new Error(`Unknown DOSBox variant: ${variant || '(missing)'}`);

let audioBuffers = 0;
let audioNonzeroBuffers = 0;
let frameUpdates = 0;
let changingFrames = 0;
let nonuniformFrames = 0;
let previousFrame = null;
let lastFrame = null;
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
      start() {
        audioBuffers += 1;
        if (this.buffer?.getChannelData(0).some(sample => sample !== 0)) audioNonzeroBuffers += 1;
      },
      noteOn() { audioBuffers += 1; }
    };
  }
  resume() { this.state = 'running'; return Promise.resolve(); }
}

function inspectPixels(image) {
  const bytes = image?.data;
  if (!bytes?.length) return;
  frameUpdates += 1;
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (!previousFrame || !buffer.equals(previousFrame)) changingFrames += 1;
  previousFrame = Buffer.from(buffer);
  lastFrame = { width: image.width, height: image.height, data: previousFrame };
  const colors = new Set();
  const pixels = Math.floor(bytes.length / 4);
  const stride = Math.max(1, Math.floor(pixels / 4096));
  for (let pixel = 0; pixel < pixels; pixel += stride) {
    const offset = pixel * 4;
    colors.add(`${bytes[offset]},${bytes[offset + 1]},${bytes[offset + 2]},${bytes[offset + 3]}`);
    if (colors.size >= 512) break;
  }
  maximumColors = Math.max(maximumColors, colors.size);
  if (colors.size > 1) nonuniformFrames += 1;
}

function createCanvas() {
  let canvas;
  const listeners = new Map();
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
    getImageData(x, y, width, height) {
      const image = this.createImageData(width, height);
      const previous = this.lastImage;
      if (previous) {
        for (let row = 0; row < height; row++) {
          if (row + y < 0 || row + y >= previous.height) continue;
          const left = Math.max(0, x), right = Math.min(previous.width, x + width);
          if (right > left) image.data.set(previous.data.subarray(
            ((row + y) * previous.width + left) * 4,
            ((row + y) * previous.width + right) * 4
          ), (row * width + left - x) * 4);
        }
      }
      return image;
    }
  };
  const originalPut = context.putImageData.bind(context);
  context.putImageData = image => {
    // Canvas retains pixels after putImageData returns. SDL reads them back
    // on subsequent locks; returning zero-filled pixels erased partial redraws
    // in this diagnostic, even when the production renderer was correct.
    context.lastImage = { width: image.width, height: image.height, data: image.data.slice() };
    originalPut(image);
  };
  canvas = {
    id: 'canvas', width: 0, height: 0, _testContext: context,
    style: { setProperty() {}, removeProperty() {} },
    getContext(type) { return type === '2d' ? context : null; },
    addEventListener(type, listener) {
      const list = listeners.get(type) || [];
      // Real EventTarget ignores repeated registration of the same listener.
      // SDL registers its canvas hooks again after video-mode changes.
      if (!list.includes(listener)) list.push(listener);
      listeners.set(type, list);
    },
    removeEventListener(type, listener) {
      listeners.set(type, (listeners.get(type) || []).filter(value => value !== listener));
    },
    dispatch(type, values) {
      const event = { type, preventDefault() {}, ...values };
      for (const listener of listeners.get(type) || []) listener(event);
    },
    getBoundingClientRect() { return { left: 0, top: 0, width: this.width, height: this.height }; },
    requestPointerLock() {}, focus() {}
  };
  return canvas;
}

globalThis.AudioContext = TestAudioContext;
globalThis.Audio = class TestAudio {};
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: { userAgent: `dosbox-wasm installed ${variant}`, getGamepads: () => [] }
});
globalThis.screen = { width: 1280, height: 720 };
globalThis.window = globalThis;
globalThis.scrollX = 0;
globalThis.scrollY = 0;
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
const primaryCanvas = createCanvas();
globalThis.document = {
  body: { appendChild() {}, removeChild() {} },
  documentElement: {}, head: { appendChild() {} },
  addEventListener() {}, removeEventListener() {},
  exitPointerLock() {},
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
      if (process.env.DOSBOX_NATIVE_TRACE === '1') console.log(text);
      if (/abort|exception|unreachable|table index|out of bounds/i.test(text)) failures.push(new Error(text));
    },
    onAbort(reason) { failures.push(new Error(`DOSBox aborted: ${reason}`)); }
  });

  const persistenceRoot = `/persistent/dosbox/${variant}`;
  const gameRoot = `${persistenceRoot}/game`;
  module.FS.mkdirTree(gameRoot);
  mountFiles(module, gameRoot);
  if (process.env.DOSBOX_NATIVE_TRACE_SAVES === '1') {
    assert.equal(variant, 'simcity2000');
    assert.ok(reportRoot, 'native save trace needs a report directory');
    const events = [];
    const isNewSave = stream => {
      const filename = String(stream?.path || '');
      return filename.startsWith(`${gameRoot}/`) && /\/[A-Z0-9_]{1,8}\.SC2$/.test(filename) &&
        !policy.files.some(spec => path.basename(String(spec.mountName || spec.name)).toUpperCase() === path.basename(filename));
    };
    for (const operation of ['write', 'llseek', 'close']) {
      const original = module.FS[operation].bind(module.FS);
      module.FS[operation] = (stream, ...args) => {
        const track = isNewSave(stream);
        const row = track && { operation, path: stream.path, position: stream.position };
        if (track && operation === 'write') {
          row.length = args[2];
          row.explicitPosition = args[3] ?? null;
          row.prefixHex = Buffer.from(args[0].subarray(args[1], args[1] + Math.min(16, args[2]))).toString('hex');
        }
        if (track && operation === 'llseek') [row.offset, row.whence] = args;
        const result = original(stream, ...args);
        if (track) {
          row.result = result ?? null;
          row.afterPosition = stream.position;
          events.push(row);
          fs.writeFileSync(path.join(reportRoot, 'native-save-io.json'), JSON.stringify(events, null, 2) + '\n');
        }
        return result;
      };
    }
  }
  if (variant === 'gta' && !module.FS.analyzePath(`${gameRoot}/GTADOS/DIG.INI`).exists &&
      process.env.DOSBOX_NATIVE_NO_SOUND_DEFAULT !== '1') {
    module.FS.writeFile(`${gameRoot}/GTADOS/DIG.INI`, fs.readFileSync(path.join(siteRoot, 'gta-sound.ini')));
  }
  module.ccall('DOSBox_WasmSetHome', null, ['string'], [persistenceRoot]);
  module.FS.chdir(gameRoot);
  const commands = policy.commands.map(command => command.replaceAll('/game', gameRoot));
  const pointerArguments = [];
  if (variant === 'nfs' || variant === 'simcity2000') {
    module.FS.writeFile('/browser-pointer.conf', fs.readFileSync(path.join(siteRoot, 'browser-pointer.conf')));
    pointerArguments.push('-conf', '/browser-pointer.conf');
  }
  try {
    module.callMain([
      ...policy.dosboxArguments,
      '-userconf',
      ...pointerArguments,
      ...commands.flatMap(command => ['-c', command])
    ]);
  } catch (error) {
    if (error !== 'unwind') throw error;
  }

  // Exercise the exact native event queue used by browser key events. Enter
  // advances intros/menus, arrows move selection, and common action keys prove
  // that non-navigation controls reach the DOS program as well.
  const sequence = process.env.DOSBOX_NATIVE_KEYS
    ? JSON.parse(process.env.DOSBOX_NATIVE_KEYS)
    : interactive ? [] : [13, 13, 274, 13, 32, 306, 308, 273, 276, 275].map((code, index) => ({ code, at: 1500 + index * 550 }));
  assert.ok(Array.isArray(sequence));
  sequence.forEach(({ code, at, holdMs = 40 }) => {
    assert.ok(Number.isInteger(code) && Number.isFinite(at) && at >= 0);
    setTimeout(() => tap(module, code, holdMs), at);
  });
  // Optional normalized canvas clicks enter SDL through its real event
  // listeners. This is a native diagnostic, not browser input acceptance.
  const clicks = JSON.parse(process.env.DOSBOX_NATIVE_CLICKS || '[]');
  assert.ok(Array.isArray(clicks));
  clicks.forEach(({ x, y, at, holdMs = 40, settleMs = 150 }) => {
    assert.ok(Number.isFinite(x) && x >= 0 && x <= 1 &&
      Number.isFinite(y) && y >= 0 && y <= 1 && Number.isFinite(at) && at >= 0 &&
      Number.isFinite(holdMs) && holdMs > 0 && Number.isFinite(settleMs) && settleMs >= 0);
    setTimeout(() => {
      const values = { button: 0, pageX: x * primaryCanvas.width, pageY: y * primaryCanvas.height };
      primaryCanvas.dispatch('mousemove', values);
      // DOS programs can consume motion in a separate tick from button state.
      // Let their own cursor update before pressing at the requested position.
      setTimeout(() => {
        primaryCanvas.dispatch('mousedown', values);
        setTimeout(() => primaryCanvas.dispatch('mouseup', values), holdMs);
      }, settleMs);
    }, at);
  });
  // NFS's captured adapter uses the exported relative event queue, not SDL's
  // absolute DOM coordinates. Keep this separate from normalized clicks.
  const relativeMouse = JSON.parse(process.env.DOSBOX_NATIVE_RELATIVE_MOUSE || '[]');
  assert.ok(Array.isArray(relativeMouse));
  relativeMouse.forEach(({ dx, dy, at, click = false, settleMs = 150, holdMs = 200 }) => {
    assert.ok(Number.isInteger(dx) && Number.isInteger(dy) && Number.isFinite(at) && at >= 0 &&
      Number.isFinite(settleMs) && settleMs >= 0 && Number.isFinite(holdMs) && holdMs > 0);
    setTimeout(() => {
      module._DOSBox_WasmControllerMouse(dx, dy);
      if (click) setTimeout(() => {
        module._DOSBox_WasmControllerButton(0, 1);
        setTimeout(() => module._DOSBox_WasmControllerButton(0, 0), holdMs);
      }, settleMs);
    }, at);
  });
  const started = Date.now();
  const samples = [];
  let lateActivity = null;
  if (process.env.DOSBOX_NATIVE_REQUIRE_LATE_ACTIVITY === '1') {
    assert.ok(durationMs >= 11000, 'late-activity checks need at least 11 seconds');
    setTimeout(() => {
      lateActivity = { changingFrames, audioNonzeroBuffers,
        audioNonzeroCallbacks: unsignedCounter(module._DOSBox_WasmAudioNonzeroCallbacks()) };
    }, durationMs - 10000);
  }
  function sample() {
    const row = {
      elapsedMs: Date.now() - started, title, frameUpdates, changingFrames, nonuniformFrames,
      machineSlices: unsignedCounter(module._DOSBox_WasmMachineSlices()),
      cpuCycles: module._DOSBox_WasmCpuCycles?.() ?? null,
      audioCallbacks: unsignedCounter(module._DOSBox_WasmAudioCallbacks()),
      audioNonzeroCallbacks: unsignedCounter(module._DOSBox_WasmAudioNonzeroCallbacks())
    };
    samples.push(row);
    if (variant === 'gta') {
      const soundConfig = `${gameRoot}/GTADOS/DIG.INI`;
      if (module.FS.analyzePath(soundConfig).exists) {
        fs.writeFileSync(path.join(reportRoot, 'gta-digital-sound.ini'), module.FS.readFile(soundConfig));
      }
    }
    fs.writeFileSync(path.join(reportRoot, 'samples.json'), JSON.stringify(samples, null, 2) + '\n');
    if (lastFrame) {
      const encoded = spawnSync('convert', ['-size', `${lastFrame.width}x${lastFrame.height}`,
        '-depth', '8', 'rgba:-', path.join(reportRoot, `frame-${samples.length}.png`)], {
        input: Buffer.from(lastFrame.data), encoding: 'utf8'
      });
      assert.equal(encoded.status, 0, encoded.stderr);
    }
    console.log(JSON.stringify(row));
  }
  const reporter = reportRoot && setInterval(sample, sampleIntervalMs);
  // Optional operator-driven native diagnostic. Inputs still use SDL's real
  // canvas listeners / the normal keyboard queue; this never controls Chrome.
  // Keeping a button down across samples lets us inspect DOS pull-down menus
  // before releasing it, without assuming a fixed-time script reached them.
  let input;
  if (interactive) {
    input = require('node:readline').createInterface({ input: process.stdin });
    input.on('line', line => {
      try {
        const command = JSON.parse(line);
        dispatchNativeInput(command, {
          sample() {
            sample();
            console.log(JSON.stringify({ frame: path.join(reportRoot, `frame-${samples.length}.png`) }));
          },
          mouse(type, x, y, button) {
            primaryCanvas.dispatch(type, { button, pageX: x * primaryCanvas.width, pageY: y * primaryCanvas.height });
          },
          key(code, pressed) { module._DOSBox_WasmControllerKey(code, pressed ? 1 : 0); },
          exportSave(name) {
            assert.equal(variant, 'simcity2000', 'save export is limited to the SimCity diagnostic');
            assert.ok(!policy.files.some(spec =>
              path.basename(String(spec.mountName || spec.name)).toUpperCase() === name),
            'owner-provided cities cannot be exported');
            const bytes = module.FS.readFile(`${gameRoot}/${name}`);
            const target = path.join(reportRoot, name);
            fs.writeFileSync(target, bytes, { flag: 'wx', mode: 0o600 });
            console.log(JSON.stringify({ nativeSave: target, bytes: bytes.length }));
          }
        });
        console.log(JSON.stringify({ nativeInput: command, elapsedMs: Date.now() - started }));
      } catch (error) {
        console.error(JSON.stringify({ inputError: error.message || String(error), errno: error.errno ?? null }));
      }
    });
    console.log('Native interactive input ready: JSON lines for sample, mouse, key or export-save; no Chrome control.');
  }
  await new Promise(resolve => setTimeout(resolve, durationMs));
  input?.close();
  if (reporter) { clearInterval(reporter); sample(); }

  assert.deepEqual(failures, [], failures.map(error => error?.stack || String(error)).join('\n'));
  assert.ok(unsignedCounter(module._DOSBox_WasmMachineSlices()) > 10, `${variant}: native machine loop did not advance`);
  assert.ok(unsignedCounter(module._DOSBox_WasmAudioCallbacks()) > 0, `${variant}: SDL audio callback did not run`);
  assert.ok(audioBuffers > 0, `${variant}: Web Audio did not receive buffers`);
  if (process.env.DOSBOX_NATIVE_REQUIRE_AUDIO === '1') {
    assert.ok(unsignedCounter(module._DOSBox_WasmAudioNonzeroCallbacks()) > 0, `${variant}: native PCM remained silent`);
    assert.ok(audioNonzeroBuffers > 0, `${variant}: page audio buffers remained silent`);
  }
  if (process.env.DOSBOX_NATIVE_REQUIRE_PROGRAM) {
    assert.equal(title.match(/Program:\s+(\S+)\s*$/)?.[1], process.env.DOSBOX_NATIVE_REQUIRE_PROGRAM,
      `${variant}: the expected DOS program must still be running, not the shell`);
  }
  if (process.env.DOSBOX_NATIVE_REQUIRE_CANVAS) {
    assert.equal(`${primaryCanvas.width}x${primaryCanvas.height}`, process.env.DOSBOX_NATIVE_REQUIRE_CANVAS,
      `${variant}: the expected gameplay video mode was not reached`);
  }
  if (process.env.DOSBOX_NATIVE_REQUIRE_LATE_ACTIVITY === '1') {
    assert.ok(lateActivity, `${variant}: no late-activity baseline was sampled`);
    assert.ok(changingFrames > lateActivity.changingFrames, `${variant}: late video updates stopped`);
    assert.ok(audioNonzeroBuffers > lateActivity.audioNonzeroBuffers &&
      counterDelta(module._DOSBox_WasmAudioNonzeroCallbacks(), lateActivity.audioNonzeroCallbacks) > 0,
      `${variant}: late native/page audio remained silent`);
  }
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
    machineSlices: unsignedCounter(module._DOSBox_WasmMachineSlices()),
    audioCallbacks: unsignedCounter(module._DOSBox_WasmAudioCallbacks()),
    audioNonzeroCallbacks: unsignedCounter(module._DOSBox_WasmAudioNonzeroCallbacks()),
    audioBuffers,
    audioNonzeroBuffers,
    frameUpdates,
    changingFrames,
    nonuniformFrames,
    maximumColors
  }));
  process.exit(0);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
