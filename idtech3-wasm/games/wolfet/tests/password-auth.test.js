'use strict';

process.env.WASM_GAME_PASSWORD = 'private arena';
delete process.env.WASM_GAME_SESSION_SECRET;

const { after, before, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const WebSocket = require('ws');

const host = require('../server/index');

function request(port, pathname, options) {
  const config = options || {};
  return new Promise((resolve, reject) => {
    const req = http.request({
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
    req.on('error', reject);
    if (config.body) req.end(config.body);
    else req.end();
  });
}

function websocket(port, cookie) {
  return new WebSocket(`ws://127.0.0.1:${port}/ws`, cookie ? { headers: { cookie } } : undefined);
}

describe('framework password gate around the WolfET custom server', () => {
  let server;
  let port;
  let wakes = 0;
  let cookie;

  before(async () => {
    host.setLifecycleForTests({
      status: () => ({ state: 'sleeping', map: null }),
      wake: async () => { wakes += 1; return { state: 'running', map: 'oasis' }; }
    });
    server = await host.startHttp(0);
    port = server.address().port;
  });

  after(async () => {
    host.setLifecycleForTests(null);
    await new Promise(resolve => server.close(resolve));
  });

  it('keeps auth and the canonical launcher public while rejecting protected HTTP routes', async () => {
    const auth = await request(port, '/auth/status');
    assert.deepEqual(JSON.parse(auth.body), { required: true, authenticated: false });
    assert.equal((await request(port, '/')).status, 200);
    for (const pathname of [
      '/game-data/status', '/game-data/files/etmain-pak0.pk3', '/etmain/pak0.pk3',
      '/client/et.js', '/game-adapter.js', '/status', '/wake', '/config.json', '/admin'
    ]) {
      const response = await request(port, pathname, {
        method: pathname === '/wake' || pathname === '/admin' ? 'POST' : 'GET',
        headers: pathname.includes('pak0') ? { range: 'bytes=0-3' } : undefined
      });
      assert.equal(response.status, 401, pathname);
    }
    assert.equal(wakes, 0, 'unauthenticated requests must not wake the dedicated server');
    const health = await request(port, '/health');
    assert.deepEqual(JSON.parse(health.body), { ok: true });
  });

  it('rejects a wrong password and accepts one shared HttpOnly session cookie', async () => {
    let response = await request(port, '/auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'wrong' })
    });
    assert.equal(response.status, 401);
    assert.doesNotMatch(response.body.toString(), /private arena/);

    response = await request(port, '/auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'private arena' })
    });
    assert.equal(response.status, 200);
    assert.match(response.headers['set-cookie'][0], /HttpOnly/);
    assert.match(response.headers['set-cookie'][0], /SameSite=Strict/);
    assert.doesNotMatch(response.headers['set-cookie'][0], /private arena/);
    cookie = response.headers['set-cookie'][0].split(';')[0];

    assert.equal((await request(port, '/status', { headers: { cookie } })).status, 200);
    response = await request(port, '/game-data/files/etmain-pak0.pk3', {
      headers: { cookie, range: 'bytes=0-3' }
    });
    assert.equal(response.status, 206);
    assert.deepEqual(Array.from(response.body), [80, 75, 3, 4]);
    const manifest = await request(port, '/app.webmanifest');
    assert.doesNotMatch(manifest.body.toString(), /private arena|WASM_GAME_SESSION_SECRET/);
  });

  it('rejects WebSocket upgrade before proxy/wake and accepts the session without waking', async () => {
    const denied = websocket(port);
    const deniedStatus = await new Promise((resolve, reject) => {
      denied.once('unexpected-response', (_request, response) => resolve(response.statusCode));
      denied.once('error', error => {
        if (!/Unexpected server response/.test(error.message)) reject(error);
      });
    });
    assert.equal(deniedStatus, 401);
    assert.equal(wakes, 0);

    const accepted = websocket(port, cookie);
    await new Promise((resolve, reject) => {
      accepted.once('open', resolve);
      accepted.once('error', reject);
    });
    assert.equal(wakes, 0, 'a WebSocket upgrade alone must never wake the game');
    accepted.close();
    await new Promise(resolve => accepted.once('close', resolve));

    const logout = await request(port, '/auth/logout', {
      method: 'POST', headers: { cookie }
    });
    assert.equal(logout.status, 200);
    assert.match(logout.headers['set-cookie'][0], /Max-Age=0/);
  });
});
