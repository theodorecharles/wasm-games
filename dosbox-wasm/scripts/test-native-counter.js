'use strict';

const assert = require('node:assert/strict');
const { unsignedCounter, counterDelta } = require('./native-counter');
const cases = [[0, 0], [1, 1], [10, 10], [0x7fffffff, 0x7fffffff],
  [-0x80000000, 0x80000000], [-2088228463, 2206738833], [-1, 0xffffffff],
  [0x80000000, 0x80000000], [0xffffffff, 0xffffffff]];
for (const [actual, expected] of cases) assert.equal(unsignedCounter(actual), expected);
for (const invalid of [undefined, null, '1', NaN, Infinity, 1.5, -0x80000001, 0x100000000]) {
  assert.throws(() => unsignedCounter(invalid), /Expected an exported 32-bit counter/);
}
// This actual ten-minute Jazz observation previously failed the > 10 gate,
// even though its framebuffer and audio counters kept advancing.
assert.equal(-2088228463 > 10, false);
assert.ok(unsignedCounter(-2088228463) > 10);
for (const [current, previous, expected] of [[10, 10, 0], [20, 10, 10],
  [-0x80000000, 0x7fffffff, 1], [0, -1, 1], [5, -5, 10]]) {
  assert.equal(counterDelta(current, previous), expected);
}
console.log('Unsigned Wasm counters: 9 values, 8 invalid inputs, 5 deltas and the observed Jazz negative control passed.');
