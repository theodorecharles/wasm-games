#!/usr/bin/env node
// Native host/API integration, not a Chrome/WebRTC gameplay acceptance test.
// Fault injection is restricted to a fresh, uniquely named, unmounted container.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const image = process.env.CS_SERVER_IMAGE || 'wasm-games/counter-strike-yapb:4.4.957';
const expectStalled = process.argv.includes('--expect-stalled');
const outputIndex = process.argv.indexOf('--output');
const output = outputIndex < 0 ? '' : process.argv[outputIndex + 1];
if (outputIndex >= 0) assert.ok(output && !output.startsWith('--'), '--output requires a file');
const suffix = randomBytes(6).toString('hex');
const name = `wasm-games-cs-recovery-${suffix}`;
const password = randomBytes(24).toString('hex');
const docker = (...args) => execFileSync('docker', args, {
  encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024
}).trim();
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let id = '';
let origin = '';
let token = '';
const inspect = () => JSON.parse(docker('inspect', id))[0];
const logs = () => docker('logs', id).split('\n').map(line => {
  try { return JSON.parse(line).log || ''; } catch { return line; }
}).join('\n').replace(/\x1b\[[0-9;]*m/g, '');
async function waitFor(predicate, description, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const result = await predicate();
    if (result) return result;
    await pause(200);
  }
  throw new Error(`${description} timed out; ${JSON.stringify(inspect().State)}\n${logs().slice(-4000)}`);
}
async function authenticate() {
  // Docker may assign another ephemeral test port when it restarts a container.
  // The lab uses fixed ports; rediscover only this isolated test binding.
  origin = `http://127.0.0.1:${inspect().NetworkSettings.Ports['4192/tcp'][0].HostPort}`;
  await waitFor(async () => {
    try { return (await fetch(`${origin}/v1/auth`, {signal: AbortSignal.timeout(1000)})).ok; }
    catch { return false; }
  }, 'bridge authentication readiness');
  const {salt} = await (await fetch(`${origin}/v1/auth`)).json();
  const response = await fetch(`${origin}/v1/auth`, {
    method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({username: 'proof', passwordHash: createHash('sha512').update(password + salt).digest('hex')})
  });
  assert.equal(response.status, 200, 'isolated proof authentication');
  token = (await response.json()).token;
}
async function command(value) {
  const response = await fetch(`${origin}/v1/rcon`, {
    method: 'POST', headers: {'Content-Type': 'application/json', Authorization: `Bearer ${token}`},
    body: JSON.stringify({command: value}), signal: AbortSignal.timeout(5000)
  });
  assert.equal(response.status, 204, await response.text());
}
async function query(value, pattern) {
  const offset = logs().length;
  await command(value);
  return waitFor(() => {
    const text = logs().slice(offset);
    return pattern.test(text) ? text : false;
  }, `native ${value}`);
}
async function boot(offset, expectedRestarts) {
  await waitFor(() => {
    const state = inspect();
    const text = logs().slice(offset);
    return state.State.Running && state.RestartCount === expectedRestarts &&
      /16 player server started/.test(text) &&
      (text.match(/Connecting Bot\.\.\./g) || []).length >= 4;
  }, `native boot with four bots after ${expectedRestarts} restarts`, 60000);
  await authenticate();
  const status = await query('status', /(?:\bBot {2,}[\s\S]*?){4}/);
  assert.match(status, /map: de_dust2/);
  assert.equal((status.match(/\bBot {2,}/g) || []).length, 4, 'native status must report four live bot clients');
  assert.doesNotMatch(status, /no server running/);
  const text = logs().slice(offset);
  assert.match(text, /YaPB v4\.4\.957 successfully loaded/);
  assert.match(text, /Loaded Bots Graph data v2/);
  assert.doesNotMatch(text, /permission denied/i);
}

