#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const dgram = require('node:dgram');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { attachDatagramWebSocketProxy } = require('./datagram-ws-proxy');

const FRAMEWORK_ROOT = path.resolve(process.env.WASM_GAME_FRAMEWORK_ROOT || '/opt/wasm-game-framework');
const { IdleServiceSupervisor, environmentOptions } = require(path.join(FRAMEWORK_ROOT, 'server/lifecycle.js'));
const PUBLIC_PORT = Number(process.env.WASM_GAME_HTTP_PORT || 8088);
const STATIC_PORT = Number(process.env.IDTECH2_STATIC_PORT || 8089);
const SITE_ROOT = path.resolve(process.env.WASM_GAME_SITE_ROOT || '/opt/game-site');
const DATA_ROOT = path.resolve(process.env.WASM_GAME_DATA_ROOT || '/data');
const Q1_PORT = Number(process.env.IDTECH2_Q1_PORT || 26000);
const Q2_PORT = Number(process.env.IDTECH2_Q2_PORT || 27910);
const Q1_SERVER = path.resolve(process.env.IDTECH2_Q1_SERVER || '/opt/frikbot/bin/nqserver');
const Q1_PROGS = path.resolve(process.env.IDTECH2_Q1_PROGS || '/opt/frikbot/progs.dat');
const Q2_SERVER = path.resolve(process.env.IDTECH2_Q2_SERVER || '/usr/lib/yamagi-quake2/q2ded');
const Q2_GAME = path.resolve(process.env.IDTECH2_Q2_GAME || '/opt/3zb2/game.so');
const Q2_ASSETS = path.resolve(process.env.IDTECH2_Q2_ASSETS || '/opt/3zb2/assets');
const Q2_XATRIX_GAME = path.resolve(process.env.IDTECH2_Q2_XATRIX_GAME || '/usr/lib/yamagi-quake2/xatrix/game.so');
const Q2_ROGUE_GAME = path.resolve(process.env.IDTECH2_Q2_ROGUE_GAME || '/usr/lib/yamagi-quake2/rogue/game.so');

let activeEngine = 'quake';
let activeMap = 'dm2';
let activeBots = 2;
let activeExpansion = '';
let activeMode = 'deathmatch';
let quakeProxy = null;
let quake2Proxy = null;
const nativePlayers = new Set();

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

function existingFile(candidates, label) {
  const selected = candidates.find(candidate => fs.existsSync(candidate));
  if (!selected) throw new Error(`${label} was not found (${candidates.join(', ')}).`);
  return selected;
}

function linkOrCopy(source, destination) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  try { fs.symlinkSync(source, destination); } catch (_) { fs.copyFileSync(source, destination); }
}

function captureProcess(child, prefix, metadata) {
  const handle = { child, output: '', eventTails: { stdout: '', stderr: '' }, stopping: false, ...metadata };
  const capture = (stream, chunk) => {
    const value = String(chunk);
    handle.output = `${handle.output}${value}`.slice(-64000);
    const eventText = `${handle.eventTails[stream]}${value}`;
    const events = eventText.matchAll(/\b(Browser\d+) entered the game\b|\bClient (Browser\d+) removed\b/g);
    for (const event of events) {
      if (event[1]) nativePlayers.add(event[1]);
      if (event[2]) nativePlayers.delete(event[2]);
    }
    handle.eventTails[stream] = eventText.slice(-128);
    process.stdout.write(`[${prefix}] ${chunk}`);
  };
  child.stdout.on('data', chunk => capture('stdout', chunk));
  child.stderr.on('data', chunk => capture('stderr', chunk));
  child.once('exit', (code, signal) => {
    process.stdout.write(`${prefix} exited code=${code} signal=${signal || 'none'}\n`);
    if (!handle.stopping && lifecycle.status().state === 'running') {
      lifecycle.sleep(`${prefix} exited`).catch(error => process.stderr.write(`${error.message || error}\n`));
    }
  });
  return handle;
}

