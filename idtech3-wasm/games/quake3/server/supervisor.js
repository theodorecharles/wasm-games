#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { ensureSessionSecret, passwordProtectedPath, rejectWebSocket } = require('./access');
const { IdleServiceSupervisor, environmentOptions } = require('/opt/q3-framework/lifecycle.js');
const { createPasswordGate } = require('/opt/wasm-game-framework/server/password-auth.js');
const { createProvisioningStore } = require('/opt/wasm-game-framework/server/provisioning.js');

ensureSessionSecret(process.env);
const passwordGate = createPasswordGate();

const PUBLIC_PORT = Number(process.env.WASM_GAME_HTTP_PORT || 8088);
const STATIC_PORT = Number(process.env.Q3_STATIC_PORT || 8089);
const GAME_PORT = Number(process.env.Q3_GAME_PORT || 27960);
const RUNTIME_ROOT = '/opt/q3-runtime-root';
const GAME_HOME = path.join(RUNTIME_ROOT, 'runtime');
const BASEQ3 = path.join(GAME_HOME, 'baseq3');
const MAPS = String(process.env.MAP_ROTATION || 'q3dm6,q3dm7,q3dm11,q3dm17')
  .split(',').map(value => value.trim()).filter(value => /^q3(?:dm|tourney)\d+$/i.test(value));
const PLAYER_TARGET = 8;
const MAX_CLIENTS = 9;
const clients = new Set();
const botClients = new Set();
const ownerData = createProvisioningStore({
  dataRoot: '/data',
  manifest: JSON.parse(fs.readFileSync('/opt/game-site/wasm-game-data.json', 'utf8')),
  validatorRoot: '/opt/game-site'
});

function json(response, status, value) {
  const body = Buffer.from(JSON.stringify(value));
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': body.length,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'cross-origin-opener-policy': 'same-origin',
    'cross-origin-embedder-policy': 'require-corp'
  });
  response.end(body);
}

async function requireOwnerData() {
  const status = await ownerData.status();
  if (!status.ready) {
    const error = new Error('The complete validated Quake III PAK set is required before the arena can start.');
    error.statusCode = 409;
    throw error;
  }
}

async function prepareRuntime() {
  await fsp.mkdir(BASEQ3, { recursive: true });
  for (let index = 0; index <= 8; index += 1) {
    const name = `pak${index}.pk3`;
    const source = path.join('/data', name);
    const target = path.join(BASEQ3, name);
    await fsp.access(source, fs.constants.R_OK);
    const sourceStat = await fsp.stat(source);
    const targetStat = await fsp.stat(target).catch(() => null);
    // NODEFS exposes host symlinks as virtual symlinks, so an absolute /data
    // target would escape its virtual mount. Keep an ephemeral, byte-exact
    // runtime copy while /data remains the validated source of truth.
    if (!targetStat || targetStat.size !== sourceStat.size || !targetStat.isFile()) {
      await fsp.copyFile(source, target);
      await fsp.chmod(target, 0o444);
    }
  }
  await fsp.mkdir(path.join(BASEQ3, 'vm'), { recursive: true });
  await fsp.copyFile('/opt/q3-server/qagame.qvm', path.join(BASEQ3, 'vm/qagame.qvm'));
  await fsp.copyFile('/opt/q3-server/server.cfg', path.join(BASEQ3, 'server.cfg'));
}

function parseOutput(handle, chunk) {
  handle.lineBuffer += String(chunk);
  const lines = handle.lineBuffer.split(/\r?\n/);
  handle.lineBuffer = lines.pop() || '';
  for (const line of lines) {
    process.stdout.write(`[ioq3ded] ${line}\n`);
    let match = /WASM_HUMAN_JOINED:\s*(\d+)/.exec(line);
    if (match) clients.add(Number(match[1]));
    match = /WASM_HUMAN_LEFT:\s*(\d+)/.exec(line);
    if (match) clients.delete(Number(match[1]));
    match = /WASM_BOT_JOINED:\s*(\d+)/.exec(line);
    if (match) botClients.add(Number(match[1]));
    match = /WASM_BOT_LEFT:\s*(\d+)/.exec(line);
    if (match) botClients.delete(Number(match[1]));
    lifecycle.observeHumans(clients.size);
  }
}

