#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { serveOwnerFile: serveOwnerBytes } = require('./owner-file');

const root = path.resolve(__dirname, '..');
const frameworkRoot = process.env.WASM_GAME_FRAMEWORK_ROOT
  || process.env.WASM_FRAMEWORK_DIR
  || (fs.existsSync('/home/ted/Development/wasm-game-framework')
    ? '/home/ted/Development/wasm-game-framework'
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
const combinedRoot = process.env.HL2_COMBINED_ROOT || '/home/ted/wasm-game-data/source/hl2-combined';
const gotyRoot = process.env.HL2_GOTY_ROOT || '/home/ted/wasm-game-data/source/hl2-dvd';
process.env.WASM_GAME_SITE_ROOT = process.env.WASM_GAME_SITE_ROOT || path.join(root, 'web');
process.env.WASM_GAME_SHELL_ROOT = process.env.WASM_GAME_SHELL_ROOT
  || path.join(frameworkRoot, 'dist');
process.env.WASM_GAME_DATA_ROOT = process.env.WASM_GAME_DATA_ROOT
  || process.env.HL2_OWNER_ROOT
  || (fs.existsSync(path.join(combinedRoot, 'hl2', 'gameinfo.txt')) ? combinedRoot : '')
  || (fs.existsSync(path.join(gotyRoot, 'hl2', 'gameinfo.txt')) ? gotyRoot : '')
  || (fs.existsSync(path.join(steamRoot, 'hl2', 'gameinfo.txt')) ? steamRoot : '')
  || (fs.existsSync(path.join(portalRoot, 'portal', 'gameinfo.txt')) ? portalRoot : path.join(root, '.data'));

const publicPort = Number(process.env.WASM_GAME_HTTP_PORT || 8088);
const vendorPort = Number(process.env.WASM_GAME_VENDOR_PORT || publicPort + 113);
if (![publicPort, vendorPort].every(port => Number.isInteger(port) && port >= 1 && port <= 65535)
    || publicPort === vendorPort) {
  throw new Error('Public and framework ports must be distinct integers between 1 and 65535.');
}
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
  if (generated.status !== 0) process.exit(generated.status || 1);
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
let shuttingDown = false;
let shutdownCode = 0;
let shutdownTimer;
function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  shutdownCode = code;
  server.close();
  server.closeAllConnections();
  if (vendor.exitCode !== null || vendor.signalCode !== null) process.exit(code);
  shutdownTimer = setTimeout(() => {
    vendor.kill('SIGKILL');
    process.exit(shutdownCode);
  }, 3000);
  vendor.kill('SIGTERM');
}
vendor.on('error', () => shutdown(1));
vendor.on('exit', () => {
  if (shuttingDown) { clearTimeout(shutdownTimer); process.exit(shutdownCode); }
  // A static child exiting successfully is still an unexpected service loss.
  shutdown(1);
});
process.once('SIGTERM', () => shutdown(0));
process.once('SIGINT', () => shutdown(0));

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
  return base.startsWith('.') || base === 'glshaders.cfg' || /\.(dll|exe|so|dylib|asi)(?:$|[_-]\d+$)/i.test(base);
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
  if (!rel || rel === '.') return null;
  const normalized = path.posix.normalize(rel);
  if (!normalized || normalized === '.' || normalized === '..' || normalized.startsWith('../')) return null;
  if (normalized.split('/').some(blockedName)) return null;
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
  return serveOwnerBytes(request, response, abs, isolationHeaders);
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
  response.once('close', () => forwarded.destroy());
  request.pipe(forwarded);
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://127.0.0.1');
    const isOwnerRoute = url.pathname === '/owner-index' || url.pathname.startsWith('/owner/');
    if (isOwnerRoute && ownerPasswordGate && !ownerPasswordGate.require(request, response)) return;
    if (isOwnerRoute && !['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405, isolationHeaders({ Allow: 'GET, HEAD', 'Content-Length': 0 }));
      return response.end();
    }
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
      return await serveOwnerFile(request, response, resolved.real);
    }
    if (url.pathname === '/owner-stat' || url.pathname === '/owner-list') {
      return json(response, 404, { error: 'Not found.' });
    }
    return proxyVendor(request, response);
  } catch (error) {
    if (!response.headersSent) json(response, ['ENOENT', 'ELOOP'].includes(error.code) ? 404 : 500, { error: 'Owner request failed.' });
    else response.destroy(error);
  }
});

server.on('error', () => shutdown(1));

server.listen(publicPort, '0.0.0.0', () => {
  console.log(`source-wasm: owner files from ${dataRoot} on tcp/${publicPort}; framework shell on tcp/${vendorPort}`);
});
