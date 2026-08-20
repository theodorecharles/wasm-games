'use strict';

const fs = require('fs');
const crypto = require('crypto');
const http = require('http');
const path = require('path');

const {
  connectionAddress,
  createAdminController,
  createBanStore,
  isAdminRequest
} = require('./admin');
const dedicated = require('./dedicated');
const lifecycleConfig = require('./lifecycle');
const { sendRcon } = require('./rcon');
const { attachWsProxy } = require('./ws-proxy');
const { startSupervisor } = require('./supervisor');
const { queryStatus } = require('./status');

const ROOT = path.join(__dirname, '..');
const WEB_ROOT = path.join(ROOT, 'web');
const FRAMEWORK_ROOT = process.env.WASM_GAME_FRAMEWORK_WEB_ROOT || path.join(ROOT, '.generated', 'shared-shell');
const FRAMEWORK_DOCUMENT = path.join(FRAMEWORK_ROOT, 'index.html');
const FRAMEWORK_RUNTIME_ROOT = process.env.WASM_GAME_FRAMEWORK_RUNTIME_ROOT ||
  path.join(ROOT, '.generated', 'framework-runtime');
if (process.env.WASM_GAME_PASSWORD && !process.env.WASM_GAME_SESSION_SECRET) {
  process.env.WASM_GAME_SESSION_SECRET = crypto.randomBytes(32).toString('base64url');
}
const { createPasswordGate } = require(path.join(FRAMEWORK_RUNTIME_ROOT, 'password-auth.js'));
const PWA_MANIFEST_PATH = path.join(FRAMEWORK_RUNTIME_ROOT, 'app.webmanifest');
const SERVICE_WORKER_PATH = path.join(FRAMEWORK_RUNTIME_ROOT, 'service-worker.js');
const DATA_WEB_ROOT = path.join(dedicated.DATA_ROOT, 'web');
const HTTP_PORT = Number(process.env.ETJS_HTTP_PORT || 8088);
const DED_PORT = dedicated.HOST_UDP_PORT;
const RCON = dedicated.RCON_PASSWORD;
const CONNECTION_REGISTRY = new Map();
const BAN_STORE = createBanStore(path.join(dedicated.RUNTIME_ROOT, '.admin-bans.json'));
const RUN_ADMIN_COMMAND = createAdminController({
  registry: CONNECTION_REGISTRY,
  banStore: BAN_STORE,
  maps: dedicated.objectiveMaps,
  sendRcon: (command) => sendRcon(command, {
    host: '127.0.0.1',
    port: DED_PORT,
    password: RCON
  })
});
const GAME_ASSET_DEFS = [
  { parent: '/etmain', name: 'pak0.pk3', hash: '712966b20e06523fe81419516500e499c86b2b4fec823856ddbd333fcb3d26e5' },
  { parent: '/etmain', name: 'pak1.pk3', hash: '5610fd749024405b4425a7ce6397e58187b941d22092ef11d4844b427df53e5d' },
  { parent: '/etmain', name: 'pak2.pk3', hash: 'a48ab749a1a12ab4d9137286b1f23d642c29da59845b2bafc8f64e052cf06f3e' },
  { parent: '/etmain', name: 'mp_bin.pk3', hash: 'cf0a7ce662421c766f93cc196841849eb66905b047d209dd5f3ed0b1396cd42e' },
  { parent: '/legacy', name: 'legacy_v2.84.0.pk3', hash: 'd1abab70f6e3e3af8f34dfb4d94542c8bd592b0a1a582f0107d2162ee23c679b' },
  { parent: '/legacy', name: 'etjs.pk3', hash: dedicated.ETJS_PAK_HASH }
];
let RUNTIME_LIFECYCLE = null;
const PASSWORD_GATE = createPasswordGate();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.wasm': 'application/wasm',
  '.data': 'application/octet-stream',
  '.pk3': 'application/octet-stream',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.map': 'application/json',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.ttf': 'font/ttf'
};

function log(msg) {
  const line = '[' + new Date().toISOString() + '] ' + msg;
  console.log(line);
}

