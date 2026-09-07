#!/usr/bin/env node
'use strict';

const http = require('node:http');
const path = require('node:path');
const { execFileSync, spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { attachClassicWebSocketProxy } = require('./classic-ws-proxy');
const { attachZandronumWebSocketProxy } = require('./zandronum-ws-proxy');
const { GAMES: ZANDRONUM_GAMES, startClassicMatch,
  waitUntilClassicReady: waitForClassicBots, stopClassicMatch, classicMatchStatus } = require('./classic-match');

const FRAMEWORK_ROOT = path.resolve(process.env.WASM_GAME_FRAMEWORK_ROOT || '/opt/wasm-game-framework');
const { IdleServiceSupervisor, environmentOptions } = require(path.join(FRAMEWORK_ROOT, 'server/lifecycle.js'));

const PUBLIC_PORT = Number(process.env.WASM_GAME_HTTP_PORT || 8088);
const STATIC_PORT = Number(process.env.IDTECH1_STATIC_PORT || 8089);
const CLASSIC_PORT = Number(process.env.IDTECH1_CLASSIC_PORT || 2342);
const ZANDRONUM_PORT = Number(process.env.IDTECH1_ZANDRONUM_PORT || 10666);
const SITE_ROOT = path.resolve(process.env.WASM_GAME_SITE_ROOT || '/opt/game-site');
const CLASSIC_SERVER = String(process.env.IDTECH1_CLASSIC_SERVER || '/usr/games/chocolate-server');
const CLASSIC_BOT_ROOT = path.resolve(process.env.IDTECH1_CLASSIC_BOT_ROOT || '/opt/classic-bots');
const ZANDRONUM_SERVER = String(process.env.IDTECH1_ZANDRONUM_SERVER || '/opt/zandronum/zandronum-server');
const ZANDRONUM_ROOT = path.resolve(process.env.IDTECH1_ZANDRONUM_ROOT || path.dirname(ZANDRONUM_SERVER));
const DATA_ROOT = path.resolve(process.env.WASM_GAME_DATA_ROOT || '/data');
const DEPLOYMENT_VARIANT = String(process.env.WASM_GAME_VARIANT || 'suite');

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
let classicHandle = null;
let zandronumProxy = null;
let activeEngine = 'classic';
let activeVariant = DEPLOYMENT_VARIANT === 'suite' ? 'doom2' : DEPLOYMENT_VARIANT;
let activeMatchId = '';
let selectionPending = Promise.resolve();
let launchLeaseUntil = 0;
const LAUNCH_LEASE_MS = Math.max(1000, Number(process.env.IDTECH1_LAUNCH_LEASE_MS) || 45000);

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

async function startClassic(context) {
  classicHandle = await startClassicMatch({
    variant: context.variant, server: CLASSIC_SERVER, port: CLASSIC_PORT,
    botRoot: CLASSIC_BOT_ROOT, dataRoot: DATA_ROOT, siteRoot: SITE_ROOT,
    graceMs: Number(process.env.IDTECH1_CLASSIC_LOBBY_GRACE_MS || 8000),
    netlog: /^(1|true|yes|on)$/i.test(String(process.env.IDTECH1_CLASSIC_NETLOG || '')),
    log: message => process.stdout.write(message),
    onFailure: error => {
      process.stderr.write(`Classic match failed: ${error.message}\n`);
      if (lifecycle.status().state === 'running') lifecycle.sleep('classic process failed')
        .catch(failure => process.stderr.write(`Classic cleanup failed: ${failure.message}\n`));
    }
  });
  return classicHandle;
}

async function waitUntilClassicReady(handle) {
  try { await waitForClassicBots(handle); }
  catch (error) { if (classicHandle === handle) classicHandle = null; throw error; }
}

async function stopClassic(handle) {
  classicProxy?.closeAll(1012, 'classic server sleeping');
  await stopClassicMatch(handle);
  if (classicHandle === handle) classicHandle = null;
}

async function startZandronum(context) {
  const variant = String(context.variant || 'doom2');
  const game = ZANDRONUM_GAMES[variant];
  if (!Object.hasOwn(ZANDRONUM_GAMES, variant)) throw new Error(`Unsupported Zandronum game: ${variant}`);
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
  activeMatchId = randomUUID();
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

function ensureEngine(engine, context) {
  const requested = engine === 'zandronum' ? 'zandronum' : 'classic';
  const variant = String(context?.variant || activeVariant);
  const operation = selectionPending.then(async () => {
    if (DEPLOYMENT_VARIANT !== 'suite' && variant !== DEPLOYMENT_VARIANT) {
      const error = new Error('This endpoint is locked to a different game variant.');
      error.statusCode = 409;
      throw error;
    }
    if (!Object.hasOwn(ZANDRONUM_GAMES, variant)) {
      const error = new Error(`Unsupported deathmatch game: ${variant}`);
      error.statusCode = 409;
      throw error;
    }
    const status = lifecycle.status();
    const incompatible = activeEngine !== requested || activeVariant !== variant;
    if (status.state !== 'sleeping' && incompatible) {
      if (status.humans > 0 || Date.now() < launchLeaseUntil) {
        const error = new Error(`Deathmatch is busy with ${activeVariant} (${activeEngine}). Close that match and try again after its launch finishes.`);
        error.statusCode = 409;
        throw error;
      }
      await lifecycle.sleep(`switching to ${variant} (${requested})`);
    }
    if (!incompatible && requested === 'classic' && classicHandle?.phase === 'playing') {
      if (status.humans > 0) {
        const error = new Error('This Classic match has already started. Join before its countdown ends, or wait until the current players leave.');
        error.statusCode = 409;
        throw error;
      }
      await lifecycle.sleep('new Classic match after all humans left');
    }
    await lifecycle.wake({ ...(context || {}), variant, engine: requested });
    if (context?.reason === 'browser launch') launchLeaseUntil = Date.now() + LAUNCH_LEASE_MS;
    return publicStatus();
  });
  selectionPending = operation.catch(() => undefined);
  return operation;
}

function publicStatus() {
  const modern = activeEngine === 'zandronum';
  return Object.freeze({
    ...lifecycle.status(),
    mode: modern ? 'modernized' : 'classic',
    engine: modern ? 'Zandronum 3.3-alpha' : CLASSIC_ENGINE,
    variant: activeVariant,
    connect: modern ? `127.0.0.1:${ZANDRONUM_PORT}` : '1',
    wsPath: `${modern ? '/ws/zandronum' : '/ws/classic'}?match=${encodeURIComponent(activeMatchId)}`,
    peers: modern ? (zandronumProxy?.peerCount() || 0) : (classicProxy?.peerCount() || 0),
    ...(modern ? { bots: 2 } : classicMatchStatus(classicHandle))
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
      const selected = await ensureEngine(metadata.engine || 'classic', { ...metadata, reason: 'browser launch' });
      return json(response, 200, selected);
    }
    if (url.pathname === '/wake') return json(response, 405, { error: 'Method not allowed.' });
    proxyHttp(request, response);
  } catch (error) {
    json(response, error.statusCode || 500, { error: error.message || String(error) });
  }
});

function authorizeMatch(request, engine) {
  const url = new URL(request.url, 'http://localhost');
  return lifecycle.status().state === 'running' && activeEngine === engine &&
    (engine !== 'classic' || classicHandle?.phase !== 'playing') &&
    Boolean(activeMatchId) && url.searchParams.get('match') === activeMatchId;
}

function rejectMatch(socket) {
  socket.end('HTTP/1.1 409 Match changed\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
}

classicProxy = attachClassicWebSocketProxy(server, {
  path: '/ws/classic',
  destinationHost: '127.0.0.1',
  destinationPort: CLASSIC_PORT,
  authorize: request => authorizeMatch(request, 'classic'),
  reject: rejectMatch,
  ensureDedicated: reason => ensureEngine('classic', { reason }),
  onPeers: humans => {
    if (humans > 0) launchLeaseUntil = 0;
    if (activeEngine === 'classic') lifecycle.observeHumans(humans);
  }
});

zandronumProxy = attachZandronumWebSocketProxy(server, {
  path: '/ws/zandronum',
  destinationHost: '127.0.0.1',
  destinationPort: ZANDRONUM_PORT,
  authorize: request => authorizeMatch(request, 'zandronum'),
  reject: rejectMatch,
  ensureDedicated: reason => ensureEngine('zandronum', { reason, variant: activeVariant }),
  onPeers: humans => {
    if (humans > 0) launchLeaseUntil = 0;
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
