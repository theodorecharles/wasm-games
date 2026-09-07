'use strict';
// Exercise the exact canvas factories used by both native diagnostics.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function factorySource(file) {
  const source = fs.readFileSync(path.join(__dirname, file), 'utf8');
  const start = source.indexOf('function createCanvas() {');
  const end = source.indexOf('\nglobalThis.AudioContext', start);
  assert.ok(start >= 0 && end > start, file);
  return source.slice(start, end);
}

function check(source) {
  const canvas = vm.runInNewContext(source + '\ncreateCanvas();', { inspectPixels() {} });
  for (const type of ['mousedown', 'mousemove', 'mouseup']) {
    let firstCalls = 0, secondCalls = 0;
    const first = () => firstCalls++, second = () => secondCalls++;
    for (let mode = 0; mode < 10; mode++) canvas.addEventListener(type, first, true);
    canvas.dispatch(type, { button: 0, pageX: 320, pageY: 240 });
    assert.equal(firstCalls, 1, type + ': video-mode registrations must not multiply events');
    canvas.addEventListener(type, second, true);
    canvas.dispatch(type, {});
    assert.equal(firstCalls, 2);
    assert.equal(secondCalls, 1, 'different callback remains independent');
    canvas.removeEventListener(type, first, true);
    canvas.dispatch(type, {});
    assert.equal(firstCalls, 2, 'removed callback must not fire');
    assert.equal(secondCalls, 2);
    canvas.removeEventListener(type, first, true);
    canvas.removeEventListener(type, second, true);
    canvas.dispatch(type, {});
    assert.equal(secondCalls, 2);
  }
}

for (const file of ['test-native-runtime.js', 'test-installed-runtime.js']) {
  const source = factorySource(file);
  check(source);
  const old = source.replace('if (!list.includes(listener)) list.push(listener);', 'list.push(listener);');
  assert.notEqual(old, source, 'negative control must change the listener policy');
  assert.throws(() => check(old), /video-mode registrations must not multiply events/);
  console.log(file + ': duplicate registration, independent callbacks, removal and old-policy negative control passed');
}
