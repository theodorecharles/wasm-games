#!/usr/bin/env node
'use strict';

const http = require('node:http');
const path = require('node:path');
const { execFileSync, spawn } = require('node:child_process');
const { attachClassicWebSocketProxy } = require('./classic-ws-proxy');
const { attachZandronumWebSocketProxy } = require('./zandronum-ws-proxy');

const FRAMEWORK_ROOT = path.resolve(process.env.WASM_GAME_FRAMEWORK_ROOT || '/opt/wasm-game-framework');
const { IdleServiceSupervisor, environmentOptions } = require(path.join(FRAMEWORK_ROOT, 'server/lifecycle.js'));

const PUBLIC_PORT = Number(process.env.WASM_GAME_HTTP_PORT || 8088);
const STATIC_PORT = Number(process.env.IDTECH1_STATIC_PORT || 8089);
const CLASSIC_PORT = Number(process.env.IDTECH1_CLASSIC_PORT || 2342);
const ZANDRONUM_PORT = Number(process.env.IDTECH1_ZANDRONUM_PORT || 10666);
const SITE_ROOT = path.resolve(process.env.WASM_GAME_SITE_ROOT || '/opt/game-site');
const CLASSIC_SERVER = String(process.env.IDTECH1_CLASSIC_SERVER || '/usr/games/chocolate-server');
const ZANDRONUM_SERVER = String(process.env.IDTECH1_ZANDRONUM_SERVER || '/opt/zandronum/zandronum-server');
const ZANDRONUM_ROOT = path.resolve(process.env.IDTECH1_ZANDRONUM_ROOT || path.dirname(ZANDRONUM_SERVER));
const DATA_ROOT = path.resolve(process.env.WASM_GAME_DATA_ROOT || '/data');

function classicEngineVersion() {
  try {
    const value = execFileSync(CLASSIC_SERVER, ['--version'], {
      encoding: 'utf8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
    return value || path.basename(CLASSIC_SERVER);
  } catch (_) {
    return path.basename(CLASSIC_SERVER);
  }
}

const CLASSIC_ENGINE = classicEngineVersion();

let classicProxy = null;
let zandronumProxy = null;
let activeEngine = 'classic';
let activeVariant = 'doom2';

const ZANDRONUM_GAMES = Object.freeze({
  doom: Object.freeze({ iwad: 'DOOM.WAD', map: 'E1M1' }),
  doom2: Object.freeze({ iwad: 'DOOM2.WAD', map: 'MAP01' }),
  tnt: Object.freeze({ iwad: 'TNT.WAD', map: 'MAP01' }),
  plutonia: Object.freeze({ iwad: 'PLUTONIA.WAD', map: 'MAP01' }),
  heretic: Object.freeze({ iwad: 'HERETIC.WAD', map: 'E1M1' }),
  hexen: Object.freeze({ iwad: 'HEXEN.WAD', map: 'MAP01' }),
  chex: Object.freeze({ iwad: 'CHEX.WAD', map: 'E1M1' })
});

function json(response, statusCode, value) {
  const body = Buffer.from(JSON.stringify(value));
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': body.length,
    'cache-control': 'no-store',
    'cross-origin-opener-policy': 'same-origin',
    'cross-origin-embedder-policy': 'require-corp',
    'x-content-type-options': 'nosniff'
  });
  response.end(body);
}

