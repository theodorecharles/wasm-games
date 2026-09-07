#!/usr/bin/env node
// Test the diagnostic transport's real loopback sockets, not browser networking.
import assert from 'node:assert/strict';
import dgram from 'node:dgram';
import { once } from 'node:events';
import { classicUdpWebSocket } from './helpers/classic-udp-websocket.mjs';

for (const port of [0, -1, 65536, NaN, 1.5])
  assert.throws(() => classicUdpWebSocket(port));
const relay = dgram.createSocket('udp4');
const stranger = dgram.createSocket('udp4');
const timeout = setTimeout(() => { throw new Error('Diagnostic UDP test timed out'); }, 3000);
let transport;
try {
  relay.bind(0, '127.0.0.1');
  stranger.bind(0, '127.0.0.1');
  await Promise.all([once(relay, 'listening'), once(stranger, 'listening')]);
  transport = classicUdpWebSocket(relay.address().port);
  const socket = new transport.WebSocket();
  await new Promise(resolve => { socket.onopen = resolve; });
  const request = Buffer.from('ordinary native payload');
  const framed = Buffer.alloc(request.length + 8);
  framed.writeUInt32LE(1, 0);
  request.copy(framed, 8);
  assert.throws(() => socket.send(Buffer.alloc(4)));
  const received = once(relay, 'message');
  socket.send(framed);
  const [packet, from] = await received;
  assert.deepEqual(packet, request);
  assert.equal(from.address, '127.0.0.1');
  let messages = 0;
  socket.onmessage = () => { messages++; };
  stranger.send(Buffer.from('wrong sender'), from.port, from.address);
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.equal(messages, 0, 'unrelated UDP endpoints must be ignored');
  const response = Buffer.from('native server response');
  const reply = new Promise(resolve => { socket.onmessage = resolve; });
  relay.send(response, from.port, from.address);
  const event = await reply;
  const returned = Buffer.from(event.data);
  assert.equal(returned.readUInt32LE(0), 1);
  assert.deepEqual(returned.subarray(4), response);
  let closed = 0;
  socket.onclose = () => { closed++; };
  transport.close();
  transport.close();
  assert.equal(socket.readyState, 3);
  assert.equal(closed, 1);
  assert.throws(() => socket.send(framed));
  console.log('Diagnostic UDP framing, endpoint isolation and cleanup passed.');
} finally {
  clearTimeout(timeout);
  transport?.close();
  relay.close();
  stranger.close();
}
