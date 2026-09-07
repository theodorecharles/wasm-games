'use strict';

const assert = require('node:assert/strict');
const { dispatchNativeInput } = require('./native-interactive-input');
const calls = [];
const handlers = Object.fromEntries(['sample', 'mouse', 'key', 'exportSave']
  .map(name => [name, (...args) => calls.push([name, ...args])]));

dispatchNativeInput({ action: 'sample' }, handlers);
for (const type of ['mousemove', 'mousedown', 'mouseup']) {
  dispatchNativeInput({ action: 'mouse', type, x: 0.25, y: 0.75 }, handlers);
}
dispatchNativeInput({ action: 'mouse', type: 'mousedown', x: 0, y: 1, button: 2 }, handlers);
dispatchNativeInput({ action: 'key', code: 308, pressed: true }, handlers);
dispatchNativeInput({ action: 'key', code: 308, pressed: false }, handlers);
dispatchNativeInput({ action: 'export-save', name: 'NEWCITY.SC2' }, handlers);
assert.deepEqual(calls, [
  ['sample'], ['mouse', 'mousemove', 0.25, 0.75, 0],
  ['mouse', 'mousedown', 0.25, 0.75, 0], ['mouse', 'mouseup', 0.25, 0.75, 0],
  ['mouse', 'mousedown', 0, 1, 2], ['key', 308, true], ['key', 308, false],
  ['exportSave', 'NEWCITY.SC2']
]);

const invalid = [null, [], {}, { action: 'quit' },
  { action: 'mouse', type: 'wheel', x: 0, y: 0 },
  { action: 'mouse', type: 'mousedown', x: -0.1, y: 0 },
  { action: 'mouse', type: 'mousedown', x: 0, y: 1.1 },
  { action: 'mouse', type: 'mousedown', x: '0', y: 0 },
  { action: 'mouse', type: 'mousedown', x: 0, y: 0, button: 3 },
  { action: 'key', code: 0, pressed: true },
  { action: 'key', code: 513, pressed: true },
  { action: 'key', code: 13, pressed: 'false' },
  ...['../CITY.SC2', '/CITY.SC2', 'CITY/SC2', 'CITY.EXE', 'TOOLONGCITY.SC2', 'city.sc2', 'CITY.SC2\n']
    .map(name => ({ action: 'export-save', name }))];
for (const command of invalid) {
  assert.throws(() => dispatchNativeInput(command, handlers));
  assert.equal(calls.length, 8, 'invalid commands must not invoke native/file operations');
}
console.log(`Native interactive diagnostic: 8 valid commands and ${invalid.length} rejected commands passed.`);
