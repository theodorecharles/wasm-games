#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';

// Instantiate the actual linked engine without calling main. This tests native
// device enumeration in the shipped Wasm memory layout, not a browser or GPU.
const site = path.resolve(process.argv[2] || new URL('../build/site', import.meta.url).pathname);
const source = fs.readFileSync(path.join(site, 'openQ4-client_wasm32.js'), 'utf8');
const bytes = fs.readFileSync(path.join(site, 'openQ4-client_wasm32.wasm'));
let native;
let resolveReady, rejectReady;
const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
const module = {
  noInitialRun: true,
  onRuntimeInitialized: resolveReady,
  onAbort: rejectReady,
  instantiateWasm(imports, receive) {
    WebAssembly.instantiate(bytes, imports).then(({ instance, module }) => {
      native = instance;
      return receive(instance, module);
    }).catch(rejectReady);
    return {};
  }
};
const sandbox = {
  Module: module,
  // Keep constructors shared across the VM boundary: the SDK uses instanceof
  // for module metadata and for the function-table TypeError fallback.
  WebAssembly, TypeError,
  WorkerGlobalScope: function () {},
  location: { href: 'https://q4-native.test/engine.js' },
  URL, TextDecoder, TextEncoder, console, performance, crypto: globalThis.crypto,
  setTimeout, clearTimeout, setInterval, clearInterval,
  postMessage() {}, navigator: { hardwareConcurrency: 1 },
  addEventListener() {}, removeEventListener() {}
};
sandbox.self = sandbox;
vm.runInNewContext(source, sandbox, { filename: 'q4-native-engine.js' });
await ready;

// MAIN_MODULE also exposes the SDK's JavaScript AL wrappers on Module. Native
// engine calls use these strong Wasm definitions; do not test the JS wrappers.
const api = native.exports;
const heap = new Uint8Array(api.memory.buffer);
const start = api.alcGetString(0, 0x1005) >>> 0; // ALC_DEVICE_SPECIFIER
const names = [];
let cursor = start;
while (heap[cursor] && names.length < 10000 && cursor - start < 1000000) {
  const end = heap.indexOf(0, cursor);
  assert.ok(end >= cursor, 'device string must terminate inside Wasm memory');
  names.push(new TextDecoder().decode(heap.subarray(cursor, end)));
  cursor = end + 1;
}
const evidence = {
  wasmSha256: crypto.createHash('sha256').update(bytes).digest('hex'),
  scope: 'actual native engine exports, no native main, no browser/GPU',
  count: names.length,
  terminated: heap[cursor] === 0,
  scannedBytes: cursor - start,
  firstNames: names.slice(0, 8),
  firstNewline: names.find(name => name.includes('\n')) || null
};
console.log(JSON.stringify(evidence, null, 2));
if (process.env.Q4_DEVICE_GUI_PROBE) {
  const probe = await sandbox.loadWebAssemblyModule(
    fs.readFileSync(process.env.Q4_DEVICE_GUI_PROBE),
    { loadAsync: true, nodelete: true }, 'q4-device-gui-probe.wasm', {}
  );
  const result = probe.Q4DeviceGuiProbe();
  console.log(JSON.stringify({ nativeChoiceLexerResult: result }));
  assert.equal(result, 2, 'the actual menu device values must parse as Default and WebAudio');
  if (process.env.Q4_EXPECT_EXCEPTIONS === '1') {
    assert.equal(probe.Q4ExceptionProbe(), 1, 'native idException catching must unwind stack objects');
    console.log('Quake 4 native MAIN_MODULE/SIDE_MODULE idException catching and destructor unwinding passed');
  }
  if (process.env.Q4_EXPECT_INPUT === '1') {
    const inputResult = probe.Q4BrowserKeyboardProbe();
    console.log(JSON.stringify({ nativeKeyboardResult: inputResult }));
    assert.equal(inputResult, 1, 'browser Enter must reach the actual event and polled keyboard queues');
  }
}
assert.equal(names.length, 1, 'device enumeration must not scan adjacent engine constants');
assert.equal(names[0], 'WebAudio');
assert.equal(heap[start + 9], 0, 'the one-device list needs a second NUL');
const readString = pointer => {
  const end = heap.indexOf(0, pointer);
  assert.ok(end >= pointer);
  return new TextDecoder().decode(heap.subarray(pointer, end));
};
assert.equal(readString(api.alcGetString(0, 0x1004)), 'WebAudio');
const device = api.alcOpenDevice(0);
assert.ok(device);
assert.equal(readString(api.alcGetString(device, 0x1005)), 'WebAudio');
assert.equal(api.alcCloseDevice(device), 1);
console.log('Quake 4 native artifact device list, default name and opened-device name passed');
if (process.env.Q4_SHADOW_PROBE) {
  const probe = await sandbox.loadWebAssemblyModule(
    fs.readFileSync(process.env.Q4_SHADOW_PROBE),
    { loadAsync: true, nodelete: true }, 'q4-shadow-probe.wasm', {}
  );
  const packedPolicy = probe.Q4PackedRuntimePolicyProbe();
  const projection = probe.Q4ShadowProjectionProbe();
  console.log(JSON.stringify({ nativeShadowProjection: projection, browserPackedModelPolicy: packedPolicy }));
  assert.equal(projection, 1, 'native shadows must contain projected CPU vertices, silhouette walls and caps');
  assert.equal(packedPolicy, 0, 'browser MD5R models must materialize CPU silhouette topology');
  console.log('Quake 4 actual native CPU shadow projection, sil-trace geometry, caps and GPU/CPU policy passed; no browser/GPU acceptance implied');
}
