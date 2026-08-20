'use strict';

const { after, before, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const http = require('http');
const path = require('path');

const host = require('../server/index');
const ROOT = path.join(__dirname, '..');

function request(port, pathname, options) {
  return new Promise((resolve, reject) => {
    const req = http.request(Object.assign({
      hostname: '127.0.0.1',
      port: port,
      path: pathname,
      method: 'GET'
    }, options || {}), (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks)
      }));
    });
    req.on('error', reject);
    req.end();
  });
}

describe('same-origin content-addressed game assets', () => {
  let server;
  let port;

  before(async () => {
    server = await host.startHttp(0);
    port = server.address().port;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it('publishes exact sizes, hashes, and versioned same-origin URLs', async () => {
    const response = await request(port, '/config.json');
    assert.equal(response.status, 200);
    const config = JSON.parse(response.body.toString('utf8'));
    assert.equal(config.admin, true);
    assert.equal(Object.hasOwn(config, 'rconPassword'), false);
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal(config.assets.length, 6);
    config.assets.forEach((asset) => {
      assert.match(asset.url, /^\/(?:etmain|legacy)\/[^?]+\.pk3\?v=[a-f0-9]{16}$/);
      assert.match(asset.sha256, /^[a-f0-9]{64}$/);
      assert.equal(asset.cacheKey, asset.name + '@sha256:' + asset.sha256);
      assert.ok(asset.bytes > 1000);
    });
  });

  it('serves valid bounded byte ranges and rejects invalid ranges', async () => {
    const partial = await request(port, '/etmain/pak0.pk3?v=test', {
      headers: { Range: 'bytes=8-39' }
    });
    assert.equal(partial.status, 206);
    assert.equal(partial.body.length, 32);
    assert.equal(partial.headers['accept-ranges'], 'bytes');
    assert.equal(partial.headers['content-range'], 'bytes 8-39/228138631');
    assert.equal(partial.headers['content-length'], '32');

    const invalid = await request(port, '/etmain/pak0.pk3', {
      headers: { Range: 'bytes=999999999-1000000000' }
    });
    assert.equal(invalid.status, 416);
    assert.equal(invalid.headers['content-range'], 'bytes */228138631');
  });

  it('exposes the framework game-data contract without an upload gate', async () => {
    const statusResponse = await request(port, '/game-data/status');
    assert.equal(statusResponse.status, 200);
    const status = JSON.parse(statusResponse.body.toString('utf8'));
    assert.equal(status.configured, true);
    assert.equal(status.ready, true);
    assert.equal(status.files.length, 6);
    const pak0 = status.files.find((file) => file.key === 'etmain-pak0.pk3');
    assert.equal(pak0.path, 'etmain/pak0.pk3');
    assert.equal(pak0.size, 228138631);
    assert.match(pak0.sha256, /^[a-f0-9]{64}$/);
    assert.equal(pak0.valid, true);

    const fileResponse = await request(port, '/game-data/files/etmain-pak0.pk3', {
      headers: { Range: 'bytes=0-3' }
    });
    assert.equal(fileResponse.status, 206);
    assert.deepEqual(Array.from(fileResponse.body), [80, 75, 3, 4]);

    const upload = await request(port, '/game-data/setup/etmain-pak0.pk3', { method: 'PUT' });
    assert.equal(upload.status, 405);

    assert.equal((await request(port, '/data/etmain/pak0.pk3')).status, 404);
    assert.equal((await request(port, '/local-data/etmain/pak0.pk3')).status, 404);
  });

  it('serves installable WolfET PWA metadata and the versioned framework worker', async () => {
    const manifestResponse = await request(port, '/app.webmanifest');
    assert.equal(manifestResponse.status, 200);
    assert.equal(manifestResponse.headers['content-type'], 'application/manifest+json');
    const manifest = JSON.parse(manifestResponse.body.toString('utf8'));
    assert.equal(manifest.name, 'Wolfenstein: Enemy Territory');
    assert.equal(manifest.short_name, 'WolfET');
    assert.equal(manifest.display, 'standalone');
    assert.equal(manifest.orientation, 'landscape');
    assert.deepEqual(manifest.icons.map((icon) => icon.sizes), ['192x192', '512x512']);
    assert.deepEqual(manifest.icons.map((icon) => icon.src), ['/img/et-192.png', '/img/et-512.png']);
    assert.deepEqual(manifestResponse.body,
      fs.readFileSync(path.join(ROOT, '.generated', 'framework-runtime', 'app.webmanifest')),
      'the application server must serve the framework-staged manifest byte for byte');

    const workerResponse = await request(port, '/service-worker.js');
    assert.equal(workerResponse.status, 200);
    assert.equal(workerResponse.headers['service-worker-allowed'], '/');
    const worker = workerResponse.body.toString('utf8');
    assert.match(worker, /wasm-game-shell-0\.9\.4/);
    assert.match(worker, /fetch\(event\.request\)/);
    assert.doesNotMatch(worker, /game-data/, 'PWA shell cache must not duplicate owner PK3 caching');
    assert.deepEqual(workerResponse.body,
      fs.readFileSync(path.join(ROOT, '.generated', 'framework-runtime', 'service-worker.js')),
      'the application server must serve the framework-staged worker byte for byte');

    const iconResponse = await request(port, '/img/et-512.png');
    assert.equal(iconResponse.status, 200);
    assert.equal(iconResponse.headers['content-type'], 'image/png');
    assert.equal(iconResponse.headers['cross-origin-opener-policy'], 'same-origin');
    assert.equal(iconResponse.headers['cross-origin-embedder-policy'], 'require-corp');
    assert.equal(iconResponse.headers['x-content-type-options'], 'nosniff');
  });
});
