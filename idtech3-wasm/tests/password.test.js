'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const frameworkRoot = path.resolve(root, '..', 'wasm-game-framework');
const { createPasswordGate } = require(path.join(frameworkRoot, 'server', 'password-auth.js'));
const {
  ensureSessionSecret,
  passwordProtectedPath,
  rejectWebSocket
} = require('../games/quake3/server/access');

function request(port, pathname, options) {
  const config = options || {};
  return new Promise((resolve, reject) => {
    const outgoing = http.request({
      hostname: '127.0.0.1', port, path: pathname,
      method: config.method || 'GET', headers: config.headers || {}
    }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({
        status: response.statusCode,
        headers: response.headers,
        body: Buffer.concat(chunks)
      }));
    });
    outgoing.on('error', reject);
    outgoing.end(config.body);
  });
}

function websocketStatus(port, cookie) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: '127.0.0.1', port }, () => {
      const headers = [
        'GET /ws HTTP/1.1', `Host: 127.0.0.1:${port}`, 'Connection: Upgrade',
        'Upgrade: websocket', 'Sec-WebSocket-Version: 13',
        'Sec-WebSocket-Key: MDEyMzQ1Njc4OWFiY2RlZg=='
      ];
      if (cookie) headers.push(`Cookie: ${cookie}`);
      socket.write(`${headers.join('\r\n')}\r\n\r\n`);
    });
    let value = '';
    socket.on('data', chunk => {
      value += chunk;
      const match = /^HTTP\/1\.1 (\d+)/.exec(value);
      if (match) { socket.destroy(); resolve(Number(match[1])); }
    });
    socket.on('error', reject);
  });
}

(async () => {
  const environment = { WASM_GAME_PASSWORD: 'q3 test password' };
  const generated = ensureSessionSecret(environment);
  assert.match(generated, /^[A-Za-z0-9_-]{43}$/);
  const passwordGate = createPasswordGate({ environment });
  const childGate = createPasswordGate({ environment });
  let wakes = 0;

  const server = http.createServer(async (incoming, response) => {
    const url = new URL(incoming.url, 'http://localhost');
    if (await passwordGate.handle(incoming, response, url)) return;
    if (passwordProtectedPath(url.pathname) && !passwordGate.require(incoming, response)) return;
    if (url.pathname === '/wake') { wakes += 1; response.writeHead(204); return response.end(); }
    if (url.pathname === '/game-data/files/pak0.pk3') {
      response.writeHead(incoming.headers.range ? 206 : 200, { 'content-type': 'application/octet-stream' });
      return response.end('PK');
    }
    if (url.pathname === '/data' || url.pathname.startsWith('/data/')) {
      response.writeHead(404); return response.end();
    }
    response.writeHead(200); response.end('public');
  });
  server.on('upgrade', (incoming, socket) => {
    if (!passwordGate.authenticated(incoming)) return rejectWebSocket(socket);
    socket.end('HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  try {
    assert.equal((await request(port, '/')).status, 200);
    assert.deepEqual(JSON.parse((await request(port, '/auth/status')).body), {
      required: true, authenticated: false
    });
    for (const pathname of [
      '/status', '/wake', '/config.json', '/admin', '/play', '/game-data/status',
      '/game-data/files/pak0.pk3', '/game-adapter.js', '/ioquake3.js', '/qvm/ui.qvm'
    ]) {
      const response = await request(port, pathname, { method: pathname === '/wake' ? 'POST' : 'GET' });
      assert.equal(response.status, 401, pathname);
    }
    assert.equal(wakes, 0);
    assert.equal(await websocketStatus(port), 401);
    assert.equal(wakes, 0, 'unauthenticated WebSocket upgrade must not wake the arena');

    let response = await request(port, '/auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'wrong' })
    });
    assert.equal(response.status, 401);
    assert.doesNotMatch(response.body.toString(), /q3 test password/);

    response = await request(port, '/auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'q3 test password' })
    });
    assert.equal(response.status, 200);
    const setCookie = response.headers['set-cookie'][0];
    assert.match(setCookie, /HttpOnly/);
    assert.match(setCookie, /SameSite=Strict/);
    assert.doesNotMatch(setCookie, /q3 test password/);
    const cookie = setCookie.split(';')[0];
    assert.equal(childGate.authenticated({ headers: { cookie } }), true,
      'the private framework child must accept the outer server session');

    response = await request(port, '/game-data/files/pak0.pk3', {
      headers: { cookie, range: 'bytes=0-1' }
    });
    assert.equal(response.status, 206);
    assert.equal(response.body.toString(), 'PK');
    assert.equal((await request(port, '/data/pak0.pk3', { headers: { cookie } })).status, 404);
    assert.equal(await websocketStatus(port, cookie), 101);
    assert.equal(wakes, 0, 'authenticated WebSocket upgrade alone must not wake the arena');

    response = await request(port, '/auth/logout', {
      method: 'POST', headers: { cookie }
    });
    assert.equal(response.status, 200);
    assert.match(response.headers['set-cookie'][0], /Max-Age=0/);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
  console.log('Quake III outer password gate contract passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