function startQuake(context) {
  nativePlayers.clear();
  activeExpansion = '';
  activeMode = 'deathmatch';
  const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'idtech2-quake-'));
  const id1 = path.join(workdir, 'id1');
  const frikbot = path.join(workdir, 'frikbot');
  fs.mkdirSync(id1, { recursive: true });
  fs.mkdirSync(frikbot, { recursive: true });
  const q1Root = fs.existsSync(path.join(DATA_ROOT, 'quake1')) ? path.join(DATA_ROOT, 'quake1') : DATA_ROOT;
  linkOrCopy(existingFile([path.join(q1Root, 'id1/pak0.pak'), path.join(q1Root, 'pak0.pak')], 'Quake pak0.pak'), path.join(id1, 'pak0.pak'));
  linkOrCopy(existingFile([path.join(q1Root, 'id1/pak1.pak'), path.join(q1Root, 'pak1.pak')], 'Quake pak1.pak'), path.join(id1, 'pak1.pak'));
  linkOrCopy(Q1_PROGS, path.join(frikbot, 'progs.dat'));
  activeMap = String(context.map || 'dm2');
  activeBots = Math.max(0, Math.min(8, Number(context.bots) || 2));
  const args = ['-basedir', workdir, '-game', 'frikbot', '-dedicated', '16',
    '-port', String(Q1_PORT), '+skill', '2', '+deathmatch', '1', '+map', activeMap];
  for (let index = 0; index < activeBots; index += 1) args.push('+addbot', `BrowserBot${index + 1}`, '2');
  const child = spawn(Q1_SERVER, args, { cwd: workdir, stdio: ['pipe', 'pipe', 'pipe'] });
  return captureProcess(child, 'quake-frikbot', { engine: 'quake', workdir });
}

function startQuake2(context) {
  nativePlayers.clear();
  const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'idtech2-quake2-'));
  const q2Root = fs.existsSync(path.join(DATA_ROOT, 'quake2')) ? path.join(DATA_ROOT, 'quake2') : DATA_ROOT;
  for (const pak of ['pak0.pak', 'pak1.pak', 'pak2.pak']) {
    linkOrCopy(existingFile([path.join(q2Root, 'baseq2', pak), path.join(q2Root, pak)], `Quake II ${pak}`), path.join(workdir, 'baseq2', pak));
  }
  activeExpansion = ['xatrix', 'rogue'].includes(context.expansion) ? context.expansion : '';
  activeMode = context.mode === 'campaign' ? 'campaign' : 'deathmatch';
  const gameDirectory = activeExpansion || '3zb2';
  fs.mkdirSync(path.join(workdir, gameDirectory), { recursive: true });
  if (activeExpansion) {
    const expansionPak = existingFile([
      path.join(q2Root, activeExpansion, 'pak0.pak')
    ], `Quake II ${activeExpansion} pak0.pak`);
    linkOrCopy(expansionPak, path.join(workdir, activeExpansion, 'pak0.pak'));
    linkOrCopy(activeExpansion === 'xatrix' ? Q2_XATRIX_GAME : Q2_ROGUE_GAME,
      path.join(workdir, activeExpansion, 'game.so'));
  } else {
    linkOrCopy(Q2_GAME, path.join(workdir, '3zb2', 'game.so'));
    if (fs.existsSync(Q2_ASSETS)) {
      fs.cpSync(Q2_ASSETS, path.join(workdir, '3zb2'), { recursive: true });
      const archive = path.join(Q2_ASSETS, 'assets.zip');
      if (fs.existsSync(archive)) {
        const extracted = spawnSync('unzip', ['-oq', archive, '-d', workdir], { encoding: 'utf8' });
        if (extracted.status !== 0) throw new Error(`Could not extract 3ZB2 assets: ${extracted.stderr || extracted.error || 'unzip failed'}`);
      }
    }
  }
  activeMap = String(context.map || (activeExpansion === 'xatrix' ? 'xswamp' : activeExpansion === 'rogue' ? 'rbase1' : 'q2dm1'));
  activeBots = activeExpansion ? 0 : Math.max(0, Math.min(8, Number(context.bots) || 2));
  const args = ['-datadir', workdir, '+set', 'dedicated', '1',
    '+set', 'deathmatch', activeMode === 'deathmatch' ? '1' : '0',
    '+set', 'coop', activeMode === 'campaign' ? '1' : '0',
    '+set', 'game', gameDirectory, '+set', 'maxclients', activeMode === 'campaign' ? '4' : '16',
    '+set', 'port', String(Q2_PORT), '+map', activeMap];
  if (!activeExpansion && activeBots) args.push('+sv', 'spb', String(activeBots));
  const child = spawn('stdbuf', ['-oL', '-eL', Q2_SERVER, ...args], {
    cwd: workdir, stdio: ['pipe', 'pipe', 'pipe']
  });
  return captureProcess(child, 'quake2-3zb2', { engine: 'quake2', workdir });
}

