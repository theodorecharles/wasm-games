#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../src/framework-adapter.js', import.meta.url), 'utf8');
const start = source.indexOf('function installInputProof(context) {');
const end = source.indexOf('// Local development WebRTC bridge', start);
assert.ok(start >= 0 && end > start);
const method = source.slice(start, end);
function fixture(search, request = () => undefined, exit = () => undefined) {
  const listeners = new Map();
  const attach = (target, type, callback) => listeners.set(`${target}:${type}`, callback);
  const canvas = { isConnected: true, requestPointerLock: request, addEventListener: (type, callback) => attach('canvas', type, callback) };
  const document = { documentElement: { dataset: {} }, pointerLockElement: null,
    exitPointerLock: exit,
    visibilityState: 'visible', hasFocus: () => true,
    addEventListener: (type, callback) => attach('document', type, callback) };
  const sandbox = vm.createContext({ URLSearchParams, location: { search }, document,
    navigator: { userActivation: { isActive: true } }, performance: { now: () => 42 },
    window: { addEventListener: (type, callback) => attach('window', type, callback) } });
  const install = vm.runInContext(`${method}; installInputProof`, sandbox);
  install({ elements: { canvas, runtime: { hidden: false } } });
  return { canvas, document, listeners, records: () => JSON.parse(document.documentElement.dataset.goldsourceInputProof) };
}
for (const query of ['', '?proof=unrelated']) {
  const request = () => undefined;
  const exit = () => undefined;
  const test = fixture(query, request, exit);
  assert.equal(test.canvas.requestPointerLock, request, 'ordinary launch must remain unwrapped');
  assert.equal(test.document.exitPointerLock, exit);
  assert.equal(test.listeners.size, 0);
  assert.equal(test.document.documentElement.dataset.goldsourceInputProof, undefined);
}
const sync = fixture('?proof=input-capture');
assert.equal(sync.canvas.requestPointerLock(), undefined);
assert.equal(sync.records().at(-1).type, 'capture-request');
assert.equal(sync.records().at(-1).activated, true);
assert.equal(sync.records().at(-1).connected, true);
assert.equal(sync.records().at(-1).runtimeHidden, false);
let receiver, args;
const resolved = Promise.resolve();
const success = fixture('?proof=input-capture', function (...values) { receiver = this; args = values; return resolved; });
const options = { unadjustedMovement: true };
assert.equal(success.canvas.requestPointerLock(options), resolved, 'do not replace the native Promise');
await resolved;
assert.equal(receiver, success.canvas);
assert.deepEqual(args, [options]);
assert.equal(success.records().at(-1).type, 'capture-resolved');
const rejection = Object.assign(new Error('Document is not focused'), { name: 'WrongDocumentError' });
const rejected = Promise.reject(rejection);
const failure = fixture('?proof=input-capture', () => rejected);
assert.equal(failure.canvas.requestPointerLock(), rejected);
await assert.rejects(rejected, error => error === rejection);
assert.equal(failure.records().at(-1).type, 'capture-rejected');
assert.equal(failure.records().at(-1).message, rejection.message);
const thrown = fixture('?proof=input-capture', () => { throw rejection; });
assert.throws(() => thrown.canvas.requestPointerLock(), error => error === rejection);
assert.equal(thrown.records().at(-1).type, 'capture-threw');
const exitReturn = {};
const exit = fixture('?proof=input-capture', undefined, function (...values) {
  receiver = this; args = values; return exitReturn;
});
assert.equal(exit.document.exitPointerLock(options), exitReturn);
assert.equal(receiver, exit.document);
assert.deepEqual(args, [options]);
assert.equal(exit.records().at(-1).type, 'capture-exit');
assert.match(exit.records().at(-1).stack, /exitPointerLock/);
assert.ok(exit.records().at(-1).stack.length <= 1500);
const exitThrown = fixture('?proof=input-capture', undefined, () => { throw rejection; });
assert.throws(() => exitThrown.document.exitPointerLock(), error => error === rejection);
assert.equal(fixture('?proof=input-capture', null, null).document.exitPointerLock, null);
success.document.pointerLockElement = success.canvas;
success.listeners.get('document:pointerlockchange')({ isTrusted: true });
assert.equal(success.records().at(-1).captured, true);
assert.equal(success.records().at(-1).trusted, true);
assert.equal(success.listeners.has('canvas:keydown'), false, 'never collect text input');
for (let index = 0; index < 80; index++) sync.canvas.requestPointerLock();
assert.equal(sync.records().length, 64, 'proof history must be bounded');
console.log('Verified opt-in capture diagnostics: disabled launches, return/Promise/error identity, receiver/options, DOM state, privacy and bounded history.');