async function startClassic() {
  const args = ['-port', String(CLASSIC_PORT)];
  const workdir = process.env.IDTECH1_CLASSIC_WORKDIR || process.cwd();
  if (/^(1|true|yes|on)$/i.test(String(process.env.IDTECH1_CLASSIC_NETLOG || ''))) {
    args.push('-netlog', path.join(workdir, 'classic-net.log'));
  }
  const child = spawn(CLASSIC_SERVER, args, {
    cwd: workdir,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const handle = { child, output: '', stopping: false };
  const capture = chunk => {
    handle.output = `${handle.output}${String(chunk)}`.slice(-16000);
    process.stdout.write(`[chocolate-server] ${chunk}`);
  };
  child.stdout.on('data', capture);
  child.stderr.on('data', capture);
  child.once('exit', (code, signal) => {
    process.stdout.write(`chocolate-server exited code=${code} signal=${signal || 'none'}\n`);
    if (!handle.stopping && lifecycle.status().state === 'running') {
      lifecycle.sleep('classic server exited').catch(error => {
        process.stderr.write(`Classic lifecycle recovery failed: ${error.message || error}\n`);
      });
    }
  });
  return handle;
}

async function waitUntilClassicReady(handle) {
  const deadline = Date.now() + 500;
  while (Date.now() < deadline) {
    if (handle.child.exitCode !== null) {
      throw new Error(`chocolate-server exited with code ${handle.child.exitCode}: ${handle.output}`);
    }
    if (/listening|port|server/i.test(handle.output) || Date.now() + 100 >= deadline) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  if (handle.child.exitCode === null) return;
  throw new Error('chocolate-server did not become ready.');
}

async function stopClassic(handle) {
  classicProxy?.closeAll(1012, 'classic server sleeping');
  handle.stopping = true;
  if (handle.child.exitCode !== null) return;
  await new Promise(resolve => {
    const timer = setTimeout(() => handle.child.kill('SIGKILL'), 3000);
    handle.child.once('exit', () => { clearTimeout(timer); resolve(); });
    handle.child.kill('SIGTERM');
  });
}

async function startZandronum(context) {
  const variant = String(context.variant || 'doom2');
  const game = ZANDRONUM_GAMES[variant];
  if (!game) throw new Error(`Unsupported Zandronum game: ${variant}`);
  const args = [
    '-iwad', path.join(DATA_ROOT, game.iwad), '-port', String(ZANDRONUM_PORT),
    '-skill', '3', '+sv_updatemaster', 'false', '+deathmatch', '1',
    '+map', game.map, '+addbot', 'Chubbs', '+addbot', 'Crash'
  ];
  const child = spawn(ZANDRONUM_SERVER, args, {
    cwd: ZANDRONUM_ROOT,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const handle = { child, output: '', stopping: false, engine: 'zandronum', variant };
  const capture = chunk => {
    handle.output = `${handle.output}${String(chunk)}`.slice(-32000);
    process.stdout.write(`[zandronum-server] ${chunk}`);
  };
  child.stdout.on('data', capture);
  child.stderr.on('data', capture);
  child.once('exit', (code, signal) => {
    process.stdout.write(`zandronum-server exited code=${code} signal=${signal || 'none'}\n`);
    if (!handle.stopping && lifecycle.status().state === 'running') {
      lifecycle.sleep('Zandronum server exited').catch(error => {
        process.stderr.write(`Zandronum lifecycle recovery failed: ${error.message || error}\n`);
      });
    }
  });
  return handle;
}

async function waitUntilZandronumReady(handle) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (handle.child.exitCode !== null) {
      throw new Error(`zandronum-server exited with code ${handle.child.exitCode}: ${handle.output}`);
    }
    if (/\*\*\*\s+(?:MAP\d\d|E\dM\d):/i.test(handle.output)) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`zandronum-server did not load its map: ${handle.output}`);
}

async function stopZandronum(handle) {
  zandronumProxy?.closeAll(1012, 'Zandronum server sleeping');
  handle.stopping = true;
  if (handle.child.exitCode !== null) return;
  await new Promise(resolve => {
    const timer = setTimeout(() => handle.child.kill('SIGKILL'), 3000);
    handle.child.once('exit', () => { clearTimeout(timer); resolve(); });
    handle.child.kill('SIGTERM');
  });
}

async function startGame(context) {
  activeEngine = context.engine === 'zandronum' ? 'zandronum' : 'classic';
  activeVariant = String(context.variant || 'doom2');
  const handle = activeEngine === 'zandronum'
    ? await startZandronum(context)
    : await startClassic(context);
  handle.engine = activeEngine;
  return handle;
}

async function waitUntilGameReady(handle) {
  return handle.engine === 'zandronum'
    ? waitUntilZandronumReady(handle)
    : waitUntilClassicReady(handle);
}

async function stopGame(handle) {
  return handle.engine === 'zandronum' ? stopZandronum(handle) : stopClassic(handle);
}

const lifecycle = new IdleServiceSupervisor({
  ...environmentOptions(process.env),
  maps: [],
  start: startGame,
  waitUntilReady: waitUntilGameReady,
  stop: stopGame,
  onStatus: status => process.stdout.write(
    `idtech1 ${activeEngine} state=${status.state} humans=${status.humans}\n`)
});

async function ensureEngine(engine, context) {
  const requested = engine === 'zandronum' ? 'zandronum' : 'classic';
  if (lifecycle.status().state !== 'sleeping' && activeEngine !== requested) {
    await lifecycle.sleep(`switching from ${activeEngine} to ${requested}`);
  }
  return lifecycle.wake({ ...(context || {}), engine: requested });
}

function publicStatus() {
  const modern = activeEngine === 'zandronum';
  return Object.freeze({
    ...lifecycle.status(),
    mode: modern ? 'modernized' : 'classic',
    engine: modern ? 'Zandronum 3.3-alpha' : CLASSIC_ENGINE,
    variant: activeVariant,
    connect: modern ? `127.0.0.1:${ZANDRONUM_PORT}` : '1',
    wsPath: modern ? '/ws/zandronum' : '/ws/classic',
    peers: modern ? (zandronumProxy?.peerCount() || 0) : (classicProxy?.peerCount() || 0),
    bots: modern ? 2 : 0
  });
}

const staticServer = spawn(process.execPath, [path.join(FRAMEWORK_ROOT, 'server/static-server.js')], {
  env: {
    ...process.env,
    WASM_GAME_VARIANT: process.env.WASM_GAME_VARIANT || 'suite',
    WASM_GAME_HTTP_PORT: String(STATIC_PORT),
    WASM_GAME_SITE_ROOT: SITE_ROOT,
    WASM_GAME_SHELL_ROOT: process.env.WASM_GAME_SHELL_ROOT || path.join(FRAMEWORK_ROOT, 'dist')
  },
  stdio: ['ignore', 'inherit', 'inherit']
});

function proxyHttp(request, response) {
  const proxy = http.request({
    host: '127.0.0.1', port: STATIC_PORT, method: request.method,
    path: request.url, headers: request.headers
  }, upstream => {
    response.writeHead(upstream.statusCode, upstream.headers);
    upstream.pipe(response);
  });
  proxy.on('error', error => json(response, 502, { error: error.message || String(error) }));
  request.pipe(proxy);
}

async function readJson(request) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > 4096) {
      const error = new Error('Wake metadata is too large.');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  if (!bytes) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch (_) {
    const error = new Error('Wake metadata must be JSON.');
    error.statusCode = 400;
    throw error;
  }
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname === '/health' && request.method === 'GET') {
      return json(response, 200, { ok: true, state: lifecycle.status().state });
    }
    if (url.pathname === '/status' && request.method === 'GET') return json(response, 200, publicStatus());
    if (url.pathname === '/config.json' && request.method === 'GET') return json(response, 200, publicStatus());
    if (url.pathname === '/wake' && request.method === 'POST') {
      const metadata = await readJson(request);
      if (metadata.engine && !['classic', 'zandronum'].includes(metadata.engine)) {
        const error = new Error(`Unsupported id Tech 1 multiplayer engine: ${metadata.engine}`);
        error.statusCode = 409;
        throw error;
      }
      await ensureEngine(metadata.engine || 'classic', { ...metadata, reason: 'browser launch' });
      return json(response, 200, publicStatus());
    }
    if (url.pathname === '/wake') return json(response, 405, { error: 'Method not allowed.' });
    proxyHttp(request, response);
  } catch (error) {
    json(response, error.statusCode || 500, { error: error.message || String(error) });
  }
});