function safeJoin(root, reqPath) {
  const decoded = decodeURIComponent((reqPath || '/').split('?')[0]);
  const rel = decoded.replace(/^\/+/, '');
  const full = path.normalize(path.join(root, rel));
  if (full !== root && !full.startsWith(root + path.sep)) {
    return null;
  }
  return full;
}

function gameAssets() {
  return GAME_ASSET_DEFS.concat(dedicated.customGameAssets()).map((def) => {
    const base = def.parent === '/etmain'
      ? path.join(dedicated.RUNTIME_ROOT, 'etmain')
      : path.join(dedicated.RUNTIME_ROOT, 'legacy');
    const filePath = def.filePath || path.join(base, def.name);
    const bytes = def.bytes || fs.statSync(filePath).size;
    return {
      key: (def.parent.slice(1) + '-' + def.name).toLowerCase(),
      parent: def.parent,
      name: def.name,
      url: def.parent + '/' + def.name + '?v=' + def.hash.slice(0, 16),
      bytes: bytes,
      sha256: def.hash,
      cacheKey: def.name + '@sha256:' + def.hash
    };
  });
}

function sendFile(req, res, filePath, extraHeaders) {
  const ext = path.extname(filePath).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  const stat = fs.statSync(filePath);
  const headers = Object.assign({
    'content-type': type,
    'accept-ranges': 'bytes',
    'cache-control': ext === '.pk3' || ext === '.data'
      ? 'public, max-age=3600'
      : (ext === '.js' || ext === '.wasm' ? 'no-store' : 'no-cache')
  }, extraHeaders || {});
  const range = req.headers && req.headers.range;
  if (range) {
    const match = /^bytes=(\d+)-(\d*)$/.exec(range);
    const start = match ? Number(match[1]) : -1;
    const requestedEnd = match && match[2] ? Number(match[2]) : stat.size - 1;
    if (!match || !Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd) ||
        start < 0 || start >= stat.size || requestedEnd < start) {
      res.writeHead(416, Object.assign(headers, { 'content-range': 'bytes */' + stat.size }));
      res.end();
      return;
    }
    const end = Math.min(requestedEnd, stat.size - 1);
    headers['content-range'] = 'bytes ' + start + '-' + end + '/' + stat.size;
    headers['content-length'] = String(end - start + 1);
    res.writeHead(206, headers);
    if (req.method === 'HEAD') {
      res.end();
    } else {
      fs.createReadStream(filePath, { start: start, end: end }).pipe(res);
    }
    return;
  }
  headers['content-length'] = String(stat.size);
  res.writeHead(200, headers);
  if (req.method === 'HEAD') {
    res.end();
  } else {
    fs.createReadStream(filePath).pipe(res);
  }
}

