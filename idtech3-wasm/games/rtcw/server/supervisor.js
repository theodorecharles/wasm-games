#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { ensureSessionSecret, passwordProtectedPath, rejectWebSocket } = require('./access');
const { queryStatus } = require('./status');
const { attachWebSocketUdpProxy } = require('./ws-proxy');
const arena = require('./arena');
const gameMode = require('./mode');
const { sendRcon } = require('./rcon');
const { IdleServiceSupervisor, environmentOptions } = require('/opt/wasm-game-framework/server/lifecycle.js');
const { createPasswordGate } = require('/opt/wasm-game-framework/server/password-auth.js');
const { createProvisioningStore } = require('/opt/wasm-game-framework/server/provisioning.js');

ensureSessionSecret(process.env);
const passwordGate = createPasswordGate();

const PUBLIC_PORT = Number(process.env.WASM_GAME_HTTP_PORT || 8088);
const STATIC_PORT = Number(process.env.RTCW_STATIC_PORT || 8089);
const GAME_PORT = Number(process.env.RTCW_GAME_PORT || 27960);
const START_MAP = arena.chooseStartMap(process.env.RTCW_MAP);
const RCON_PASSWORD = String(process.env.RTCW_RCON || 'rtcw-wasm-omnibot');
const OMNIBOT_PATH = String(process.env.RTCW_OMNIBOT_PATH || '/opt/omni-bot');
const RUNTIME_ROOT = path.resolve(process.env.RTCW_RUNTIME_ROOT || '/tmp/rtcw-runtime');
const RUNTIME_MAIN = path.join(RUNTIME_ROOT, 'main');
const RUNTIME_HOME = path.join(RUNTIME_ROOT, 'home');
const SITE_ROOT = '/opt/game-site';
const NATIVE_ROOT = '/opt/rtcw-native';
const manifestCollection = JSON.parse(fs.readFileSync(path.join(SITE_ROOT, 'wasm-game-data.json'), 'utf8'));
const multiplayerManifest = manifestCollection.variants && manifestCollection.variants['rtcw-mp'];
if (!multiplayerManifest) throw new Error('The RTCW multiplayer data policy is missing.');
const gameData = createProvisioningStore({
  dataRoot: '/data',
  manifest: multiplayerManifest,
  validatorRoot: SITE_ROOT
});

let gameProxy = null;
let arenaRoster = Object.freeze({ humans: 0, bots: 0, map: START_MAP, gametype: String(arena.GAMETYPE) });

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

async function requireGameData() {
  const status = await gameData.status();
  if (!status.ready) {
    const error = new Error('RTCW multiplayer files are not installed.');
    error.statusCode = 409;
    throw error;
  }
}

async function copyIfNeeded(source, target, mode) {
  const sourceStat = await fsp.stat(source);
  const targetStat = await fsp.stat(target).catch(() => null);
  if (!targetStat || !targetStat.isFile() || targetStat.size !== sourceStat.size) {
    await fsp.mkdir(path.dirname(target), { recursive: true });
    await fsp.copyFile(source, target);
  }
  await fsp.chmod(target, mode);
}

async function linkIfNeeded(source, target) {
  const current = await fsp.lstat(target).catch(() => null);
  if (current?.isSymbolicLink() && await fsp.readlink(target) === source) return;
  if (current) await fsp.unlink(target);
  await fsp.mkdir(path.dirname(target), { recursive: true });
  await fsp.symlink(source, target);
}

async function prepareRuntime() {
  await requireGameData();
  await fsp.mkdir(RUNTIME_MAIN, { recursive: true });
  await fsp.mkdir(path.join(RUNTIME_HOME, 'main'), { recursive: true });
  for (const policy of gameData.manifest.files) {
    await linkIfNeeded(gameData.filePath(policy), path.join(RUNTIME_MAIN, policy.name));
  }
  await copyIfNeeded(path.join(NATIVE_ROOT, 'qagame.mp.x86_64.so'),
    path.join(RUNTIME_MAIN, 'qagame.mp.x86_64.so'), 0o555);
  await copyIfNeeded(path.join(NATIVE_ROOT, 'server.cfg'), path.join(RUNTIME_MAIN, 'server.cfg'), 0o444);
}

function pipeOutput(handle, stream, label) {
  stream.on('data', chunk => {
    handle.lineBuffer += String(chunk);
    const lines = handle.lineBuffer.split(/\r?\n/);
    handle.lineBuffer = lines.pop() || '';
    for (const line of lines) {
      process.stdout.write(`[${label}] ${line}\n`);
      if (arena.isOverflowLine(line)) {
        handle.overflows = (handle.overflows || 0) + 1;
        process.stderr.write(`Omni-Bot overflow: ${line}\n`);
      }
      if (arena.isFrameworkLoadedLine(line)) {
        handle.frameworkLoaded = true;
        process.stdout.write('[omnibot] framework loaded\n');
      }
    }
  });
}

