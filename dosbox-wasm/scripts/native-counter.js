'use strict';

const assert = require('node:assert/strict');

// A C++ Bit32u crosses the Wasm i32 ABI as a signed JavaScript Number.
// Preserve the unsigned counter value; CPU-cycle settings are signed and
// must not use this conversion.
function unsignedCounter(value) {
  assert.ok(Number.isInteger(value) && value >= -0x80000000 && value <= 0xffffffff,
    'Expected an exported 32-bit counter');
  return value >>> 0;
}

// Differences are valid between samples less than one full 32-bit wrap apart.
function counterDelta(current, previous) {
  return (unsignedCounter(current) - unsignedCounter(previous)) >>> 0;
}

module.exports = { unsignedCounter, counterDelta };
