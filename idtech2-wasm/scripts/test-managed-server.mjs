#!/usr/bin/env node
// Integration test against real dedicated servers and owner-supplied data.
// Example: IDTECH2_TEST_DATA_ROOT=/path/to/quake2 node scripts/test-managed-server.mjs
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

assert.ok(process.env.IDTECH2_TEST_DATA_ROOT, 'Set IDTECH2_TEST_DATA_ROOT to the Quake II data directory.');
const dataRoot = fs.realpathSync(process.env.IDTECH2_TEST_DATA_ROOT);
const namespace = (process.env.DOCKER_NAMESPACE || '').replace(/\/?$/, '/').replace(/^\/$/, '');
const tag = process.env.DOCKER_TAG || 'dev';
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', timeout: 15000 }).trim();
const snapshots = ['pak0.pak', 'pak1.pak', 'pak2.pak', 'xatrix/pak0.pak', 'rogue/pak0.pak']
  .map(file => {
    const filename = path.join(dataRoot, file);
    const stat = fs.statSync(filename);
    return { filename, uid: stat.uid, gid: stat.gid, mode: stat.mode, size: stat.size, mtimeMs: stat.mtimeMs };
  });

async function eventually(check, description, timeout = 15000) {
  const deadline = Date.now() + timeout;
  let lastError;
  do {
    try { const result = await check(); if (result) return result; } catch (error) { lastError = error; }
    await delay(100);
  } while (Date.now() < deadline);
  throw new Error(`Timed out: ${description}`, { cause: lastError });
}

const nativeStatus = `
  const socket = require('node:dgram').createSocket('udp4');
  const timeout = setTimeout(() => { socket.close(); process.exitCode = 1; }, 1000);
  socket.on('message', packet => {
    clearTimeout(timeout);
    console.log(packet.toString('latin1'));
    socket.close();
  });
  socket.send(Buffer.from([255,255,255,255,115,116,97,116,117,115,10]), 27910, '127.0.0.1');
`;
const processIdentity = `
  const fs = require('node:fs');
  for (const pid of fs.readdirSync('/proc').filter(value => /^\\d+$/.test(value))) {
    try {
      if (fs.readFileSync('/proc/' + pid + '/comm', 'utf8').trim() !== 'q2ded') continue;
      const status = fs.readFileSync('/proc/' + pid + '/status', 'utf8');
      console.log(JSON.stringify({
        uid: status.match(/^Uid:\\s+(\\d+)/m)[1],
        gid: status.match(/^Gid:\\s+(\\d+)/m)[1],
        workdirUid: fs.statSync('/tmp/' + fs.readdirSync('/tmp').find(name => name.startsWith('idtech2-quake2-'))).uid
      }));
    } catch (_) {}
  }
`;

for (const [variant, expansion, map] of [
  ['quake2', '', 'q2dm1'],
  ['quake2-xatrix', 'xatrix', 'xswamp'],
  ['quake2-rogue', 'rogue', 'rbase1']
]) {
  const container = `idtech2-server-test-${process.pid}-${variant}`;
  const image = `${namespace}${variant}-wasm:${tag}`;
  let started = false;
  try {
    docker('run', '--rm', '-d', '--name', container, '-p', '127.0.0.1::8088',
      '--mount', `type=bind,source=${dataRoot},target=/data/quake2,readonly`,
      ...['xatrix', 'rogue'].flatMap(game => ['--mount',
        `type=bind,source=${fs.realpathSync(path.join(dataRoot, game, 'pak0.pak'))},target=/data/quake2/${game}/pak0.pak,readonly`]),
      '-e', 'IDLE_TIMEOUT=3s', image);
    started = true;
    const port = docker('port', container, '8088/tcp').split(':').at(-1);
    const base = `http://127.0.0.1:${port}`;
    await eventually(async () => (await fetch(`${base}/health`)).ok, `${variant} HTTP startup`);
    // Repeated base-game wake also checks cleanup and recovery from idle sleep.
    for (const mode of expansion ? ['campaign', 'deathmatch'] : ['deathmatch', 'deathmatch']) {
      const response = await fetch(`${base}/wake`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ engine: 'quake2', expansion, map, mode, bots: 2 }),
        signal: AbortSignal.timeout(35000)
      });
      const status = await response.json();
      assert.equal(response.status, 200, JSON.stringify(status));
      assert.equal(status.state, 'running');
      assert.equal(status.expansion, expansion || null);
      assert.equal(status.mode, mode);
      const packet = await eventually(() => {
        const result = docker('exec', container, 'node', '-e', nativeStatus);
        return result.includes(`\\mapname\\${map}`) && result;
      }, `${variant} native map ${map}`);
      assert.ok(packet.startsWith('\u00ff\u00ff\u00ff\u00ffprint\n'), 'Expected a native Quake II status reply.');
      const identity = JSON.parse(docker('exec', container, 'node', '-e', processIdentity));
      assert.equal(identity.uid, '65534');
      assert.equal(identity.gid, '65534');
      assert.equal(identity.workdirUid, 65534);
      await eventually(async () => (await (await fetch(`${base}/status`)).json()).state === 'sleeping',
        `${variant} idle shutdown`);
      const sessions = docker('exec', container, 'node', '-e',
        "console.log(require('node:fs').readdirSync('/tmp').filter(name => name.startsWith('idtech2-quake2-')).length)");
      assert.equal(sessions, '0', 'Disposable server session must be removed after idle shutdown.');
      console.log(`PASS ${variant} ${mode}: native ${map}, non-root server, idle cleanup.`);
    }
  } catch (error) {
    if (started) console.error(docker('logs', '--tail', '100', container));
    throw error;
  } finally {
    if (started) docker('stop', '-t', '5', container);
  }
}

for (const snapshot of snapshots) {
  const stat = fs.statSync(snapshot.filename);
  for (const key of ['uid', 'gid', 'mode', 'size', 'mtimeMs']) assert.equal(stat[key], snapshot[key], snapshot.filename);
}
console.log('All Quake II managed-server checks passed; owner data metadata is unchanged.');