function rconOptions() {
  return { host: '127.0.0.1', port: GAME_PORT, password: RCON_PASSWORD };
}

function requireOmniBotFramework() {
  const missing = arena.requiredFrameworkFiles().filter(relative => {
    try {
      fs.accessSync(path.join(OMNIBOT_PATH, relative));
      return false;
    } catch (_) {
      return true;
    }
  });
  if (missing.length) {
    throw new Error(`Omni-Bot framework is incomplete: ${missing.join(', ')}`);
  }
}

function makeOmniBotHooks(handle) {
  return {
    async setLimits(plan) {
      const min = arena.botMinCommand(plan.target);
      const max = arena.botMaxCommand(plan.target);
      await sendRcon(min, rconOptions());
      await sendRcon(max, rconOptions());
      handle.lastLimits = plan.target;
      process.stdout.write(`[omnibot] ${min}; ${max}\n`);
    }
  };
}

async function reconcileOmniBot(handle) {
  if (handle.reconciling) return handle.lastRoster;
  handle.reconciling = true;
  try {
    const status = await queryStatus({ port: GAME_PORT, timeoutMs: 1000 });
    handle.map = status.map || handle.map;
    lifecycle.observeHumans(status.humans);
    handle.lastRoster = status;
    arenaRoster = status;
    await arena.applyFill({
      humans: status.humans,
      bots: status.bots,
      slots: arena.MATCH_SLOTS
    }, makeOmniBotHooks(handle));
    return status;
  } finally {
    handle.reconciling = false;
  }
}

