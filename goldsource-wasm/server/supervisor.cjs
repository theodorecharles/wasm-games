'use strict';
const http = require('node:http');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { WebSocket, WebSocketServer } = require('ws');

function createGateway({ frameworkRoot, staticPort, variant, bridge, publicOrigin, environment = process.env }) {
  const { createPasswordGate } = require(path.join(frameworkRoot, 'server/password-auth.js'));
  const gate = createPasswordGate({ environment });
  const peers = new Set();
  const pending = new Set();
  const websocket = new WebSocketServer({ noServer: true, maxPayload: 65536, perMessageDeflate: false });
  const multiplayer = ['suite', 'counter-strike'].includes(variant) && Boolean(bridge);
  let closing = false;
  function json(response, code, value) {
    if (response.destroyed || response.headersSent) return;
    response.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store',
      'cross-origin-opener-policy': 'same-origin', 'cross-origin-embedder-policy': 'require-corp',
      'x-content-type-options': 'nosniff' });
    response.end(JSON.stringify(value));
  }
  function reject(socket, status) {
    socket.end(`HTTP/1.1 ${status} Rejected\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  }
  function sameOrigin(request) {
    if (!request.headers.origin) return true; // Non-browser clients; browsers always send Origin.
    try {
      const origin = new URL(request.headers.origin);
      const expected = publicOrigin || `${request.socket.encrypted ? 'https:' : 'http:'}//${request.headers.host}`;
      return ['http:', 'https:'].includes(origin.protocol) && origin.origin === expected;
    } catch { return false; }
  }
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      if (await gate.handle(request, response, url)) return;
      if (url.pathname === '/api/goldsource/status') {
        if (!gate.require(request, response)) return;
        if (request.method !== 'GET') return json(response, 405, { error: 'GET required.' });
        return json(response, 200, { variant, multiplayer, signalingPeers: peers.size, pendingPeers: pending.size,
          // The existing dedicated match stays online; this is not an idle native supervisor.
          hostLifecycle: multiplayer ? 'external-always-on' : 'none' });
      }
      // Never expose the companion's administration, console, configuration or filesystem.
      if (/^\/(?:websocket|v1|admin)(?:\/|$)/.test(url.pathname)) {
        return json(response, url.pathname === '/websocket' && multiplayer ? 426 : 404, { error: 'Not available.' });
      }
      const upstream = http.request({ host: '127.0.0.1', port: staticPort, method: request.method,
        path: request.url, headers: request.headers }, incoming => {
        response.writeHead(incoming.statusCode, incoming.headers); incoming.pipe(response);
      });
      upstream.on('error', () => json(response, 502, { error: 'Game site unavailable.' }));
      response.once('close', () => upstream.destroy());
      request.pipe(upstream);
    } catch { json(response, 400, { error: 'Invalid request.' }); }
  });
  server.on('upgrade', async (request, socket, head) => {
    let admitted = false;
    socket.on('error', () => {});
    try {
      const url = new URL(request.url, 'http://localhost');
      if (url.pathname !== '/websocket' || url.search) return reject(socket, 404);
      if (!multiplayer || !gate.authenticated(request) || !sameOrigin(request)) return reject(socket, 403);
      if (request.method !== 'GET' || request.headers['sec-websocket-version'] !== '13' ||
        !/^[A-Za-z0-9+/]{22}==$/.test(request.headers['sec-websocket-key'] || '')) return reject(socket, 400);
      if (closing || peers.size + pending.size >= 16) return reject(socket, 503);
      pending.add(socket); admitted = true;
      // Verify mounted owner data before opening any companion connection.
      const ready = await fetch(`http://127.0.0.1:${staticPort}/game-data/status?variant=counter-strike`, {
        headers: { cookie: request.headers.cookie || '' }, signal: AbortSignal.timeout(10000)
      });
      if (socket.destroyed || closing) return;
      if (!ready.ok || !(await ready.json()).ready) return reject(socket, 409);
      websocket.handleUpgrade(request, socket, head, client => {
        pending.delete(socket);
        const upstream = new WebSocket(bridge, { maxPayload: 65536, perMessageDeflate: false,
          handshakeTimeout: 10000, followRedirects: false });
        const pair = { client, upstream };
        peers.add(pair);
        let ended = false;
        let received = 0, windowStart = Date.now();
        const heartbeat = setInterval(() => {
          if (!pair.alive) return close();
          pair.alive = false; client.ping();
        }, 30000);
        pair.alive = true;
        function close() {
          if (ended) return;
          ended = true; clearInterval(heartbeat); peers.delete(pair);
          client.terminate(); upstream.terminate();
        }
        client.on('pong', () => { pair.alive = true; });
        for (const channel of [client, upstream]) { channel.on('close', close); channel.on('error', close); }
        client.on('message', (data, binary) => {
          if (Date.now() - windowStart > 10000) { windowStart = Date.now(); received = 0; }
          if (binary || ++received > 128 || upstream.readyState !== WebSocket.OPEN || upstream.bufferedAmount > 1048576) return close();
          // Clients may answer an offer or provide ICE, not send native/admin commands.
          try {
            const value = JSON.parse(data.toString());
            if (!Array.isArray(value) || value.length !== 2 || !['v1:answer', 'v1:candidate'].includes(value[0]) ||
              !value[1] || typeof value[1] !== 'object' || Array.isArray(value[1])) return close();
          } catch { return close(); }
          upstream.send(data, { binary: false });
        });
        upstream.on('message', (data, binary) => {
          if (binary || client.readyState !== WebSocket.OPEN || client.bufferedAmount > 1048576) return close();
          client.send(data, { binary: false });
        });
      });
    } catch { if (!socket.destroyed) reject(socket, 502); }
    finally { if (admitted) pending.delete(socket); }
  });
  return { server, close() {
    closing = true;
    for (const socket of pending) socket.destroy();
    pending.clear();
    for (const { client, upstream } of peers) { client.terminate(); upstream.terminate(); }
    websocket.close(); server.close(); server.closeAllConnections();
  } };
}

