'use strict';
const dgram = require('node:dgram');
const crypto = require('node:crypto');

function infoRequest(challenge) {
  const request = Buffer.alloc(14);
  request.writeUInt16LE(65535, 0);
  request.write('getInfo\0', 2, 'ascii');
  request.writeUInt32LE(challenge >>> 0, 10);
  return request;
}

// Matches the pinned native ProcessGetInfoMessage / WriteDeltaDict(NULL),
// including both dictionary terminators and the MAX_ASYNC_CLIENTS sentinel.
function parseInfo(packet, challenge) {
  let offset = 0;
  const need = count => { if (offset + count > packet.length) throw new Error('Truncated Doom 3 status.'); };
  const byte = () => { need(1); return packet[offset++]; };
  const short = () => { need(2); const value = packet.readUInt16LE(offset); offset += 2; return value; };
  const int = () => { need(4); const value = packet.readUInt32LE(offset); offset += 4; return value; };
  const string = () => {
    const end = packet.indexOf(0, offset);
    if (end < offset || end - offset > 2048) throw new Error('Invalid Doom 3 status string.');
    const value = packet.toString('utf8', offset, end);
    offset = end + 1;
    return value;
  };
  if (packet.length > 16384 || short() !== 65535 || string() !== 'infoResponse') throw new Error('Not Doom 3 status.');
  if (int() !== (challenge >>> 0)) throw new Error('Unsolicited Doom 3 status.');
  const protocol = int();
  if (protocol !== 65578) throw new Error('Managed Doom 3 requires protocol 1.42.');
  const info = Object.create(null);
  for (let count = 0; ; count++) {
    const key = string();
    if (!key) break;
    if (count >= 128 || Object.hasOwn(info, key)) throw new Error('Invalid Doom 3 status dictionary.');
    info[key] = string();
  }
  if (string() !== '') throw new Error('Unexpected Doom 3 dictionary delta.');
  const players = [];
  for (;;) {
    const slot = byte();
    if (slot === 32) break;
    if (slot > 32 || players.some(player => player.slot === slot)) throw new Error('Invalid Doom 3 player slot.');
    players.push({slot, ping: short(), rate: int(), name: string()});
  }
  if (offset !== packet.length) throw new Error('Trailing Doom 3 status bytes.');
  return {protocol: '1.42', map: info.si_map || '', gameType: info.si_gameType || '', name: info.si_name || '', info, players};
}

function queryStatus({port, timeoutMs = 1000}) {
  return new Promise((resolve, reject) => {
    const udp = dgram.createSocket('udp4');
    const challenge = crypto.randomBytes(4).readUInt32LE();
    let completed = false;
    const done = (error, value) => {
      if (completed) return;
      completed = true;
      clearTimeout(timer);
      try { udp.close(); } catch (_) { /* not yet open */ }
      error ? reject(error) : resolve(value);
    };
    const timer = setTimeout(() => done(new Error('Managed Doom 3 status timed out.')), timeoutMs);
    udp.on('error', error => done(error));
    udp.on('message', packet => {
      try { done(null, parseInfo(packet, challenge)); } catch (_) { /* unrelated or malformed packet */ }
    });
    udp.connect(port, '127.0.0.1', () => udp.send(infoRequest(challenge), error => { if (error) done(error); }));
  });
}
module.exports = {infoRequest, parseInfo, queryStatus};
