#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const frameworkRoot = process.env.WASM_GAME_FRAMEWORK_ROOT
  || (fs.existsSync(path.join(root, 'vendor', 'wasm-game-framework'))
    ? path.join(root, 'vendor', 'wasm-game-framework')
    : '/opt/wasm-game-framework');
const passwordAuthPath = path.join(frameworkRoot, 'server', 'password-auth.js');
if (!fs.existsSync(passwordAuthPath)) {
  throw new Error(`wasm-game-framework password-auth.js is missing at ${passwordAuthPath}`);
}
const { createPasswordGate } = require(passwordAuthPath);
const steamRoot = process.env.HL2_STEAM_ROOT
  || '/home/ted/.steam/debian-installation/steamapps/common/Half-Life 2';
const portalRoot = process.env.PORTAL_STEAM_ROOT
  || '/home/ted/.steam/debian-installation/steamapps/common/Portal';
const combinedRoot = process.env.HL2_COMBINED_ROOT || '/home/ted/.local/share/source-wasm/hl2-combined';
const gotyRoot = process.env.HL2_GOTY_ROOT || '/home/ted/.local/share/source-wasm/hl2-dvd';
process.env.WASM_GAME_SITE_ROOT = process.env.WASM_GAME_SITE_ROOT || path.join(root, 'web');
process.env.WASM_GAME_SHELL_ROOT = process.env.WASM_GAME_SHELL_ROOT
  || path.join(root, 'vendor', 'wasm-game-framework', 'dist');
process.env.WASM_GAME_DATA_ROOT = process.env.WASM_GAME_DATA_ROOT
  || process.env.HL2_OWNER_ROOT
  || (fs.existsSync(path.join(combinedRoot, 'hl2', 'gameinfo.txt')) ? combinedRoot : '')
  || (fs.existsSync(path.join(gotyRoot, 'hl2', 'gameinfo.txt')) ? gotyRoot : '')
  || (fs.existsSync(path.join(steamRoot, 'hl2', 'gameinfo.txt')) ? steamRoot : '')
  || (fs.existsSync(path.join(portalRoot, 'portal', 'gameinfo.txt')) ? portalRoot : path.join(root, '.data'));

const publicPort = Number(process.env.WASM_GAME_HTTP_PORT || 8088);
const vendorPort = Number(process.env.WASM_GAME_VENDOR_PORT || publicPort + 113);
const dataRoot = path.resolve(process.env.WASM_GAME_DATA_ROOT);
const stubPath = path.join(process.env.WASM_GAME_SITE_ROOT, 'wasm-game-data.json');
let dataRootReal = null;
try { dataRootReal = fs.realpathSync(dataRoot); } catch (_) {}

if (process.env.WASM_GAME_PASSWORD && !process.env.WASM_GAME_SESSION_SECRET) {
  throw new Error('WASM_GAME_SESSION_SECRET is required when WASM_GAME_PASSWORD protects owner data; use the same secret for both servers.');
}

if (!fs.existsSync(stubPath)) {
  const generated = spawnSync(process.execPath, [path.join(root, 'scripts', 'generate-game-data.mjs')], {
    stdio: 'inherit'
  });
  if (generated.status) process.exit(generated.status);
}

