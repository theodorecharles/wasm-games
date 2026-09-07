'use strict';
const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const crypto = require('node:crypto');
const path = require('node:path');
const { WebSocket, WebSocketServer } = require('ws');
const { createGateway } = require('../server/supervisor.cjs');
const frameworkRoot = process.env.WASM_FRAMEWORK_DIR || '/home/ted/Development/wasm-game-framework';
const { createPasswordGate } = require(path.join(frameworkRoot, 'server/password-auth.js'));
let cases = 0;
async function fixture({ variant = 'counter-strike', password = '', publicOrigin } = {}) {
  let ready = true, connections = 0;
  const environment = { WASM_GAME_PASSWORD: password, WASM_GAME_BASE_PATH: '/counter-strike/',
    WASM_GAME_SESSION_SECRET: crypto.randomBytes(32).toString('base64url') };
  const gate = createPasswordGate({ environment });
  const site = http.createServer(async (req, res) => {
    if (await gate.handle(req, res, new URL(req.url, 'http://localhost'))) return;
    res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ready }));
  });
  site.listen(0, '127.0.0.1'); await once(site, 'listening');
  const host = new WebSocketServer({ port: 0, host: '127.0.0.1' }); await once(host, 'listening');
  host.on('connection', socket => {
    connections++; socket.on('error', () => {});
    socket.send(JSON.stringify(['v1:offer', { type: 'offer', sdp: 'fixture' }]));
    socket.on('message', data => socket.send(data.toString()));
  });
  const gateway = createGateway({ frameworkRoot, staticPort: site.address().port, variant,
    bridge: `ws://127.0.0.1:${host.address().port}/websocket`, environment, publicOrigin });
  gateway.server.listen(0, '127.0.0.1'); await once(gateway.server, 'listening');
  const origin = `http://127.0.0.1:${gateway.server.address().port}`;
  const open = (resource = '/websocket', headers = {}) => new WebSocket(origin.replace('http:', 'ws:') + resource,
    { headers: { origin: publicOrigin || origin, ...headers } });
  const status = async headers => (await fetch(origin + '/api/goldsource/status', { headers })).json();
  async function denied(resource, headers, expected) {
    const socket = open(resource, headers); socket.on('error', () => {});
    await new Promise((resolve, reject) => {
      socket.once('unexpected-response', (_req, response) => {
        try { assert.equal(response.statusCode, expected); response.resume(); socket.terminate(); resolve(); } catch (e) { reject(e); }
      });
      socket.once('open', () => reject(Error('Unexpected admission')));
    }); cases++;
  }
  async function close() {
    gateway.close(); for (const socket of host.clients) socket.terminate();
    host.close(); site.close(); site.closeAllConnections();
  }
  return { open, denied, status, close, origin, setReady: value => { ready = value; }, connections: () => connections };
}
async function waitFor(test) {
  for (let i = 0; i < 100; i++) { if (await test()) return; await new Promise(resolve => setTimeout(resolve, 10)); }
  throw Error('Cleanup did not complete.');
}
(async () => {
  for (const variant of ['half-life', 'blue-shift', 'opposing-force']) {
    const f = await fixture({ variant }); try {
      await f.denied('/websocket', {}, 403); assert.equal(f.connections(), 0);
      assert.equal((await f.status()).multiplayer, false);
    } finally { await f.close(); }
  }
  const f = await fixture(); try {
    for (const route of ['/websocket/logs', '/admin', '/v1/config', '/v1/rcon', '/websocket?game=half-life', '/nope']) await f.denied(route, {}, 404);
    for (const origin of ['null', 'https://foreign.test', f.origin.replace('http:', 'https:'), f.origin + '.evil']) await f.denied('/websocket', { origin }, 403);
    assert.equal(f.connections(), 0);
    f.setReady(false); await f.denied('/websocket', {}, 409); assert.equal(f.connections(), 0); f.setReady(true);
    for (const route of ['/admin', '/v1/config', '/v1/auth', '/v1/rcon', '/websocket/logs']) {
      assert.equal((await fetch(f.origin + route)).status, 404); cases++;
    }
    for (const value of [JSON.stringify(['v1:rcon', { command: 'quit' }]), 'not-json', Buffer.alloc(65537), Buffer.from('binary')]) {
      const socket = f.open(); socket.on('error', () => {});
      await once(socket, 'message');
      const closed = once(socket, 'close'); socket.send(value); await closed;
      await waitFor(async () => (await f.status()).signalingPeers === 0); cases++;
    }
    const socket = f.open(); socket.on('error', () => {});
    assert.equal(JSON.parse((await once(socket, 'message'))[0])[0], 'v1:offer');
    const echoed = once(socket, 'message'); socket.send(JSON.stringify(['v1:answer', { type: 'answer', sdp: 'fixture' }]));
    assert.equal(JSON.parse((await echoed)[0])[0], 'v1:answer');
    socket.close(); await once(socket, 'close'); await waitFor(async () => (await f.status()).signalingPeers === 0); cases++;
  } finally { await f.close(); }
  const protectedGame = await fixture({ password: 'fixture-only-password', publicOrigin: 'https://games.test' }); try {
    await protectedGame.denied('/websocket', {}, 403);
    const response = await fetch(protectedGame.origin + '/auth/login', { method: 'POST',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'fixture-only-password' }) });
    assert.equal(response.status, 200);
    const cookie = response.headers.get('set-cookie').split(';')[0];
    const socket = protectedGame.open('/websocket', { cookie }); socket.on('error', () => {});
    assert.equal(JSON.parse((await once(socket, 'message'))[0])[0], 'v1:offer'); socket.close(); await once(socket, 'close'); cases++;
  } finally { await protectedGame.close(); }
  console.log(`GoldSrc signaling gateway: ${cases} routing/origin/auth/data/payload/cleanup checks passed.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