async function startDedicated({ map }) {
  await requireOwnerData();
  await prepareRuntime();
  clients.clear();
  botClients.clear();
  const args = [
    '/opt/quakejs/ioq3ded.js',
    '+set', 'fs_homepath', 'runtime', '+set', 'fs_basepath', 'runtime', '+set', 'fs_game', 'baseq3',
    '+set', 'dedicated', '2',
    '+set', 'net_port', String(GAME_PORT), '+set', 'sv_maxclients', String(MAX_CLIENTS),
    '+set', 'sv_pure', '0', '+set', 'bot_enable', '1', '+set', 'bot_minplayers', String(PLAYER_TARGET),
    '+set', 'g_gametype', '0', '+exec', 'server.cfg', '+map', map || MAPS[0]
  ];
  const child = spawn(process.execPath, args, {
    cwd: RUNTIME_ROOT,
    env: { ...process.env, NODE_PATH: '/opt/q3-server/node_modules' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const handle = { child, lineBuffer: '' };
  child.stdout.on('data', chunk => parseOutput(handle, chunk));
  child.stderr.on('data', chunk => parseOutput(handle, chunk));
  child.once('exit', (code, signal) => {
    process.stdout.write(`ioq3ded exited code=${code} signal=${signal || 'none'}\n`);
    clients.clear();
    botClients.clear();
    lifecycle.observeHumans(0);
  });
  return handle;
}

function portReady(handle) {
  return new Promise((resolve, reject) => {
    if (handle.child.exitCode !== null) return reject(new Error(`ioq3ded exited with ${handle.child.exitCode}.`));
    const socket = net.connect({ host: '127.0.0.1', port: GAME_PORT });
    socket.setTimeout(300);
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('timeout', () => { socket.destroy(); resolve(false); });
    socket.once('error', () => resolve(false));
  });
}

async function waitUntilReady(handle) {
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    if (await portReady(handle)) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('ioq3ded did not open its WebSocket port in time.');
}

async function stopDedicated(handle) {
  if (handle.child.exitCode !== null) return;
  await new Promise(resolve => {
    const timer = setTimeout(() => handle.child.kill('SIGKILL'), 5000);
    handle.child.once('exit', () => { clearTimeout(timer); resolve(); });
    handle.child.kill('SIGTERM');
  });
}

const lifecycleOptions = environmentOptions(process.env);
const lifecycle = new IdleServiceSupervisor({
  ...lifecycleOptions,
  maps: MAPS.length ? MAPS : ['q3dm6'],
  start: startDedicated,
  waitUntilReady,
  stop: stopDedicated,
  onStatus: status => process.stdout.write(`arena state=${status.state} humans=${status.humans} map=${status.map || '-'}\n`)
});

const staticServer = spawn(process.execPath, ['/opt/wasm-game-framework/server/static-server.js'], {
  env: { ...process.env, WASM_GAME_HTTP_PORT: String(STATIC_PORT) }, stdio: ['ignore', 'inherit', 'inherit']
});

function publicStatus() {
  const status = lifecycle.status();
  return {
    ...status,
    playerTarget: PLAYER_TARGET,
    maxClients: MAX_CLIENTS,
    bots: botClients.size,
    estimatedBots: Math.max(0, PLAYER_TARGET - status.humans),
    botPolicy: 'bot_minplayers 8; one bot yields per fully connected human',
    rotation: MAPS
  };
}

function proxyHttp(request, response) {
  const proxy = http.request({
    host: '127.0.0.1', port: STATIC_PORT, method: request.method, path: request.url, headers: request.headers
  }, upstream => {
    response.writeHead(upstream.statusCode, upstream.headers);
    upstream.pipe(response);
  });
  proxy.on('error', error => json(response, 502, { error: error.message }));
  request.pipe(proxy);
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    if (await passwordGate.handle(request, response, url)) return;
    if (passwordProtectedPath(url.pathname) && !passwordGate.require(request, response)) return;
    if (url.pathname === '/status' && request.method === 'GET') return json(response, 200, publicStatus());
    if (url.pathname === '/wake' && request.method === 'POST') {
      let bytes = 0;
      request.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > 4096) request.destroy(new Error('Wake metadata is too large.'));
      });
      await new Promise((resolve, reject) => { request.on('end', resolve); request.on('error', reject); });
      await lifecycle.wake();
      return json(response, 200, publicStatus());
    }
    if (url.pathname === '/wake') return json(response, 405, { error: 'Method not allowed.' });
    proxyHttp(request, response);
  } catch (error) {
    json(response, error.statusCode || 500, { error: error.message || String(error) });
  }
});

server.on('upgrade', (request, socket, head) => {
  if (!passwordGate.authenticated(request)) return rejectWebSocket(socket);
  if (lifecycle.status().state !== 'running') return socket.destroy();
  process.stdout.write(`websocket proxy upgrade path=${new URL(request.url, 'http://localhost').pathname}\n`);
  const upstream = net.connect({ host: '127.0.0.1', port: GAME_PORT }, () => {
    const lines = [`${request.method} ${request.url} HTTP/${request.httpVersion}`];
    for (let index = 0; index < request.rawHeaders.length; index += 2) {
      lines.push(`${request.rawHeaders[index]}: ${request.rawHeaders[index + 1]}`);
    }
    upstream.write(`${lines.join('\r\n')}\r\n\r\n`);
    if (head.length) upstream.write(head);
    socket.pipe(upstream).pipe(socket);
  });
  upstream.on('error', () => socket.destroy());
  socket.on('error', () => upstream.destroy());
});

async function shutdown() {
  server.close();
  staticServer.kill('SIGTERM');
  await lifecycle.sleep('shutdown').catch(() => undefined);
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

server.listen(PUBLIC_PORT, '0.0.0.0', () => {
  process.stdout.write(`quake3-wasm: framework 0.9.6 + QuakeJS supervisor on tcp/${PUBLIC_PORT}\n`);
});
