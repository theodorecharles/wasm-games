'use strict';

const assert = require('node:assert/strict');
const { SERVER_ID, encodeServerPacket, decodeClientPacket } = require('./classic-ws-proxy');

const native = Buffer.from([0xde, 0xad, 0xbe, 0xef]);
const inbound = encodeServerPacket(native);
assert.equal(inbound.readUInt32LE(0), SERVER_ID);
assert.deepEqual(inbound.subarray(4), native);

const outbound = Buffer.alloc(8 + native.length);
outbound.writeUInt32LE(SERVER_ID, 0);
outbound.writeUInt32LE(1234, 4);
native.copy(outbound, 8);
assert.deepEqual(decodeClientPacket(outbound), native);
assert.equal(decodeClientPacket(Buffer.alloc(8)), null);
outbound.writeUInt32LE(9, 0);
assert.equal(decodeClientPacket(outbound), null);

console.log('Verified classic Chocolate-compatible WebSocket framing.');