classicProxy = attachClassicWebSocketProxy(server, {
  path: '/ws/classic',
  destinationHost: '127.0.0.1',
  destinationPort: CLASSIC_PORT,
  ensureDedicated: reason => ensureEngine('classic', { reason }),
  onPeers: humans => {
    if (activeEngine === 'classic') lifecycle.observeHumans(humans);
  }
});

zandronumProxy = attachZandronumWebSocketProxy(server, {
  path: '/ws/zandronum',
  destinationHost: '127.0.0.1',
  destinationPort: ZANDRONUM_PORT,
  ensureDedicated: reason => ensureEngine('zandronum', { reason, variant: activeVariant }),
  onPeers: humans => {
    if (activeEngine === 'zandronum') lifecycle.observeHumans(humans);
  }
});

let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  classicProxy.closeAll(1012, 'server shutdown');
  zandronumProxy.closeAll(1012, 'server shutdown');
  server.close();
  staticServer.kill('SIGTERM');
  await lifecycle.sleep('shutdown').catch(() => undefined);
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
staticServer.once('exit', code => {
  if (!shuttingDown && code) process.stderr.write(`Static server exited with code ${code}\n`);
});
server.listen(PUBLIC_PORT, '0.0.0.0', () => {
  process.stdout.write(`id Tech 1 supervisor listening on ${PUBLIC_PORT}\n`);
});