function vendorStaticServer() {
  const candidates = [
    process.env.WASM_GAME_FRAMEWORK_SERVER,
    path.join(frameworkRoot, 'server', 'static-server.js'),
    '/opt/wasm-game-framework/server/static-server.js'
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error('wasm-game-framework static-server.js is missing');
}

process.env.WASM_GAME_HTTP_PORT = String(vendorPort);
const vendor = spawn(process.execPath, [vendorStaticServer()], { stdio: 'inherit' });
vendor.on('exit', (code) => process.exit(code || 0));

function isolationHeaders(extra) {
  return {
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
    'X-Content-Type-Options': 'nosniff',
    ...extra
  };
}

function blockedName(name) {
  const base = String(name || '').toLowerCase();
  return base === 'glshaders.cfg' || /\.(dll|exe|so|dylib|asi)(?:$|[_-]\d+$)/i.test(base) || base === '.source-wasm-owner.json';
}

let ownerIndexBody = null;
const ownerPasswordGate = process.env.WASM_GAME_PASSWORD
  ? createPasswordGate({ headers: isolationHeaders })
  : null;

// Keep in sync with ownerRootRecipe() in scripts/source-data-policy.mjs.
function detectRecipe(rootDir) {
  if (fs.existsSync(path.join(rootDir, 'portal', 'gameinfo.txt'))) {
    return 'steam-portal-v1';
  }
  if (fs.existsSync(path.join(rootDir, 'hl2', 'hl2_textures_dir.vpk'))) {
    return 'steam-legacy-hl2-v1';
  }
  return 'goty-2014-plus-legacy-shaders-v1';
}

function buildOwnerIndex() {
  const files = [];
  function walk(rel) {
    const abs = rel ? path.join(dataRoot, rel) : dataRoot;
    let names;
    try { names = fs.readdirSync(abs); } catch (_) { return; }
    for (const name of names) {
      if (name === '.' || name === '..' || blockedName(name)) continue;
      const childRel = rel ? `${rel}/${name}` : name;
      const childAbs = path.join(dataRoot, childRel);
      let stat;
      try { stat = fs.lstatSync(childAbs); } catch (_) { continue; }
      if (stat.isSymbolicLink()) continue;
      if (stat.isDirectory()) walk(childRel);
      else if (stat.isFile()) files.push([childRel.replace(/\\/g, '/'), stat.size]);
    }
  }
  walk('');
  return { schema: 1, recipe: detectRecipe(dataRoot), files };
}

function resolveOwner(relRaw) {
  const rel = String(relRaw || '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (!rel || rel === '.') return { abs: dataRoot, rel: '' };
  const normalized = path.posix.normalize(rel);
  if (!normalized || normalized === '.' || normalized === '..' || normalized.startsWith('../')) return null;
  const abs = path.resolve(dataRoot, normalized);
  if (abs !== dataRoot && !abs.startsWith(`${dataRoot}${path.sep}`)) return null;
  if (blockedName(path.basename(abs))) return null;
  let stat;
  try { stat = fs.lstatSync(abs); } catch (_) { return null; }
  if (stat.isSymbolicLink()) return null;
  if (!dataRootReal) return null;
  let real;
  try { real = fs.realpathSync(abs); } catch (_) { return null; }
  if (real !== dataRootReal && !real.startsWith(`${dataRootReal}${path.sep}`)) return null;
  return { abs, rel: normalized, real };
}

function json(response, statusCode, value) {
  const body = Buffer.from(JSON.stringify(value));
  response.writeHead(statusCode, isolationHeaders({
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store'
  }));
  response.end(body);
}

async function serveOwnerFile(request, response, abs) {
  let stat;
  try { stat = await fsp.lstat(abs); } catch (_) {
    return json(response, 404, { error: 'Not found.' });
  }
  if (stat.isSymbolicLink()) return json(response, 404, { error: 'Not found.' });
  if (!stat.isFile()) return json(response, 404, { error: 'Not found.' });
  const range = /^bytes=(\d+)-(\d*)$/.exec(String(request.headers.range || ''));
  let start = 0;
  let end = stat.size - 1;
  let statusCode = 200;
  if (range) {
    start = Number(range[1]);
    end = range[2] ? Math.min(Number(range[2]), end) : end;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= stat.size) {
      response.writeHead(416, isolationHeaders({ 'Content-Range': `bytes */${stat.size}` }));
      response.end();
      return;
    }
    statusCode = 206;
  }
  const headers = isolationHeaders({
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, max-age=3600',
    'Content-Length': end - start + 1,
    'Content-Type': 'application/octet-stream'
  });
  if (statusCode === 206) headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`;
  if (request.method === 'HEAD') {
    response.writeHead(statusCode, headers);
    response.end();
    return;
  }
  // The browser's sync-XHR responseText decode content-sniffs binary and can
  // return corrupt/short data.  b64=1 returns the range base64-encoded (pure
  // ASCII, lossless) for the adapter's synchronous read path.
  if (/[?&]b64=1\b/.test(request.url || '')) {
    const len = end - start + 1;
    const buf = Buffer.alloc(len);
    const fh = await fsp.open(abs, 'r');
    try {
      await fh.read(buf, 0, len, start);
    } finally {
      await fh.close();
    }
    const body = buf.toString('base64');
    response.writeHead(200, isolationHeaders({
      'Content-Type': 'text/plain; charset=us-ascii',
      'Content-Length': Buffer.byteLength(body),
      'Cache-Control': 'private, max-age=3600'
    }));
    response.end(body);
    return;
  }
  response.writeHead(statusCode, headers);
  fs.createReadStream(abs, { start, end }).pipe(response);
}

function proxyVendor(request, response) {
  const forwarded = http.request({
    hostname: '127.0.0.1',
    port: vendorPort,
    path: request.url,
    method: request.method,
    headers: request.headers
  }, (upstream) => {
    response.writeHead(upstream.statusCode || 502, upstream.headers);
    upstream.pipe(response);
  });
  forwarded.on('error', () => {
    if (!response.headersSent) json(response, 502, { error: 'Game shell is not ready.' });
    else response.destroy();
  });
  request.pipe(forwarded);
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://127.0.0.1');
    const isOwnerRoute = url.pathname === '/owner-index' || url.pathname.startsWith('/owner/');
    if (isOwnerRoute && ownerPasswordGate && !ownerPasswordGate.require(request, response)) return;
    if (url.pathname === '/owner-index' && (request.method === 'GET' || request.method === 'HEAD')) {
      if (!ownerIndexBody) ownerIndexBody = Buffer.from(JSON.stringify(buildOwnerIndex()));
      response.writeHead(200, isolationHeaders({
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': ownerIndexBody.length,
        'Cache-Control': 'no-store'
      }));
      return request.method === 'HEAD' ? response.end() : response.end(ownerIndexBody);
    }
    if (url.pathname.startsWith('/owner/') && (request.method === 'GET' || request.method === 'HEAD')) {
      let decoded;
      try { decoded = decodeURIComponent(url.pathname.slice('/owner/'.length)); } catch (_) {
        return json(response, 404, { error: 'Not found.' });
      }
      const resolved = resolveOwner(decoded);
      if (!resolved) return json(response, 404, { error: 'Not found.' });
      return serveOwnerFile(request, response, resolved.abs);
    }
    if (url.pathname === '/owner-stat' || url.pathname === '/owner-list') {
      return json(response, 404, { error: 'Not found.' });
    }
    return proxyVendor(request, response);
  } catch (error) {
    if (!response.headersSent) json(response, 500, { error: error.message || 'Internal server error.' });
    else response.destroy(error);
  }
});

server.listen(publicPort, '0.0.0.0', () => {
  console.log(`source-wasm: owner files from ${dataRoot} on tcp/${publicPort}; framework shell on tcp/${vendorPort}`);
});