function serveStatic(req, res) {
  const urlPath = (req.url || '/').split('?')[0];

  if (urlPath === '/data' || urlPath.startsWith('/data/') ||
      urlPath === '/local-data' || urlPath.startsWith('/local-data/')) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
    res.end('not found');
    return;
  }

  if ((urlPath === '/' || urlPath === '/index.html') && (req.method === 'GET' || req.method === 'HEAD')) {
    sendFile(req, res, FRAMEWORK_DOCUMENT);
    return;
  }

  if (urlPath === '/wasm-game-config.js' && (req.method === 'GET' || req.method === 'HEAD')) {
    const body = Buffer.from('globalThis.WASM_GAME_VARIANT = "wolfet";\n');
    res.writeHead(200, {
      'content-type': 'text/javascript; charset=utf-8',
      'content-length': String(body.length),
      'cache-control': 'no-store'
    });
    if (req.method === 'HEAD') { res.end(); } else { res.end(body); }
    return;
  }

  if (urlPath === '/app.webmanifest' && (req.method === 'GET' || req.method === 'HEAD')) {
    sendFile(req, res, PWA_MANIFEST_PATH);
    return;
  }

  if (urlPath === '/service-worker.js' && (req.method === 'GET' || req.method === 'HEAD')) {
    sendFile(req, res, SERVICE_WORKER_PATH, { 'service-worker-allowed': '/' });
    return;
  }

  if (urlPath === '/game-data/status' && req.method === 'GET') {
    const files = gameAssets().map((file) => ({
      key: file.key,
      path: file.parent.slice(1) + '/' + file.name,
      name: file.name,
      names: [file.name],
      size: file.bytes,
      sha256: file.sha256,
      required: true,
      valid: true
    }));
    const body = Buffer.from(JSON.stringify({
      configured: true,
      namespace: 'wolfet-official',
      version: files.map((file) => file.sha256).join(':'),
      ready: true,
      files: files,
      setupTokenRequired: false
    }));
    res.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
      'content-length': String(body.length),
      'cache-control': 'no-store'
    });
    res.end(body);
    return;
  }

  const gameDataFile = /^\/game-data\/files\/([a-z0-9._-]+)$/.exec(urlPath);
  if (gameDataFile && (req.method === 'GET' || req.method === 'HEAD')) {
    const asset = gameAssets().find((file) => file.key === gameDataFile[1]);
    if (!asset) {
      res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Unknown game-data file.' }));
      return;
    }
    const base = asset.parent === '/etmain'
      ? path.join(dedicated.RUNTIME_ROOT, 'etmain')
      : path.join(dedicated.RUNTIME_ROOT, 'legacy');
    sendFile(req, res, asset.filePath || path.join(base, asset.name));
    return;
  }
  if (urlPath.startsWith('/game-data/setup/')) {
    res.writeHead(405, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Official WolfET data is provisioned by the server.' }));
    return;
  }

  if (urlPath === '/client-log') {
    if (req.method !== 'POST') {
      res.writeHead(405, { 'content-type': 'application/json', allow: 'POST' });
      res.end(JSON.stringify({ ok: false, error: 'POST required' }));
      return;
    }
    const chunks = [];
    let bytes = 0;
    req.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes <= 8192) {
        chunks.push(chunk);
      }
    });
    req.on('end', () => {
      try {
        if (bytes > 8192) {
          throw new Error('request is too large');
        }
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
        const safe = {
          sequence: Number(body.sequence) || 0,
          event: String(body.event || '').slice(0, 40),
          detail: Object.fromEntries(Object.entries(body)
            .filter(([key]) => !['sequence', 'event', 'time'].includes(key))
            .slice(0, 24))
        };
        log('client communication ' + JSON.stringify(safe));
        res.writeHead(204, { 'cache-control': 'no-store' });
        res.end();
      } catch (err) {
        res.writeHead(400, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return;
  }

  if (urlPath === '/health') {
    if (PASSWORD_GATE.required) {
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(Object.assign({ ok: true, dedicatedPort: DED_PORT },
      RUNTIME_LIFECYCLE ? RUNTIME_LIFECYCLE.status() : { state: 'unmanaged' })));
    return;
  }

  if (urlPath === '/status') {
    if (RUNTIME_LIFECYCLE && RUNTIME_LIFECYCLE.status().state !== 'running') {
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify(Object.assign({ sleeping: true, players: [] }, RUNTIME_LIFECYCLE.status())));
      return;
    }
    queryStatus({ host: '127.0.0.1', port: DED_PORT })
      .then((st) => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(st));
      })
      .catch((err) => {
        res.writeHead(503, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      });
    return;
  }

  if (urlPath === '/wake') {
    if (req.method !== 'POST') {
      res.writeHead(405, { 'content-type': 'application/json', allow: 'POST' });
      res.end(JSON.stringify({ ok: false, error: 'POST required' }));
      return;
    }
    if (!RUNTIME_LIFECYCLE) {
      res.writeHead(503, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ ok: false, error: 'dedicated server lifecycle is unavailable' }));
      return;
    }
    RUNTIME_LIFECYCLE.wake('browser Play button').then((status) => {
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify(Object.assign({ ok: true }, status)));
    }).catch((err) => {
      res.writeHead(503, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ ok: false, error: err.message }));
    });
    return;
  }

  if (urlPath === '/config.json') {
    const admin = isAdminRequest(req);
    const config = {
      connect: '127.0.0.1:' + DED_PORT,
      wsPath: '/ws',
      httpPort: HTTP_PORT,
      map: (RUNTIME_LIFECYCLE && RUNTIME_LIFECYCLE.status().map) || dedicated.objectiveMaps()[0],
      gametype: 2,
      mode: dedicated.MODE,
      slots: dedicated.MATCH_SLOTS,
      rotation: dedicated.objectiveMaps(),
      assets: gameAssets(),
      server: RUNTIME_LIFECYCLE ? RUNTIME_LIFECYCLE.status() : { state: 'unmanaged' }
    };
    if (admin) {
      config.admin = true;
    }
    res.writeHead(200, {
      'content-type': 'application/json',
      'cache-control': 'no-store'
    });
    res.end(JSON.stringify(config));
    return;
  }

  if (urlPath === '/admin') {
    if (req.method !== 'POST') {
      res.writeHead(405, { 'content-type': 'application/json', allow: 'POST' });
      res.end(JSON.stringify({ ok: false, error: 'POST required' }));
      return;
    }
    if (!isAdminRequest(req)) {
      res.writeHead(403, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ ok: false, error: 'local server administration only' }));
      return;
    }
    const chunks = [];
    let bytes = 0;
    req.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes <= 8192) {
        chunks.push(chunk);
      }
    });
    req.on('end', async () => {
      try {
        if (bytes > 8192) {
          throw new Error('request is too large');
        }
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
        if (RUNTIME_LIFECYCLE) {
          await RUNTIME_LIFECYCLE.wake('local administration');
        }
        const message = await RUN_ADMIN_COMMAND(body.command);
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        res.end(JSON.stringify({ ok: true, message: message }));
      } catch (err) {
        res.writeHead(400, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return;
  }

  const searchRoots = [
    { prefix: '/etmain/', root: path.join(dedicated.RUNTIME_ROOT, 'etmain'), strip: '/etmain/' },
    { prefix: '/legacy/', root: path.join(dedicated.RUNTIME_ROOT, 'legacy'), strip: '/legacy/' },
    { prefix: '/client/', root: path.join(ROOT, 'web', 'client'), strip: '/client/' },
    { prefix: '/img/', root: path.join(WEB_ROOT, 'img'), strip: '/img/' },
    { prefix: '/img/', root: path.join(DATA_WEB_ROOT, 'img'), strip: '/img/' },
    { prefix: '/sound/music/', root: path.join(DATA_WEB_ROOT, 'sound', 'music'), strip: '/sound/music/' },
    { prefix: '/shared-shell/', root: FRAMEWORK_ROOT, strip: '/shared-shell/' },
    { prefix: '/', root: WEB_ROOT, strip: '/' }
  ];

  for (let i = 0; i < searchRoots.length; i++) {
    const entry = searchRoots[i];
    if (urlPath !== '/' && !urlPath.startsWith(entry.prefix) && entry.prefix !== '/') {
      continue;
    }
    let rel = urlPath === '/' ? 'index.html' : urlPath.slice(entry.strip.length);
    if (!rel || rel.endsWith('/')) {
      rel += 'index.html';
    }
    const filePath = safeJoin(entry.root, rel);
    if (filePath && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      sendFile(req, res, filePath);
      return;
    }
  }

  // Canonical framework document owns every browser route.
  if (fs.existsSync(FRAMEWORK_DOCUMENT)) {
    sendFile(req, res, FRAMEWORK_DOCUMENT);
    return;
  }
  res.writeHead(404, { 'content-type': 'text/plain' });
  res.end('not found');
}

function passwordProtectedPath(urlPath) {
  return urlPath === '/status' || urlPath === '/wake' || urlPath === '/config.json' ||
    urlPath === '/admin' || urlPath === '/client-log' ||
    urlPath === '/game-data' || urlPath.startsWith('/game-data/') ||
    urlPath === '/game-adapter.js' || urlPath.startsWith('/client/') ||
    urlPath.startsWith('/etmain/') || urlPath.startsWith('/legacy/') ||
    urlPath.startsWith('/js/') || urlPath.startsWith('/sound/');
}

function startHttp(port) {
  const server = http.createServer(async (req, res) => {
    res.setHeader('cross-origin-opener-policy', 'same-origin');
    res.setHeader('cross-origin-embedder-policy', 'require-corp');
    res.setHeader('cross-origin-resource-policy', 'same-origin');
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('referrer-policy', 'same-origin');
    try {
      const url = new URL(req.url, 'http://localhost');
      if (await PASSWORD_GATE.handle(req, res, url)) return;
      if (passwordProtectedPath(url.pathname) && !PASSWORD_GATE.require(req, res)) return;
      serveStatic(req, res);
    } catch (error) {
      if (!res.headersSent) {
        res.writeHead(error.statusCode || 500, {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store'
        });
        res.end(JSON.stringify({ error: error.message || 'Internal server error.' }));
      } else {
        res.destroy(error);
      }
    }
  });
  attachWsProxy(server, {
    destHost: '127.0.0.1',
    destPort: DED_PORT,
    path: '/ws',
    registry: CONNECTION_REGISTRY,
    banStore: BAN_STORE,
    clientAddress: (req) => connectionAddress(req, process.env.ETJS_TRUST_PROXY === '1'),
    authorizeUpgrade: (req) => PASSWORD_GATE.authenticated(req),
    ensureDedicated: RUNTIME_LIFECYCLE
      ? (reason) => RUNTIME_LIFECYCLE.wake(reason)
      : null
  });
  return new Promise((resolve) => {
    server.listen(typeof port === 'number' ? port : HTTP_PORT, '0.0.0.0', () => {
      const boundPort = server.address().port;
      log('website listening on http://0.0.0.0:' + boundPort);
      log('websocket game proxy on ws://0.0.0.0:' + boundPort + '/ws -> udp 127.0.0.1:' + DED_PORT);
      resolve(server);
    });
  });
}

async function waitForDedicated(timeoutMs, isRunning) {
  const deadline = Date.now() + (timeoutMs || 60000);
  let lastErr = null;
  while (Date.now() < deadline) {
    if (isRunning && !isRunning()) {
      throw new Error('dedicated server process exited during startup');
    }
    try {
      const st = await queryStatus({ host: '127.0.0.1', port: DED_PORT, timeoutMs: 1500 });
      return st;
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw new Error('dedicated server did not become ready: ' + (lastErr && lastErr.message));
}

async function startDedicatedWithFallback(options) {
  const opts = options || {};
  let remaining = (opts.maps || []).slice();
  let lastError = null;

  while (remaining.length) {
    const selected = await opts.choose(remaining.slice());
    const key = String(selected || '').toLowerCase();
    remaining = remaining.filter((name) => String(name).toLowerCase() !== key);
    try {
      return { map: selected, status: await opts.start(selected) };
    } catch (err) {
      lastError = err;
      if (opts.log) {
        opts.log('map startup failed map=' + selected + ': ' + err.message);
      }
      if (opts.stop) {
        await opts.stop();
      }
      if (opts.reject) {
        await opts.reject(selected, err);
      }
    }
  }
  throw lastError || new Error('no Objective maps are available');
}

async function main() {
  log('wolfet-wasm starting');
  log('validating server-side game data');
  const custom = dedicated.ensureGameData();
  dedicated.assertServerMod();
  log('official paks ready for same-origin browser delivery: ' + dedicated.RUNTIME_ETMAIN);
  log('mode=' + dedicated.MODE + ' match population=' + dedicated.MATCH_SLOTS +
    ' custom PK3s=' + custom.assets.length +
    ' objective maps=' + custom.maps.length);

  let lastFillSummary = '';
  let supervisor = null;

  const stopSupervisor = () => {
    if (supervisor) {
      supervisor.stop();
      supervisor = null;
    }
  };
  const startGameSupervisor = () => {
    stopSupervisor();
    lastFillSummary = '';
    supervisor = startSupervisor({
      host: '127.0.0.1',
      port: DED_PORT,
      password: RCON,
      intervalMs: 1500,
      manageBots: dedicated.OMNIBOT_ENABLED,
      log: log,
      onTick: (result) => {
        RUNTIME_LIFECYCLE.observeHumans(result.state.humans);
        const summary = 'fill humans=' + result.state.humans + ' bots=' + result.state.bots +
          ' target=' + result.plan.target + ' add=' + result.plan.add + ' remove=' + result.plan.remove;
        if (summary !== lastFillSummary || result.plan.add || result.plan.remove) {
          log(summary);
          lastFillSummary = summary;
        }
      }
    });
  };

  if (process.env.ETJS_SKIP_DED !== '1') {
    RUNTIME_LIFECYCLE = lifecycleConfig.createLifecycle({
      keepAlive: lifecycleConfig.KEEP_ALIVE,
      idleTimeoutMs: lifecycleConfig.IDLE_TIMEOUT_SECONDS * 1000,
      isRunning: dedicated.containerRunning,
      log: log,
      start: async () => {
        stopSupervisor();
        if (dedicated.containerRunning()) {
          dedicated.stopDedicated();
          await dedicated.waitForDedicatedStopped(15000);
        }
        const started = await startDedicatedWithFallback({
          maps: dedicated.objectiveMaps(),
          choose: (maps) => dedicated.chooseStartMap({ maps: maps }),
          start: async (startMap) => {
            log((dedicated.EMBEDDED ? 'starting embedded ET: Legacy server' : 'starting dedicated server') +
              ' on udp/' + DED_PORT + ' map=' + startMap);
            dedicated.startDedicated({ map: startMap });
            return waitForDedicated(30000, dedicated.containerRunning);
          },
          stop: async () => {
            dedicated.stopDedicated();
            await dedicated.waitForDedicatedStopped(15000);
          },
          reject: (startMap) => {
            if (dedicated.disableObjectiveMap(startMap)) {
              log('disabled incompatible custom map for this host run: ' + startMap);
            }
          },
          log: log
        });
        const startMap = started.map;
        const st = started.status;
        log('dedicated ready map=' + st.map + ' gametype=' + st.gametype + ' players=' + st.players.length);
        startGameSupervisor();
        return { map: st.map || startMap };
      },
      stop: async () => {
        stopSupervisor();
        dedicated.stopDedicated();
        await dedicated.waitForDedicatedStopped(15000);
      }
    });
  }

  const httpServer = await startHttp();

  if (RUNTIME_LIFECYCLE) {
    RUNTIME_LIFECYCLE.startMonitoring();
    if (lifecycleConfig.KEEP_ALIVE) {
      await RUNTIME_LIFECYCLE.wake('KEEP_ALIVE=true startup');
    } else {
      log('dedicated server sleeping until browser Play; idle timeout=' +
        lifecycleConfig.IDLE_TIMEOUT_SECONDS + 's');
    }
  }

  if (!dedicated.OMNIBOT_ENABLED) {
    log('Omni-Bot disabled; automatic bot fill is inactive');
  }

  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    log('shutting down');
    stopSupervisor();
    if (RUNTIME_LIFECYCLE && process.env.ETJS_KEEP_DED !== '1') {
      try { await RUNTIME_LIFECYCLE.shutdown(); } catch (err) { log('shutdown: ' + err.message); }
    }
    await new Promise((resolve) => httpServer.close(resolve));
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = {
  main: main,
  gameAssets: gameAssets,
  sendFile: sendFile,
  serveStatic: serveStatic,
  startHttp: startHttp,
  waitForDedicated: waitForDedicated,
  startDedicatedWithFallback: startDedicatedWithFallback,
  passwordProtectedPath: passwordProtectedPath,
  setLifecycleForTests: function (lifecycle) { RUNTIME_LIFECYCLE = lifecycle; }
};
