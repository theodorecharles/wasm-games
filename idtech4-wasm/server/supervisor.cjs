'use strict';
const http = require('node:http');
const path = require('node:path');
const crypto = require('node:crypto');
const {spawn} = require('node:child_process');
const {WebSocketServer} = require('ws');
const {attachManagedDatagramRelay} = require('./managed-datagram-relay.cjs');
const {createManagedRuntime} = require('./runtime.cjs');
const frameworkRoot = path.resolve(process.env.WASM_GAME_FRAMEWORK_ROOT || '/opt/wasm-game-framework');
const siteRoot = path.resolve(process.env.WASM_GAME_SITE_ROOT || '/opt/game-site');
const dataRoot = path.resolve(process.env.WASM_GAME_DATA_ROOT || '/data');
const nativeRoot = path.resolve(process.env.D3_NATIVE_ROOT || '/opt/doom3-native');
const httpPort = Number(process.env.WASM_GAME_HTTP_PORT || 8088);
const staticPort = Number(process.env.D3_STATIC_PORT || 8089);
const gamePort = Number(process.env.D3_GAME_PORT || 27666);
const variant = process.env.WASM_GAME_VARIANT || 'doom3-mp';
const managedMultiplayer = variant === 'doom3-mp' || variant === 'suite';
for (const port of [httpPort, staticPort, gamePort]) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid Doom 3 service port.');
}
if (httpPort === staticPort) throw new Error('Doom 3 public and static ports must differ.');
if (!process.env.WASM_GAME_SESSION_SECRET) process.env.WASM_GAME_SESSION_SECRET = crypto.randomBytes(32).toString('base64url');
const {createPasswordGate} = require(path.join(frameworkRoot, 'server/password-auth.js'));
const gate = createPasswordGate();
let relay;
const runtime = createManagedRuntime({frameworkRoot, siteRoot, dataRoot, nativeRoot, port: gamePort,
  onDisconnect: () => relay?.disconnectAll()});
function json(response, code, value) {
  if (response.destroyed || response.headersSent) return;
  response.writeHead(code, {'content-type': 'application/json', 'cache-control': 'no-store',
    'cross-origin-opener-policy': 'same-origin', 'cross-origin-embedder-policy': 'require-corp',
    'x-content-type-options': 'nosniff'});
  response.end(JSON.stringify(value));
}
const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    if (await gate.handle(request, response, url)) return;
    if (url.pathname === '/health') return json(response, 200, {ok: true, state: runtime.status().state});
    if (url.pathname.startsWith('/api/doom3/')) {
      if (!managedMultiplayer) return json(response, 404, {error: 'Multiplayer is not enabled for this variant.'});
      if (!gate.require(request, response)) return;
      if (url.pathname === '/api/doom3/status' && request.method === 'GET') {
        return json(response, 200, {...runtime.status(), relay: relay.stats()});
      }
      if (url.pathname === '/api/doom3/wake') {
        if (request.method !== 'POST') return json(response, 405, {error: 'POST required.'});
        if (request.headers.origin) {
          const expected = new URL(process.env.D3_PUBLIC_ORIGIN ||
            `${request.socket.encrypted ? 'https:' : 'http:'}//${request.headers.host}`).origin;
          if (new URL(request.headers.origin).origin !== expected) return json(response, 403, {error: 'Wrong request origin.'});
        }
        let bytes = 0;
        for await (const chunk of request) {
          bytes += chunk.length;
          if (bytes > 4096) return json(response, 413, {error: 'Wake request too large.'});
        }
        await runtime.wake();
        return json(response, 200, runtime.status());
      }
      return json(response, 404, {error: 'Unknown managed Doom 3 endpoint.'});
    }
    const proxy = http.request({host: '127.0.0.1', port: staticPort,
      method: request.method, path: request.url, headers: request.headers}, upstream => {
      response.writeHead(upstream.statusCode, upstream.headers);
      upstream.pipe(response);
    });
    proxy.on('error', () => json(response, 502, {error: 'Game site unavailable.'}));
    response.once('close', () => proxy.destroy());
    request.pipe(proxy);
  } catch (error) { json(response, error.statusCode || 500, {error: error.message || String(error)}); }
});
relay = attachManagedDatagramRelay(server, {port: gamePort, WebSocketServer,
  publicOrigin: process.env.D3_PUBLIC_ORIGIN,
  authorize: request => managedMultiplayer && gate.authenticated(request), ensureDedicated: () => runtime.wake(),
  onPeers: count => runtime.observePeers(count)});
const staticServer = spawn(process.execPath, [path.join(frameworkRoot, 'server/static-server.js')], {
  env: {...process.env, WASM_GAME_VARIANT: process.env.WASM_GAME_VARIANT || 'doom3-mp', WASM_GAME_HTTP_PORT: String(staticPort),
    WASM_GAME_SITE_ROOT: siteRoot, WASM_GAME_DATA_ROOT: dataRoot}, stdio: ['ignore', 'inherit', 'inherit']
});
let stopping = false;
async function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  server.close();
  relay.close();
  await runtime.shutdown().catch(error => process.stderr.write(error.message + '\n'));
  staticServer.kill('SIGTERM');
  process.exit(code);
}
staticServer.once('error', () => void shutdown(1));
staticServer.once('exit', () => { if (!stopping) void shutdown(1); });
process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());
server.listen(httpPort, '0.0.0.0', () => console.log(`Doom 3 managed service: tcp/${httpPort}; sleeping until Play.`));
