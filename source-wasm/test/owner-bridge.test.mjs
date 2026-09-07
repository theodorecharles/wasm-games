import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, mkdir, readdir, readlink, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
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
  if (!child || child.exitCode != null || child.signalCode != null) return;
  let timer;
  const stopped = once(child, 'exit');
  try { process.kill(-child.pid, 'SIGTERM'); } catch (_) { child.kill('SIGTERM'); }
  try {
    await Promise.race([stopped, new Promise(resolve => { timer = setTimeout(resolve, 3000); })]);
  } finally { clearTimeout(timer); }
  if (child.exitCode == null && child.signalCode == null) {
    try { process.kill(-child.pid, 'SIGKILL'); } catch (_) { child.kill('SIGKILL'); }
    await stopped;
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
  await writeFile(path.join(ownerRoot, 'hl2', 'empty.bin'), '');
  await writeFile(path.join(ownerRoot, 'hl2', '.env'), 'private fixture');
  await mkdir(path.join(ownerRoot, '.private'));
  await writeFile(path.join(ownerRoot, '.private', 'hidden.txt'), 'private fixture');
  const large = Buffer.alloc(2 * 1024 * 1024);
  for (let i = 0; i < large.length; i += 1) large[i] = i & 0xff;
  await writeFile(path.join(ownerRoot, 'hl2', 'large.bin'), large);
  await writeFile(path.join(ownerRoot, 'hl2', 'glshaders.cfg'), 'blocked');
  await writeFile(path.join(ownerRoot, 'hl2', 'native.dll'), 'blocked');
  await writeFile(path.join(ownerRoot, 'hl2', 'native.asi'), 'blocked');
  await writeFile(outsideFile, 'outside');
  await symlink(outsideFile, path.join(ownerRoot, 'hl2', 'escape.txt'));
  await symlink(tempRoot, path.join(ownerRoot, 'hl2', 'escape-dir'));

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
  if (url.pathname === '/vendor-pid') { response.end(String(process.pid)); return; }
  if (url.pathname === '/vendor-exit') { response.end('exiting'); setTimeout(() => process.exit(0), 10); return; }
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
  assert.equal(indexed.has('hl2/.env'), false);
  assert.equal(indexed.has('.private/hidden.txt'), false);
  assert.ok([...indexed].every(name => !name.includes('escape-dir')));

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

  for (const [header, expected] of [
    ['bytes=-3', '789'], ['bytes=8-', '89'], ['bytes=8-99', '89'], ['bytes=-99', '0123456789']
  ]) {
    const reply = await request(publicPort, '/owner/hl2/small.bin', { headers: { ...authHeaders, Range: header } });
    assert.equal(reply.status, 206, header);
    assert.equal(reply.body.toString(), expected);
  }
  for (const header of ['bytes=10-', 'bytes=9-2', 'bytes=-0', 'bytes=0-1,4-5',
    'bytes=0-9007199254740992', 'bytes=0-1junk']) {
    const reply = await request(publicPort, '/owner/hl2/small.bin', { headers: { ...authHeaders, Range: header } });
    assert.equal(reply.status, 416, header);
    assert.equal(reply.headers['content-range'], 'bytes */10');
    assert.equal(reply.body.length, 0);
  }
  for (const ifRange of [small.headers.etag, small.headers['last-modified'], '"changed"']) {
    const reply = await request(publicPort, '/owner/hl2/small.bin', {
      headers: { ...authHeaders, Range: 'bytes=2-3', 'If-Range': ifRange }
    });
    assert.equal(reply.status, ifRange === '"changed"' ? 200 : 206);
    assert.equal(reply.body.toString(), ifRange === '"changed"' ? '0123456789' : '23');
  }
  for (const [url, rangeHeader, status, length] of [
    ['/owner/hl2/small.bin', undefined, 200, 10],
    ['/owner/hl2/small.bin', 'bytes=2-3', 206, 2],
    ['/owner/hl2/small.bin?b64=1', 'bytes=2-3', 200, 4],
    ['/owner/hl2/empty.bin', undefined, 200, 0]
  ]) {
    const reply = await request(publicPort, url, { method: 'HEAD',
      headers: { ...authHeaders, ...(rangeHeader ? { Range: rangeHeader } : {}) } });
    assert.equal(reply.status, status);
    assert.equal(Number(reply.headers['content-length']), length);
    assert.equal(reply.body.length, 0);
  }
  const empty = await request(publicPort, '/owner/hl2/empty.bin', { headers: authHeaders });
  assert.equal(empty.status, 200);
  assert.equal(empty.body.length, 0);
  const emptyRange = await request(publicPort, '/owner/hl2/empty.bin', { headers: { ...authHeaders, Range: 'bytes=0-' } });
  assert.equal(emptyRange.status, 416);
  for (const rangeHeader of [undefined, 'bytes=0-', 'bytes=0-1048576']) {
    const reply = await request(publicPort, '/owner/hl2/large.bin?b64=1', {
      headers: { ...authHeaders, ...(rangeHeader ? { Range: rangeHeader } : {}) }
    });
    assert.equal(reply.status, 413);
    assert.equal(reply.body.length, 0);
  }
  for (const start of [0, 1024 * 1024]) {
    const reply = await request(publicPort, '/owner/hl2/large.bin?b64=1', {
      headers: { ...authHeaders, Range: `bytes=${start}-${start + 1024 * 1024 - 1}` }
    });
    assert.equal(reply.status, 200);
    assert.equal(reply.headers['cache-control'], 'no-store');
    assert.equal(reply.headers['content-range'], undefined);
    assert.deepEqual(Buffer.from(reply.body.toString(), 'base64'), large.subarray(start, start + 1024 * 1024));
  }
  for (const url of ['/owner-index', '/owner/hl2/small.bin']) {
    const reply = await request(publicPort, url, { method: 'POST', headers: authHeaders });
    assert.equal(reply.status, 405);
    assert.equal(reply.headers.allow, 'GET, HEAD');
  }

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
  for (const url of ['/owner/', '/owner/hl2/', '/owner/hl2/.env', '/owner/.private/hidden.txt',
    '/owner/hl2/escape-dir/outside.txt', '/owner/hl2/%00', '/owner/hl2/%ZZ']) {
    const reply = await request(publicPort, url, { headers: authHeaders });
    assert.equal(reply.status, 404, url);
    assert.doesNotMatch(reply.body.toString(), /private fixture|outside|source-wasm-owner-bridge-/);
  }

  await new Promise((resolve, reject) => {
    const req = http.get({ hostname: '127.0.0.1', port: publicPort,
      path: '/owner/hl2/large.bin', headers: authHeaders }, response => {
      response.once('data', () => { response.destroy(); req.destroy(); resolve(); });
      response.once('error', reject);
    });
    req.setTimeout(5000, () => req.destroy(new Error('abort fixture timeout')));
    req.once('error', reject);
  });
  // Check the actual child process, not a mocked stream, for leaked descriptors.
  let openOwnerDescriptors = [];
  for (let attempt = 0; attempt < 50; attempt++) {
    const names = await readdir(`/proc/${serverProcess.pid}/fd`);
    const targets = await Promise.all(names.map(name => readlink(`/proc/${serverProcess.pid}/fd/${name}`).catch(() => '')));
    openOwnerDescriptors = targets.filter(target => target.startsWith(ownerRoot + '/'));
    if (!openOwnerDescriptors.length) break;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.deepEqual(openOwnerDescriptors, [], 'aborted owner transfers release their file descriptors');

  const removedDiagnosticRoute = await request(publicPort, '/owner-stat', { headers: authHeaders });
  assert.equal(removedDiagnosticRoute.status, 404);
  const vendorProbe = await request(publicPort, '/vendor-probe');
  assert.equal(vendorProbe.status, 200);
  assert.equal(vendorProbe.body.toString('utf8'), 'vendor-ok');

  const vendorPid = Number((await request(publicPort, '/vendor-pid')).body.toString());
  assert.ok(Number.isInteger(vendorPid) && vendorPid > 0);
  const normalExit = once(serverProcess, 'exit', { signal: AbortSignal.timeout(5000) });
  serverProcess.kill('SIGTERM'); // deliberately signal only the supervisor
  assert.deepEqual(await normalExit, [0, null]);
  assert.throws(() => process.kill(vendorPid, 0), { code: 'ESRCH' }, 'normal shutdown must reap the static child');

  serverProcess = spawn(process.execPath, [path.join(root, 'scripts', 'start.js')], {
    cwd: root, env, detached: true, stdio: ['ignore', 'pipe', 'pipe']
  });
  serverProcess.stdout.on('data', () => {});
  serverProcess.stderr.on('data', () => {});
  let restarted = false;
  for (let attempt = 0; attempt < 50; attempt++) {
    try { restarted = (await request(publicPort, '/vendor-probe')).status === 200; } catch (_) {}
    if (restarted) break;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.ok(restarted);
  const unexpectedExit = once(serverProcess, 'exit', { signal: AbortSignal.timeout(5000) });
  assert.equal((await request(publicPort, '/vendor-exit')).status, 200);
  assert.deepEqual(await unexpectedExit, [1, null], 'a lost child is not a healthy supervisor exit');
  await assert.rejects(request(vendorPort, '/vendor-probe'), { code: 'ECONNREFUSED' });

  for (const [pub, child] of [['0', '8089'], ['1.5', '8089'], ['8088', '8088'], ['8088', '65536']]) {
    const rejected = spawnSync(process.execPath, [path.join(root, 'scripts', 'start.js')], {
      env: { ...env, WASM_GAME_HTTP_PORT: pub, WASM_GAME_VENDOR_PORT: child }, encoding: 'utf8', timeout: 5000
    });
    assert.equal(rejected.status, 1);
    assert.match(rejected.stderr, /Public and framework ports must be distinct integers/);
  }
  console.log('owner bridge: authenticated HTTP, ranges/HEAD/base64, private paths, abort descriptors, child shutdown/failure and port validation passed');
} finally {
  await stopProcess(serverProcess);
  await rm(tempRoot, { recursive: true, force: true });
}
