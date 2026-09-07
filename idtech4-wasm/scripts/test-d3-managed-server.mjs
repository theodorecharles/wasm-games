#!/usr/bin/env node
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {once} from 'node:events';
import {createRequire} from 'node:module';
const require = createRequire(new URL('../server/package.json', import.meta.url));
const {WebSocket, WebSocketServer} = require('ws');
const {attachManagedDatagramRelay} = require('./managed-datagram-relay.cjs');
const {queryStatus, infoRequest, parseInfo} = require('./status.cjs');
const port = Number(process.argv[2]);
assert.ok(Number.isInteger(port) && port > 0 && port < 65536, 'provide the isolated native server UDP port');
const direct = await queryStatus({port});
assert.equal(direct.map, 'game/mp/d3dm1');
assert.equal(direct.gameType.toLowerCase(), 'deathmatch');
const server = http.createServer((_, response) => response.writeHead(404).end());
const relay = attachManagedDatagramRelay(server, {port, WebSocketServer,
  authorize: request => request.headers.cookie === 'fixture=native-proof',
  ensureDedicated: () => queryStatus({port})});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const origin = `http://127.0.0.1:${server.address().port}`;
const context = vm.createContext({URL, ArrayBuffer, Uint8Array});
vm.runInContext(fs.readFileSync(new URL('../site/d3-managed-network.js', import.meta.url), 'utf8'), context);
const sockets = [];
const errors = [];
const network = context.createD3ManagedNetwork({pageUrl: origin, onError: error => errors.push(error),
  WebSocket: class extends WebSocket {
    constructor(url) { super(url, {headers: {origin, cookie: 'fixture=native-proof'}}); sockets.push(this); }
  }});
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const until = async (predicate, label) => {
  const end = Date.now() + 3000;
  while (Date.now() < end) { if (predicate()) return; await pause(5); }
  throw new Error(`Timed out: ${label}`);
};
const handle = network.open();
try {
  await until(() => sockets[0].readyState === 1, 'WebSocket opened');
  const nonce = crypto.randomBytes(4).readUInt32LE();
  assert.equal(network.send(handle, infoRequest(nonce)), true);
  const target = new Uint8Array(16384);
  let size;
  await until(() => (size = network.receive(handle, target)) > 0, 'native info response');
  const relayed = parseInfo(Buffer.from(target.slice(0, size)), nonce);
  assert.equal(relayed.map, direct.map);
  assert.equal(relayed.protocol, direct.protocol);
  const request = Buffer.alloc(16);
  request.writeUInt16LE(65535);
  request.write('challenge\0', 2, 'ascii');
  request.writeUInt32LE(54321, 12);
  assert.equal(network.send(handle, request), true);
  await until(() => (size = network.receive(handle, target)) > 0, 'native challenge response');
  const reply = Buffer.from(target.slice(0, size));
  assert.equal(reply.readUInt16LE(), 65535);
  const end = reply.indexOf(0, 2);
  assert.equal(reply.toString('ascii', 2, end), 'challengeResponse');
  assert.ok(reply.length >= end + 9, 'native challenge/id/game fields present');
  const challenge = reply.readUInt32LE(end + 1);
  const serverId = reply.readUInt16LE(end + 5);
  assert.deepEqual([...reply.subarray(end + 7)], [0, 0], 'base game, no missing mod');
  assert.deepEqual(errors, []);
  const hash = relative => crypto.createHash('sha256').update(fs.readFileSync(new URL(relative, import.meta.url))).digest('hex');
  const proof = {scope: 'Production worker transport and authenticated same-origin relay exchange native info/challenge packets with an isolated real dhewm3 dedicated server. This does not perform native client connect, snapshot/usercmd gameplay, browser rendering or bots.',
    sourceCommit: '31e877e7e4e691ed9f98603da9cd95ac59540cf3',
    serverSHA256: hash('../.work/d3-managed-native/dhewm3ded'),
    gameSHA256: hash('../.work/d3-managed-native/base.so'),
    status: relayed, challengeResponse: {challenge, serverId, baseGame: true}, relay: relay.stats(), passed: true};
  if (process.env.D3_MANAGED_SERVER_PROOF) fs.writeFileSync(process.env.D3_MANAGED_SERVER_PROOF, JSON.stringify(proof, null, 2) + '\n');
  console.log(JSON.stringify(proof, null, 2));
} finally {
  network.close(handle);
  for (const socket of sockets) socket.terminate();
  relay.close();
  await new Promise(resolve => server.close(resolve));
}
