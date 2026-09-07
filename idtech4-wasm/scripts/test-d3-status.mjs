#!/usr/bin/env node
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const {parseInfo, infoRequest} = require('../server/status.cjs');
const string = value => Buffer.from(value + '\0');
const int = value => { const buffer = Buffer.alloc(4); buffer.writeUInt32LE(value); return buffer; };
const short = value => { const buffer = Buffer.alloc(2); buffer.writeUInt16LE(value); return buffer; };
const challenge = 0x8abc1234;
const packet = Buffer.concat([short(65535), string('infoResponse'), int(challenge), int(65578),
  string('si_map'), string('game/mp/d3dm1'), string('si_gameType'), string('deathmatch'),
  string('si_name'), string('Managed'), string(''), string(''),
  Buffer.from([0]), short(24), int(16000), string('Marine'), Buffer.from([32])]);
const result = parseInfo(packet, challenge);
assert.equal(result.map, 'game/mp/d3dm1');
assert.equal(result.protocol, '1.42');
assert.deepEqual(result.players, [{slot: 0, ping: 24, rate: 16000, name: 'Marine'}]);
assert.deepEqual([...infoRequest(challenge)], [255, 255, 103, 101, 116, 73, 110, 102, 111, 0, 52, 18, 188, 138]);
let rejected = 0;
for (let end = 0; end < packet.length; end++) {
  assert.throws(() => parseInfo(packet.subarray(0, end), challenge)); rejected++;
}
assert.throws(() => parseInfo(packet, challenge - 1));
assert.throws(() => parseInfo(Buffer.concat([packet, Buffer.from([0])]), challenge));
const wrongProtocol = Buffer.from(packet);
wrongProtocol.writeUInt32LE(1, 19);
assert.throws(() => parseInfo(wrongProtocol, challenge));
const wrongSlot = Buffer.from(packet);
wrongSlot[wrongSlot.length - 1] = 33;
assert.throws(() => parseInfo(wrongSlot, challenge));
console.log(`Doom 3 status: valid 1.42 roster/request, ${rejected} truncations and 4 invalid response cases passed.`);
