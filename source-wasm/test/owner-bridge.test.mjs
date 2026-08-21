import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const framework = process.env.WASM_FRAMEWORK_DIR || process.env.WASM_GAME_FRAMEWORK_ROOT || '/home/ted/Development/wasm-game-framework';
const passwordAuth = path.join(framework, 'server', 'password-auth.js');

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const port = probe.address().port;
      probe.close(() => resolve(port));
    });
  });
}

function request(port, requestPath, options = {}, body = '') {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: requestPath,
      method: options.method || 'GET',
      headers: options.headers || {}
    }, (response) => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({
        status: response.statusCode,
        headers: response.headers,
        body: Buffer.concat(chunks)
      }));
    });
    req.setTimeout(5000, () => req.destroy(new Error('request timed out')));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function stopProcess(child) {
  if (!child || child.exitCode != null) return;
  try { process.kill(-child.pid, 'SIGTERM'); } catch (_) { child.kill('SIGTERM'); }
  await Promise.race([
    once(child, 'exit'),
    new Promise(resolve => setTimeout(resolve, 3000))
  ]);
  if (child.exitCode == null) {
    try { process.kill(-child.pid, 'SIGKILL'); } catch (_) { child.kill('SIGKILL'); }
  }
}

const tempRoot = await mkdtemp('/tmp/source-wasm-owner-bridge-');
const ownerRoot = path.join(tempRoot, 'owner');
const fakeVendor = path.join(tempRoot, 'vendor.js');
const outsideFile = path.join(tempRoot, 'outside.txt');
const publicPort = await freePort();
const vendorPort = await freePort();
const secret = Buffer.alloc(32, 7).toString('base64url');
let serverProcess;