if (require.main === module) {
  const frameworkRoot = path.resolve(process.env.WASM_GAME_FRAMEWORK_ROOT || '/opt/wasm-game-framework');
  const staticPort = Number(process.env.GOLDSOURCE_STATIC_PORT || 8089);
  const port = Number(process.env.WASM_GAME_HTTP_PORT || 8088);
  const variant = process.env.WASM_GAME_VARIANT || 'suite';
  if (![port, staticPort].every(n => Number.isInteger(n) && n > 0 && n < 65536) || port === staticPort) throw Error('Invalid service ports.');
  if (!['suite', 'half-life', 'blue-shift', 'opposing-force', 'counter-strike'].includes(variant)) throw Error('Invalid game variant.');
  const bridge = process.env.GOLDSOURCE_BRIDGE_URL || '';
  if (bridge) {
    const url = new URL(bridge);
    if (url.protocol !== 'ws:' || url.pathname !== '/websocket' || url.username || url.password || url.search || url.hash) throw Error('Invalid internal bridge URL.');
  }
  const publicOrigin = process.env.GOLDSOURCE_PUBLIC_ORIGIN;
  if (publicOrigin && (!['http:', 'https:'].includes(new URL(publicOrigin).protocol) || new URL(publicOrigin).origin !== publicOrigin)) throw Error('Invalid public origin.');
  if (!process.env.WASM_GAME_SESSION_SECRET) process.env.WASM_GAME_SESSION_SECRET = crypto.randomBytes(32).toString('base64url');
  const gateway = createGateway({ frameworkRoot, staticPort, variant, bridge, publicOrigin });
  const child = spawn(process.execPath, [path.join(frameworkRoot, 'server/static-server.js')], {
    env: { ...process.env, WASM_GAME_HTTP_PORT: String(staticPort) }, stdio: ['ignore', 'inherit', 'inherit']
  });
  let stopping = false;
  function stop(code) {
    if (stopping) return;
    stopping = true; gateway.close(); child.kill('SIGTERM');
    const deadline = setTimeout(() => { child.kill('SIGKILL'); process.exit(code); }, 3000);
    child.once('exit', () => { clearTimeout(deadline); process.exit(code); });
    if (child.exitCode !== null) { clearTimeout(deadline); process.exit(code); }
  }
  child.once('error', () => stop(1)); child.once('exit', () => { if (!stopping) stop(1); });
  process.once('SIGTERM', () => stop(0)); process.once('SIGINT', () => stop(0));
  gateway.server.on('error', () => stop(1));
  gateway.server.listen(port, '0.0.0.0', () => console.log(`GoldSrc gateway: ${variant} on tcp/${port}.`));
}
module.exports = { createGateway };