try {
  id = docker('run', '-d', '--name', name, '--platform', 'linux/386',
    '--restart', 'on-failure:3', '-p', '127.0.0.1::4192',
    '-e', 'ADDR=:4192', '-e', 'CS_BOTS=4', '-e', 'CS_BOT_DIFFICULTY=2',
    '-e', 'ADMIN_PANEL_USER=proof', '-e', `ADMIN_PANEL_PASSWORD=${password}`,
    '-e', 'LOG_FORMAT=json', image, '-dev', '3', '+map', 'de_dust2', '+maxplayers', '16');
  const initial = inspect();
  assert.deepEqual(initial.Mounts, [], 'never fault-inject a host with owner-data mounts');
  origin = `http://127.0.0.1:${initial.NetworkSettings.Ports['4192/tcp'][0].HostPort}`;
  await boot(0, 0);
  const report = {schemaVersion: 1, generatedAt: new Date().toISOString(), imageId: initial.Image,
    nativeOnly: true, expectedBehavior: expectStalled ? 'legacy-stalled-host' : 'automatic-recovery',
    requestedBots: 4, mapChecks: [], recoveryCycles: []};

  const mapCounts = new Map();
  for (const map of ['de_dust', 'cs_italy', 'de_dust2', 'de_dust', 'cs_italy', 'de_dust2']) {
    await query(`changelevel ${map}`, /16 player server started/);
    const text = await query(['modellist', 'status'], /\d+ total models/);
    const models = Number(text.match(/(\d+) total models/)[1]);
    assert.ok(models > 0 && models < 4096);
    if (mapCounts.has(map)) assert.equal(models, mapCounts.get(map), 'same-map model count must not grow');
    mapCounts.set(map, models);
    report.mapChecks.push({map, models});
  }
  // Use the engine's explicit developer-only failure command. This exercises
  // Host_Error but does not claim to reproduce the original model overflow.
  const cycles = expectStalled ? 1 : 2;
  for (let cycle = 1; cycle <= cycles; cycle++) {
    const offset = logs().length;
    const oldStartedAt = inspect().State.StartedAt;
    await command(`host_error "isolated recovery regression ${cycle}"`);
    if (expectStalled) {
      await waitFor(() => /Server was killed due to an error/.test(logs().slice(offset)), 'legacy Host_Error');
      const status = await query('status', /no server running/);
      assert.match(status, /no server running/);
      assert.equal((await fetch(`${origin}/v1/config`)).status, 200);
      assert.equal(inspect().RestartCount, 0);
      assert.equal(inspect().State.StartedAt, oldStartedAt);
      report.recoveryCycles.push({cycle, bridgeHTTP: 200, nativeServerRunning: false, restarts: 0});
    } else {
      await boot(offset, cycle);
      assert.notEqual(inspect().State.StartedAt, oldStartedAt, 'the native process actually restarted');
      report.recoveryCycles.push({cycle, nativeServerRunning: true, restarts: inspect().RestartCount, botsReconnected: 4});
    }
  }

  // An explicit operator stop must not fight the automatic recovery policy.
  docker('stop', '--time', '5', id);
  await pause(750);
  assert.equal(inspect().State.Running, false);
  report.explicitStopRemainsStopped = true;
  const stoppedOffset = logs().length;
  execFileSync('bash', [fileURLToPath(new URL('../runtime/counter-strike/start.sh', import.meta.url))], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    env: {...process.env, CS_CONTAINER_NAME: name, CS_SERVER_IMAGE: image}
  });
  await boot(stoppedOffset, 0);
  report.explicitStartRestoresStoppedHost = true;
  docker('stop', '--time', '5', id);
  report.passed = true;
  if (output) {
    await mkdir(path.dirname(path.resolve(output)), {recursive: true});
    await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
  }
  console.log(JSON.stringify(report, null, 2));
} finally {
  // Only remove the exact container created by this invocation, never a name
  // supplied by the caller or a pre-existing live lab host.
  if (id) docker('rm', '-f', id);
}