async function startGame(context) {
  activeEngine = context.engine === 'quake2' ? 'quake2' : 'quake';
  return activeEngine === 'quake2' ? startQuake2(context) : startQuake(context);
}

async function waitUntilReady(handle) {
  const deadline = Date.now() + 30000;
  const ready = handle.engine === 'quake2' ? /server initialization|q2dm\d|==== InitGame ====/i : /Server spawned|entered the game/i;
  while (Date.now() < deadline) {
    if (handle.child.exitCode !== null) throw new Error(`${handle.engine} exited: ${handle.output}`);
    if (ready.test(handle.output)) return;
    if (handle.engine === 'quake2' && await probeQuake2()) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  await stopGame(handle);
  throw new Error(`${handle.engine} did not load ${activeMap}: ${handle.output}`);
}

function probeQuake2() {
  return new Promise(resolve => {
    const socket = dgram.createSocket('udp4');
    const timer = setTimeout(() => { socket.close(); resolve(false); }, 250);
    socket.once('message', packet => {
      clearTimeout(timer);
      socket.close();
      resolve(packet.length > 5 && packet.readInt32LE(0) === -1);
    });
    socket.once('error', () => {
      clearTimeout(timer);
      socket.close();
      resolve(false);
    });
    socket.send(Buffer.from([255, 255, 255, 255, 115, 116, 97, 116, 117, 115, 10]), Q2_PORT, '127.0.0.1');
  });
}

async function stopGame(handle) {
  (handle.engine === 'quake2' ? quake2Proxy : quakeProxy)?.closeAll(1012, 'game server sleeping');
  handle.stopping = true;
  if (handle.child.exitCode === null) {
    await new Promise(resolve => {
      const timer = setTimeout(() => handle.child.kill('SIGKILL'), 3000);
      handle.child.once('exit', () => { clearTimeout(timer); resolve(); });
      handle.child.kill('SIGTERM');
    });
  }
  fs.rmSync(handle.workdir, { recursive: true, force: true });
  nativePlayers.clear();
}

const lifecycle = new IdleServiceSupervisor({
  ...environmentOptions(process.env), maps: [], start: startGame,
  waitUntilReady, stop: stopGame,
  onStatus: status => process.stdout.write(`idtech2 ${activeEngine} state=${status.state} humans=${status.humans}\n`)
});

async function ensureEngine(engine, context) {
  const requested = engine === 'quake2' ? 'quake2' : 'quake';
  const requestedExpansion = requested === 'quake2' && ['xatrix', 'rogue'].includes(context?.expansion)
    ? context.expansion
    : '';
  const requestedMode = context?.mode === 'campaign' ? 'campaign' : 'deathmatch';
  const requestedMap = String(context?.map || activeMap);
  const configurationChanged = requested === 'quake2' &&
    (activeExpansion !== requestedExpansion || activeMode !== requestedMode || activeMap !== requestedMap);
  if (lifecycle.status().state !== 'sleeping' && (activeEngine !== requested || configurationChanged)) {
    await lifecycle.sleep(`switching from ${activeEngine} to ${requested}`);
  }
  return lifecycle.wake({ ...(context || {}), engine: requested });
}

function publicStatus() {
  const quake2 = activeEngine === 'quake2';
  const relay = quake2 ? quake2Proxy?.stats() : quakeProxy?.stats();
  return Object.freeze({
    ...lifecycle.status(), engine: activeEngine, map: activeMap, bots: activeBots,
    expansion: activeExpansion || null, mode: activeMode,
    connect: quake2 ? `127.0.0.1:${Q2_PORT}` : `127.0.0.1:${Q1_PORT}`,
    wsPath: quake2 ? '/ws/quake2' : '/ws/quake',
    players: Array.from(nativePlayers).sort(),
    peers: quake2 ? (quake2Proxy?.peerCount() || 0) : (quakeProxy?.peerCount() || 0),
    relay: relay || { clientPackets: 0, serverPackets: 0 }
  });
}

const staticServer = spawn(process.execPath, [path.join(FRAMEWORK_ROOT, 'server/static-server.js')], {
  env: { ...process.env, WASM_GAME_VARIANT: process.env.WASM_GAME_VARIANT || 'suite',
    WASM_GAME_HTTP_PORT: String(STATIC_PORT), WASM_GAME_SITE_ROOT: SITE_ROOT,
    WASM_GAME_SHELL_ROOT: process.env.WASM_GAME_SHELL_ROOT || path.join(FRAMEWORK_ROOT, 'dist') },
  stdio: ['ignore', 'inherit', 'inherit']
});

function proxyHttp(request, response) {
  const proxy = http.request({ host: '127.0.0.1', port: STATIC_PORT, method: request.method,
    path: request.url, headers: request.headers }, upstream => {
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
    if (bytes > 4096) throw Object.assign(new Error('Wake metadata is too large.'), { statusCode: 413 });
    chunks.push(chunk);
  }
  if (!bytes) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch (_) {
    throw Object.assign(new Error('Wake metadata must be JSON.'), { statusCode: 400 });
  }
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname === '/health' && request.method === 'GET') return json(response, 200, { ok: true, state: lifecycle.status().state });
    if ((url.pathname === '/status' || url.pathname === '/config.json') && request.method === 'GET') return json(response, 200, publicStatus());
    if (url.pathname === '/wake' && request.method === 'POST') {
      const metadata = await readJson(request);
      if (metadata.engine && !['quake', 'quake2'].includes(metadata.engine)) throw Object.assign(new Error('Unsupported id Tech 2 engine.'), { statusCode: 409 });
      await ensureEngine(metadata.engine || 'quake', { ...metadata, reason: 'browser launch' });
      return json(response, 200, publicStatus());
    }
    if (url.pathname === '/wake') return json(response, 405, { error: 'Method not allowed.' });
    proxyHttp(request, response);
  } catch (error) {
    json(response, error.statusCode || 500, { error: error.message || String(error) });
  }
});

quakeProxy = attachDatagramWebSocketProxy(server, {
  path: '/ws/quake', protocol: 'netquake', destinationPort: Q1_PORT,
  ensureDedicated: reason => ensureEngine('quake', { reason, map: activeMap, bots: activeBots }),
  onPeers: humans => { if (activeEngine === 'quake') lifecycle.observeHumans(humans); }
});
quake2Proxy = attachDatagramWebSocketProxy(server, {
  path: '/ws/quake2', protocol: 'quake2', destinationPort: Q2_PORT,
  ensureDedicated: reason => ensureEngine('quake2', {
    reason, map: activeMap, bots: activeBots, expansion: activeExpansion, mode: activeMode
  }),
  onPeers: humans => { if (activeEngine === 'quake2') lifecycle.observeHumans(humans); }
});

let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  quakeProxy.closeAll(1012, 'server shutdown');
  quake2Proxy.closeAll(1012, 'server shutdown');
  server.close();
  staticServer.kill('SIGTERM');
  await lifecycle.sleep('shutdown').catch(() => undefined);
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
server.listen(PUBLIC_PORT, '0.0.0.0', () => process.stdout.write(`id Tech 2 supervisor listening on ${PUBLIC_PORT}\n`));
