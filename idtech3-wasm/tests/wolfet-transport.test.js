'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const http = require('node:http');
const dgram = require('node:dgram');
const { WebSocket } = require('ws');
const { attachWsProxy } = require('../games/wolfet/server/ws-proxy');

test('WolfET WebSocket transport bounds frames and cleans up during a pending wake', async t => {
  const udp = dgram.createSocket('udp4');
  const received = [];
  udp.on('message', (data, peer) => { received.push(data); udp.send(data, peer.port, peer.address); });
  await new Promise(resolve => udp.bind(0, '127.0.0.1', resolve));
  t.after(() => udp.close());
  const server = http.createServer();
  const registry = new Map();
  let wakes = 0;
  let resolveWake;
  const wss = attachWsProxy(server, { path: '/wolfet/ws', destPort: udp.address().port, registry,
    ensureDedicated: () => { wakes++; return new Promise(resolve => { resolveWake = resolve; }); } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    for (const client of wss.clients) client.terminate();
    await new Promise(resolve => wss.close(resolve));
    await new Promise(resolve => server.close(resolve));
  });
  async function connect() {
    const ws = new WebSocket(`ws://127.0.0.1:${server.address().port}/wolfet/ws`);
    await once(ws, 'open');
    t.after(() => ws.terminate());
    return ws;
  }
  async function settle(condition) {
    for (let i = 0; i < 100 && !condition(); i++) await new Promise(resolve => setTimeout(resolve, 5));
    assert.ok(condition(), 'transport did not settle');
  }
  let ws = await connect();
  assert.equal(wakes, 0, 'opening a browser socket does not start a match');
  ws.send(Buffer.from([255, 255, 255, 255, 112, 111, 114, 116, 1, 2]));
  await new Promise(resolve => setTimeout(resolve, 15));
  assert.equal(wakes, 0, 'SOCKFS metadata is not a game packet');
  let closed = once(ws, 'close');
  ws.send('not a binary datagram');
  assert.equal((await closed)[0], 1003);
  assert.equal(wakes, 0);
  await settle(() => registry.size === 0);

  ws = await connect();
  closed = once(ws, 'close');
  ws.send(Buffer.alloc(65508));
  assert.equal((await closed)[0], 1009);
  assert.equal(wakes, 0, 'oversized frames cannot wake a native process');
  await settle(() => registry.size === 0);

  ws = await connect();
  ws.send(Buffer.from('closed-before-wake'));
  await settle(() => wakes === 1);
  closed = once(ws, 'close');
  ws.close();
  await closed;
  await settle(() => registry.size === 0);
  resolveWake();
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(received.length, 0, 'late wake must not send into an abandoned UDP socket');

  ws = await connect();
  const response = once(ws, 'message');
  const packet = Buffer.from([255, 255, 255, 255, 103, 101, 116, 115, 116, 97, 116, 117, 115, 10]);
  ws.send(packet);
  await settle(() => wakes === 2);
  resolveWake();
  assert.deepEqual((await response)[0], packet);
  assert.deepEqual(received, [packet]);
  closed = once(ws, 'close');
  ws.close();
  await closed;
  await settle(() => registry.size === 0);
});