try {
  await mkdir(path.join(ownerRoot, 'hl2'), { recursive: true });
  await writeFile(path.join(ownerRoot, 'hl2', 'gameinfo.txt'), 'GameInfo\n{\n}\n');
  await writeFile(path.join(ownerRoot, 'hl2', 'steam.inf'), 'PatchVersion=1\n');
  await writeFile(path.join(ownerRoot, 'hl2', 'small.bin'), Buffer.from('0123456789', 'ascii'));
  const large = Buffer.alloc(2 * 1024 * 1024);
  for (let i = 0; i < large.length; i += 1) large[i] = i & 0xff;
  await writeFile(path.join(ownerRoot, 'hl2', 'large.bin'), large);
  await writeFile(path.join(ownerRoot, 'hl2', 'glshaders.cfg'), 'blocked');
  await writeFile(path.join(ownerRoot, 'hl2', 'native.dll'), 'blocked');
  await writeFile(path.join(ownerRoot, 'hl2', 'native.asi'), 'blocked');
  await writeFile(outsideFile, 'outside');
  await symlink(outsideFile, path.join(ownerRoot, 'hl2', 'escape.txt'));

  await writeFile(fakeVendor, `
const http = require('node:http');
const { createPasswordGate } = require(${JSON.stringify(passwordAuth)});
const gate = createPasswordGate();
const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1');
  if (await gate.handle(request, response, url)) return;
  if (url.pathname === '/vendor-probe') {
    response.writeHead(200, { 'Content-Type': 'text/plain' });
    response.end('vendor-ok');
    return;
  }
  response.writeHead(404);
  response.end('not-found');
});
server.listen(Number(process.env.WASM_GAME_HTTP_PORT), '127.0.0.1');
`);

  const env = {
    ...process.env,
    HL2_OWNER_ROOT: ownerRoot,
    WASM_GAME_DATA_ROOT: ownerRoot,
    WASM_GAME_HTTP_PORT: String(publicPort),
    WASM_GAME_VENDOR_PORT: String(vendorPort),
    WASM_GAME_FRAMEWORK_SERVER: fakeVendor,
    WASM_GAME_PASSWORD: 'bridge-password',
    WASM_GAME_SESSION_SECRET: secret
  };
  serverProcess = spawn(process.execPath, [path.join(root, 'scripts', 'start.js')], {
    cwd: root,
    env,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const output = [];
  serverProcess.stdout.on('data', chunk => output.push(String(chunk)));
  serverProcess.stderr.on('data', chunk => output.push(String(chunk)));

  let indexResponse;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      indexResponse = await request(publicPort, '/owner-index');
      if (indexResponse.status === 401 || indexResponse.status === 200) break;
    } catch (_) {
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(indexResponse, `owner bridge did not start: ${output.join('')}`);
  assert.equal(indexResponse.status, 401, 'password gate must protect owner-index');

  let vendorResponse;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      vendorResponse = await request(publicPort, '/vendor-probe');
      if (vendorResponse.status === 200) break;
    } catch (_) {
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(vendorResponse?.status, 200, `framework proxy did not start: ${output.join('')}`);

  const badLogin = await request(publicPort, '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, JSON.stringify({ password: 'wrong' }));
  assert.equal(badLogin.status, 401);

  const login = await request(publicPort, '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, JSON.stringify({ password: 'bridge-password' }));
  assert.equal(login.status, 200);
  const cookie = String(login.headers['set-cookie']?.[0] || '').split(';', 1)[0];
  assert.match(cookie, /^wasm_game_session=/);

  const authHeaders = { Cookie: cookie };
  indexResponse = await request(publicPort, '/owner-index', { headers: authHeaders });
  assert.equal(indexResponse.status, 200);
  const index = JSON.parse(indexResponse.body.toString('utf8'));
  assert.deepEqual(index.schema, 1);
  assert.equal(index.recipe, 'goty-2014-plus-legacy-shaders-v1');
  const indexed = new Set(index.files.map(row => row[0]));
  assert.ok(indexed.has('hl2/gameinfo.txt'));
  assert.ok(indexed.has('hl2/small.bin'));
  assert.ok(indexed.has('hl2/large.bin'));
  assert.equal(indexed.has('hl2/glshaders.cfg'), false);
  assert.equal(indexed.has('hl2/native.dll'), false);
  assert.equal(indexed.has('hl2/native.asi'), false);
  assert.equal(indexed.has('hl2/escape.txt'), false);

  const small = await request(publicPort, '/owner/hl2/small.bin', { headers: authHeaders });
  assert.equal(small.status, 200);
  assert.equal(small.body.toString('ascii'), '0123456789');

  const range = await request(publicPort, '/owner/hl2/large.bin', {
    headers: { ...authHeaders, Range: 'bytes=1024-1031' }
  });
  assert.equal(range.status, 206);
  assert.equal(range.body.length, 8);
  assert.equal(range.headers['content-range'], 'bytes 1024-1031/2097152');
  assert.deepEqual([...range.body], [0, 1, 2, 3, 4, 5, 6, 7]);

  const blocked = await request(publicPort, '/owner/hl2/native.dll', { headers: authHeaders });
  assert.equal(blocked.status, 404);
  const blockedPlugin = await request(publicPort, '/owner/hl2/native.asi', { headers: authHeaders });
  assert.equal(blockedPlugin.status, 404);
  const shaderCache = await request(publicPort, '/owner/hl2/glshaders.cfg', { headers: authHeaders });
  assert.equal(shaderCache.status, 404);
  const symlinked = await request(publicPort, '/owner/hl2/escape.txt', { headers: authHeaders });
  assert.equal(symlinked.status, 404);
  const traversal = await request(publicPort, '/owner/..%2Foutside.txt', { headers: authHeaders });
  assert.equal(traversal.status, 404);

  const removedDiagnosticRoute = await request(publicPort, '/owner-stat', { headers: authHeaders });
  assert.equal(removedDiagnosticRoute.status, 404);
  const vendorProbe = await request(publicPort, '/vendor-probe');
  assert.equal(vendorProbe.status, 200);
  assert.equal(vendorProbe.body.toString('utf8'), 'vendor-ok');

  console.log('owner bridge: authenticated index, range serving, blocked paths, and traversal checks passed');
} finally {
  await stopProcess(serverProcess);
  await rm(tempRoot, { recursive: true, force: true });
}