async function startDedicated({ map }) {
  requireOmniBotFramework();
  await prepareRuntime();
  const selectedMap = arena.chooseStartMap(map);
  const args = [
    '+set', 'fs_basepath', RUNTIME_ROOT,
    '+set', 'fs_homepath', RUNTIME_HOME,
    '+set', 'fs_game', '',
    '+set', 'dedicated', '1',
    '+set', 'net_ip', '127.0.0.1',
    '+set', 'net_port', String(GAME_PORT),
    '+set', 'vm_game', '0',
    '+set', 'sv_pure', '0',
    '+set', 'bot_enable', '0',
    '+set', 'omnibot_enable', '1',
    '+set', 'omnibot_path', OMNIBOT_PATH,
    '+set', 'rconpassword', RCON_PASSWORD,
    '+set', 'g_gametype', String(arena.GAMETYPE),
    '+set', 'g_speed', String(gameMode.GAME_SPEED),
    '+set', 'g_arcade', gameMode.ARCADE ? '1' : '0',
    '+exec', 'server.cfg',
    '+map', selectedMap
  ];
  const child = spawn(path.join(NATIVE_ROOT, 'iowolfded.x86_64'), args, {
    cwd: RUNTIME_ROOT,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const handle = { child, map: selectedMap, lineBuffer: '', statusTimer: null, stopping: false };
  pipeOutput(handle, child.stdout, 'iowolfded');
  pipeOutput(handle, child.stderr, 'iowolfded');
  child.once('exit', (code, signal) => {
    if (handle.lineBuffer) process.stdout.write(`[iowolfded] ${handle.lineBuffer}\n`);
    if (handle.statusTimer) clearInterval(handle.statusTimer);
    handle.statusTimer = null;
    lifecycle.observeHumans(0);
    process.stdout.write(`iowolfded exited code=${code} signal=${signal || 'none'}\n`);
    if (!handle.stopping && lifecycle.status().state === 'running') {
      lifecycle.sleep('dedicated process exited').catch(error => {
        process.stderr.write(`RTCW lifecycle recovery failed: ${error.message || error}\n`);
      });
    }
  });
  return handle;
}

async function waitUntilReady(handle) {
  const deadline = Date.now() + 45000;
  let lastError = null;
  while (Date.now() < deadline) {
    if (handle.child.exitCode !== null) throw new Error(`iowolfded exited with code ${handle.child.exitCode}.`);
    try {
      const status = await queryStatus({ port: GAME_PORT, timeoutMs: 750 });
      handle.map = status.map || handle.map;
      lifecycle.observeHumans(status.humans);
      handle.lastRoster = status;
      await reconcileOmniBot(handle);
      handle.statusTimer = setInterval(() => {
        reconcileOmniBot(handle).catch(error => {
          if (handle.child.exitCode !== null) lifecycle.observeHumans(0);
          process.stderr.write(`RTCW status poll: ${error.message || error}\n`);
        });
      }, 5000);
      handle.statusTimer.unref?.();
      return;
    } catch (error) {
      lastError = error;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  }
  throw new Error(`iowolfded did not become ready: ${lastError ? lastError.message : 'timeout'}`);
}

async function stopDedicated(handle) {
  gameProxy?.closeAll(1012, 'game server sleeping');
  if (handle.statusTimer) clearInterval(handle.statusTimer);
  handle.statusTimer = null;
  handle.stopping = true;
  if (handle.child.exitCode !== null) return;
  await new Promise(resolve => {
    const timer = setTimeout(() => handle.child.kill('SIGKILL'), 5000);
    handle.child.once('exit', () => { clearTimeout(timer); resolve(); });
    handle.child.kill('SIGTERM');
  });
}

const lifecycle = new IdleServiceSupervisor({
  ...environmentOptions(process.env),
  maps: arena.rotation(),
  start: startDedicated,
  waitUntilReady,
  stop: stopDedicated,
  onStatus: status => process.stdout.write(
    `RTCW arena state=${status.state} humans=${status.humans} map=${status.map || '-'}\n`)
});

const staticServer = spawn(process.execPath, ['/opt/wasm-game-framework/server/static-server.js'], {
  env: {
    ...process.env,
    WASM_GAME_VARIANT: 'rtcw-mp',
    WASM_GAME_HTTP_PORT: String(STATIC_PORT),
    WASM_GAME_SITE_ROOT: SITE_ROOT,
    WASM_GAME_DATA_ROOT: '/data'
  },
  stdio: ['ignore', 'inherit', 'inherit']
});

function publicStatus() {
  const live = lifecycle.status();
  return Object.freeze({
    ...live,
    map: arenaRoster.map || live.map || START_MAP,
    gametype: Number(arenaRoster.gametype || arena.GAMETYPE),
    rotation: arena.rotation(),
    maxClients: 16,
    bots: Number(arenaRoster.bots) || 0,
    humans: Number(arenaRoster.humans != null ? arenaRoster.humans : live.humans) || 0,
    botPolicy: arena.BOT_POLICY,
    connect: arena.MANAGED_CONNECT
  });
}

function proxyHttp(request, response) {
  const proxy = http.request({
    host: '127.0.0.1',
    port: STATIC_PORT,
    method: request.method,
    path: request.url,
    headers: request.headers
  }, upstream => {
    response.writeHead(upstream.statusCode, upstream.headers);
    upstream.pipe(response);
  });
  proxy.on('error', error => json(response, 502, { error: error.message || String(error) }));
  request.pipe(proxy);
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    if (await passwordGate.handle(request, response, url)) return;
    if (passwordProtectedPath(url.pathname) && !passwordGate.require(request, response)) return;
    if (url.pathname === '/health' && request.method === 'GET') {
      return json(response, 200, { ok: true, state: lifecycle.status().state });
    }
    if (url.pathname === '/status' && request.method === 'GET') return json(response, 200, publicStatus());
    if (url.pathname === '/config.json' && request.method === 'GET') {
      return json(response, 200, {
        connect: `127.0.0.1:${GAME_PORT}`,
        wsPath: '/ws',
        map: START_MAP,
        gametype: 5,
        server: publicStatus()
      });
    }
    if (url.pathname === '/wake' && request.method === 'POST') {
      let bytes = 0;
      for await (const chunk of request) {
        bytes += chunk.length;
        if (bytes > 4096) {
          const error = new Error('Wake metadata is too large.');
          error.statusCode = 413;
          throw error;
        }
      }
      await lifecycle.wake();
      return json(response, 200, publicStatus());
    }
    if (url.pathname === '/wake') return json(response, 405, { error: 'Method not allowed.' });
    proxyHttp(request, response);
  } catch (error) {
    json(response, error.statusCode || 500, { error: error.message || String(error) });
  }
});

gameProxy = attachWebSocketUdpProxy(server, {
  path: '/ws',
  destinationHost: '127.0.0.1',
  destinationPort: GAME_PORT,
  authorize: request => passwordGate.authenticated(request),
  reject: rejectWebSocket,
  ensureDedicated: reason => lifecycle.wake({ reason })
});

let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  gameProxy.closeAll(1012, 'server shutdown');
  server.close();
  staticServer.kill('SIGTERM');
  await lifecycle.sleep('shutdown').catch(() => undefined);
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

server.listen(PUBLIC_PORT, '0.0.0.0', () => {
  process.stdout.write(`rtcw-mp-wasm: framework server on tcp/${PUBLIC_PORT}; arena sleeps until Play\n`);
});
