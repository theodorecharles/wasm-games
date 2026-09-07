'use strict';
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { patchClientTransport, original, replacement } = require('../games/quake3/scripts/public-websocket');

assert.equal(patchClientTransport(`before\n${original}\nafter`), `before\n${replacement}\nafter`);
assert.throws(() => patchClientTransport('unrecognized'), /seam changed/);
assert.throws(() => patchClientTransport(`${original}\n${original}`), /seam changed/);
assert.throws(() => patchClientTransport(replacement), /already patched/);
for (const [node, configured, expected] of [
  [false, 'wss://games.test/quake3/ws', 'wss://games.test/quake3/ws'],
  [false, 'ws://localhost:8097/quake3/ws', 'ws://localhost:8097/quake3/ws'],
  [false, undefined, 'ws://127.0.0.1:27960'],
  [true, 'wss://games.test/quake3/ws', 'ws://127.0.0.1:27960']
]) {
  const context = { ENVIRONMENT_IS_NODE: node, Module: { wasmGameWebSocketUrl: configured }, addr: '127.0.0.1', port: 27960 };
  vm.runInNewContext(replacement, context);
  assert.equal(context.url, expected);
}
console.log('Quake III configured browser WS/WSS path and untouched native fallback pass.');
