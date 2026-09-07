'use strict';

const assert = require('node:assert/strict');

// Diagnostic stdin only. Production input and Chrome controls never use this.
function dispatchNativeInput(command, handlers) {
  assert.ok(command && typeof command === 'object' && !Array.isArray(command));
  if (command.action === 'sample') {
    handlers.sample();
  } else if (command.action === 'mouse') {
    const { type, x, y, button = 0 } = command;
    assert.ok(['mousemove', 'mousedown', 'mouseup'].includes(type));
    assert.ok(Number.isFinite(x) && x >= 0 && x <= 1 && Number.isFinite(y) && y >= 0 && y <= 1);
    assert.ok(Number.isInteger(button) && button >= 0 && button <= 2);
    handlers.mouse(type, x, y, button);
  } else if (command.action === 'key') {
    assert.ok(Number.isInteger(command.code) && command.code > 0 && command.code <= 512);
    assert.equal(typeof command.pressed, 'boolean');
    handlers.key(command.code, command.pressed);
  } else if (command.action === 'export-save') {
    // Only a newly created DOS city, never an arbitrary path or owner asset.
    assert.equal(typeof command.name, 'string');
    assert.match(command.name, /^[A-Z0-9_]{1,8}\.SC2$/);
    handlers.exportSave(command.name);
  } else {
    throw new Error('Expected sample, mouse, key or export-save action');
  }
}

module.exports = { dispatchNativeInput };
