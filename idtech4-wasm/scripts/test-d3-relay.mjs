#!/usr/bin/env node
import assert from 'node:assert/strict';
import dgram from 'node:dgram';
import http from 'node:http';
import fs from 'node:fs';
import vm from 'node:vm';
import {once} from 'node:events';
import {createRequire} from 'node:module';
const require = createRequire(new URL('../server/package.json', import.meta.url));
const {WebSocket, WebSocketServer} = require('ws');
const {attachManagedDatagramRelay} = require('./managed-datagram-relay.cjs');

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate, label) {
  const end = Date.now() + 3000;
  while (Date.now() < end) { if (predicate()) return; await pause(5); }
  throw new Error(`Timed out: ${label}`);
}
let cases = 0;
const check = (actual, expected, label) => { assert.deepEqual(actual, expected, label); cases++; };
const udp = dgram.createSocket('udp4');
udp.bind(0, '127.0.0.1');
await once(udp, 'listening');
const packets = [];
udp.on('message', (packet, remote) => {
  packets.push({data: [...packet], remote});
  udp.send(packet, remote.port, remote.address);
});
const server = http.createServer((_, response) => { response.writeHead(404).end(); });
let wakeCalls = 0;
let releaseWake;
let wake = new Promise(resolve => { releaseWake = resolve; });
const relay = attachManagedDatagramRelay(server, {port: udp.address().port, WebSocketServer,
  authorize: request => request.headers.cookie === 'fixture=authorized',
  ensureDedicated: () => { wakeCalls++; return wake; }});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const origin = `http://127.0.0.1:${server.address().port}`;
const endpoint = origin.replace('http:', 'ws:') + '/api/doom3/socket';
const clients = [];
const connect = (headers = {}) => {
  const socket = new WebSocket(endpoint, {headers: {origin, cookie: 'fixture=authorized', ...headers}});
  clients.push(socket);
  socket.on('error', () => {});
  return socket;
};
try {
  for (const headers of [{cookie: ''}, {origin: 'http://untrusted.test'}, {origin: ''},
    {origin: origin.replace('http:', 'https:')}]) {
    const denied = connect(headers);
    const [, response] = await once(denied, 'unexpected-response');
    check(response.statusCode, 403, 'unauthorized/cross-origin denied before wake');
    denied.terminate();
  }
  check(wakeCalls, 0, 'denied requests never wake server');
  const first = connect();
  await once(first, 'open');
  const reply = once(first, 'message');
  first.send(new Uint8Array([255, 0, 3, 4]));
  await pause(20);
  check(packets.length, 0, 'datagram waits for actual readiness');
  releaseWake();
  const [echo, binary] = await reply;
  check([...echo], [255, 0, 3, 4], 'binary UDP round trip intact');
  check(binary, true, 'binary WebSocket response');
  const second = connect();
  await once(second, 'open');
  const secondReply = once(second, 'message');
  second.send(new Uint8Array([6, 7]));
  await secondReply;
  check(packets[0].remote.address !== packets[1].remote.address, true, 'clients have distinct loopback identities');
  check(relay.stats(), {peers: 2, clientPackets: 2, serverPackets: 2}, 'relay counts actual native datagrams');
  const rogue = dgram.createSocket('udp4');
  let unsolicited = 0;
  const observe = () => unsolicited++;
  first.on('message', observe);
  await new Promise(resolve => rogue.send(Buffer.from([99]), packets[0].remote.port, packets[0].remote.address, resolve));
  await pause(25);
  rogue.close();
  first.off('message', observe);
  check(unsolicited, 0, 'other UDP senders cannot inject replies');
  const closedText = once(second, 'close');
  second.send('not a binary packet');
  check((await closedText)[0], 1003, 'text payload rejected');

  // Exercise the actual browser transport against real WebSocket/UDP I/O.
  const context = vm.createContext({URL, ArrayBuffer, Uint8Array});
  vm.runInContext(fs.readFileSync(new URL('../site/d3-managed-network.js', import.meta.url), 'utf8'), context);
  const network = context.createD3ManagedNetwork({pageUrl: origin,
    WebSocket: class extends WebSocket {
      constructor(url) { super(url, {headers: {origin, cookie: 'fixture=authorized'}}); clients.push(this); }
    }});
  const handle = network.open();
  await until(() => clients.at(-1).readyState === 1, 'production transport open');
  check(network.send(handle, new Uint8Array([0, 254, 128, 9])), true, 'production transport sends');
  const buffer = new Uint8Array(8);
  let size = 0;
  await until(() => (size = network.receive(handle, buffer)) > 0, 'production transport receives');
  check([...buffer.slice(0, size)], [0, 254, 128, 9], 'production transport / real UDP round trip');
  network.close(handle);
  await until(() => relay.stats().peers === 1, 'closed clients cleaned');

  wake = Promise.reject(new Error('fixture startup failed'));
  wake.catch(() => {});
  const failed = connect();
  check((await once(failed, 'close'))[0], 1013, 'failed server wake closes connection');

  wake = new Promise(() => {});
  const flooding = connect();
  await once(flooding, 'open');
  const overflow = once(flooding, 'close');
  for (let index = 0; index < 129; index++) flooding.send(Buffer.from([1]));
  check((await overflow)[0], 1013, 'pre-wake queue bounded');
  await until(() => relay.stats().peers === 1, 'failure cleanup');
  first.close();
  await once(first, 'close');
  await until(() => relay.stats().peers === 0, 'all clients cleaned');
  check(relay.stats().clientPackets, 3, 'invalid and pre-wake traffic never reached UDP');
  const proof = {scope: 'Real local WebSocket/UDP relay and production worker transport. Echo peer is not a Doom 3 dedicated server. Authorization, origin, readiness, binary integrity, isolation, queue bounds and cleanup tested.', cases, passed: true};
  if (process.env.D3_RELAY_PROOF) fs.writeFileSync(process.env.D3_RELAY_PROOF, JSON.stringify(proof, null, 2) + '\n');
  console.log(JSON.stringify(proof, null, 2));
} finally {
  for (const client of clients) client.terminate();
  relay.close();
  await new Promise(resolve => server.close(resolve));
  udp.close();
}
