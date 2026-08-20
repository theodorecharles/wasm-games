'use strict';

const { after, before, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');

const host = require('../server/index');

function request(port, pathname, method) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: port,
      path: pathname,
      method: method || 'GET'
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({
        status: res.statusCode,
        body: JSON.parse(Buffer.concat(chunks).toString('utf8'))
      }));
    });
    req.on('error', reject);
    req.end();
  });
}

describe('browser wake endpoint', () => {
  let server;
  let port;
  let state = 'sleeping';
  let wakes = 0;

  before(async () => {
    host.setLifecycleForTests({
      status: () => ({ state: state, map: state === 'running' ? 'radar' : null }),
      wake: async () => {
        wakes += 1;
        state = 'running';
        return { state: state, map: 'radar' };
      }
    });
    server = await host.startHttp(0);
    port = server.address().port;
  });

  after(async () => {
    host.setLifecycleForTests(null);
    await new Promise((resolve) => server.close(resolve));
  });

  it('reports sleep as healthy and wakes on POST', async () => {
    const health = await request(port, '/health');
    assert.equal(health.status, 200);
    assert.equal(health.body.ok, true);
    assert.equal(health.body.state, 'sleeping');

    const wake = await request(port, '/wake', 'POST');
    assert.equal(wake.status, 200);
    assert.equal(wake.body.ok, true);
    assert.equal(wake.body.state, 'running');
    assert.equal(wake.body.map, 'radar');
    assert.equal(wakes, 1);
  });

  it('does not permit GET to mutate server state', async () => {
    const response = await request(port, '/wake');
    assert.equal(response.status, 405);
  });
});
