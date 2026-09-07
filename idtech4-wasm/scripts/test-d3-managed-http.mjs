#!/usr/bin/env node
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {once} from 'node:events';
import {createRequire} from 'node:module';
const require = createRequire(new URL('../server/package.json', import.meta.url));
const {WebSocket} = require('ws');
const image = process.argv[2];
const dataRoot = process.argv[3];
const bots = process.env.D3_HTTP_BOTS === '1';
const population = process.env.D3_HTTP_POPULATION === '1';
if (population && !bots) throw new Error('Population checks require D3_HTTP_BOTS=1');
assert.ok(image && dataRoot, 'usage: test-d3-managed-http.mjs IMAGE OWNER_DOOM3_DIRECTORY');
assert.ok(fs.statSync(dataRoot).isDirectory());
const docker = (...args) => execFileSync('docker', args, {encoding: 'utf8', timeout: 90000}).trim();
const containers = [];
const checks = [];
const password = crypto.randomBytes(24).toString('base64url');
const check = (actual, expected, label) => { assert.deepEqual(actual, expected, label); checks.push(label); };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(operation, predicate, label, timeout = 20000) {
  const end = Date.now() + timeout;
  let value;
  while (Date.now() < end) {
    try { value = await operation(); if (predicate(value)) return value; } catch (_) {}
    await pause(100);
  }
  throw new Error(`Timed out: ${label}; last result: ${JSON.stringify(value)}`);
}
async function start({withData = false, extra = []} = {}) {
  const args = ['run', '-d', '--read-only', '--user', '1000:1000', '--cpus', '1', '--memory', '1g',
    '--pids-limit', '128', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true',
    '--tmpfs', '/tmp:rw,nosuid,nodev,noexec,size=256m',
    '-p', '127.0.0.1::8088', '-e', `WASM_GAME_PASSWORD=${password}`, '-e', 'IDLE_TIMEOUT=1s'];
  if (withData) args.push('--mount', `type=bind,src=${dataRoot},dst=/data,readonly`);
  for (const entry of extra) args.push('-e', entry);
  const id = docker(...args, image);
  assert.match(id, /^[0-9a-f]{64}$/);
  containers.push(id);
  const address = docker('port', id, '8088/tcp');
  assert.match(address, /^127\.0\.0\.1:\d+$/);
  const origin = `http://${address}`;
  const request = (pathname, options = {}) => fetch(origin + pathname, {...options, signal: AbortSignal.timeout(60000)});
  await until(async () => (await request('/health')).status, status => status === 200, 'supervisor health');
  const login = await request('/auth/login', {method: 'POST', headers: {'content-type': 'application/json', origin}, body: JSON.stringify({password})});
  check(login.status, 200, 'framework password login');
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const authorized = (pathname, options = {}) => request(pathname, {...options, headers: {cookie, origin, ...options.headers}});
  const status = async () => (await authorized('/api/doom3/status')).json();
  return {id, origin, request, authorized, status, cookie};
}
const resources = id => JSON.parse(docker('exec', id, 'node', '-e', `
const fs=require('node:fs');
const processes=fs.readdirSync('/proc').filter(x=>/^\\d+$/.test(x)).filter(x=>{
  try{return fs.readFileSync('/proc/'+x+'/comm','utf8').trim()==='dhewm3ded'}catch(_){return false}
}).map(Number);
console.log(JSON.stringify({processes, sessions:fs.readdirSync('/tmp').filter(x=>x.startsWith('d3-managed-'))}));
`));
try {
  const empty = await start();
  check((await empty.request('/api/doom3/status')).status, 401, 'managed status requires password');
  check((await empty.request('/api/doom3/wake', {method: 'POST'})).status, 401, 'wake requires password');
  check((await empty.request('/game-data/status')).status, 401, 'static child shares password policy');
  check((await empty.authorized('/game-data/status')).status, 200, 'supervisor session accepted by static child');
  check((await empty.authorized('/api/doom3/wake')).status, 405, 'wake requires POST');
  check((await empty.authorized('/api/doom3/wake', {method: 'POST', headers: {origin: 'https://foreign.test'}})).status, 403, 'cross-origin wake denied');
  check((await empty.authorized('/api/doom3/wake', {method: 'POST'})).status, 409, 'missing owner data blocks native startup');
  check(resources(empty.id), {processes: [], sessions: []}, 'missing data leaves no native process/session');
  check((await empty.request('/data/base/pak000.pk4')).status, 404, 'private data path is not exposed');

  for (const variant of ['doom3', 'roe']) {
    const single = await start({extra: ['WASM_GAME_VARIANT=' + variant]});
    check((await single.authorized('/api/doom3/wake', {method: 'POST'})).status, 404, variant + ': single-player cannot wake multiplayer');
    check((await single.authorized('/api/doom3/status')).status, 404, variant + ': multiplayer status is unavailable');
    const denied = new WebSocket(single.origin.replace('http:', 'ws:') + '/api/doom3/socket', {headers: {origin: single.origin, cookie: single.cookie}});
    denied.on('error', () => {});
    const [, response] = await once(denied, 'unexpected-response');
    check(response.statusCode, 403, variant + ': multiplayer WebSocket is rejected');
    denied.terminate();
    check(resources(single.id), {processes: [], sessions: []}, variant + ': rejected requests leave no native session');
  }
  const unknown = new WebSocket(empty.origin.replace('http:', 'ws:') + '/unknown-socket', {headers: {origin: empty.origin, cookie: empty.cookie}});
  unknown.on('error', () => {});
  const [, unknownResponse] = await once(unknown, 'unexpected-response');
  check(unknownResponse.statusCode, 404, 'unknown WebSocket endpoint is rejected promptly');
  unknown.terminate();

  const live = await start({withData: true});
  const waves = await Promise.all(Array.from({length: 3}, () => live.authorized('/api/doom3/wake', {method: 'POST'}).then(response => response.json())));
  check(waves.map(result => result.state), ['running', 'running', 'running'], 'concurrent Play requests share readiness');
  check(new Set(waves.map(result => result.startedAt)).size, 1, 'one shared native start');
  check(waves[0].map, 'game/mp/d3dm1', 'real dedicated deathmatch map');
  check(waves[0].protocol, '1.42', 'real native protocol readiness');
  if (bots) {
    check(waves[0].bots, 2, 'readiness includes two actual native bot brains');
    check(waves[0].botStatus, 'ready', 'bot readiness reports a complete fresh frame');
    if (population) {
      check(waves[0].botTarget, 2, 'native automatic population reports the desired bot count');
      check(waves[0].nativeHumans, 0, 'bot population never invents human clients');
    }
    check(waves[0].botPlayers.map(row => row.slot).sort(), [30, 31], 'bots occupy reserved high slots');
    const archive = await live.authorized('/bots/d3_sabot_a7.pk4');
    check(archive.status, 200, 'packaged bot archive is available to the authorized worker');
    check(crypto.createHash('sha256').update(Buffer.from(await archive.arrayBuffer())).digest('hex'),
      'b15e8f94c2b4ade06d59c093943c512e95f257a237f40224c496710beb7d24ff', 'packaged archive matches pinned assets');
  }
  check(resources(live.id).processes.length, 1, 'only one dedicated child');
  check(resources(live.id).sessions.length, 1, 'only one disposable owner-pack session');
  const socket = new WebSocket(live.origin.replace('http:', 'ws:') + '/api/doom3/socket', {headers: {origin: live.origin, cookie: live.cookie}});
  await once(socket, 'open');
  await pause(1600);
  check((await live.status()).state, 'running', 'browser relay peer prevents idle shutdown');
  check((await live.status()).browserPeers, 1, 'relay connection accounted separately from native roster');
  if (population) check((await live.status()).nativeHumans, 0, 'relay-only peer is not a native human for bot capacity');
  if (bots) {
    const moving = await until(live.status, value => value.botPlayers?.length === 2 && value.botPlayers.every(row => {
      const first = waves[0].botPlayers.find(initial => initial.slot === row.slot);
      return row.time > first.time && Math.hypot(...row.origin.map((n, i) => n - first.origin[i])) > 64;
    }), 'both actual bots move while a relay peer holds the match', 20000);
    check(moving.botStatus, 'ready', 'real bot frames stay fresh during live play');
    checks.push('both native bots move more than 64 units after readiness');
  }
  socket.close();
  await once(socket, 'close');
  await until(live.status, value => value.state === 'sleeping', 'idle sleep');
  check(resources(live.id), {processes: [], sessions: []}, 'idle sleep cleans child and temporary session');
  if (bots) {
    check((await live.status()).bots, 0, 'bot presence does not hold idle lifecycle');
    check((await live.status()).botStatus, 'sleeping', 'sleeping match never reports bots as starting');
    if (population) check((await live.status()).botTarget, null, 'sleep clears the native population target');
  }
  const restarted = await (await live.authorized('/api/doom3/wake', {method: 'POST'})).json();
  check(restarted.state, 'running', 'Play wakes after idle');
  if (bots) check(restarted.bots, 2, 'new native process recreates both bot brains after idle');
  if (population) check(restarted.botTarget, 2, 'wake restores the actual native automatic target');
  const [pid] = resources(live.id).processes;
  assert.ok(Number.isInteger(pid) && pid > 1);
  docker('exec', live.id, 'node', '-e', 'process.kill(Number(process.argv[1]), "SIGTERM")', String(pid));
  await until(live.status, value => value.state === 'sleeping', 'unexpected child-exit recovery');
  check(resources(live.id), {processes: [], sessions: []}, 'unexpected child exit cleans temporary session');
  check((await (await live.authorized('/api/doom3/wake', {method: 'POST'})).json()).state, 'running', 'Play recovers after native exit');

  const broken = await start({withData: true, extra: ['D3_NATIVE_ROOT=/missing-native-fixture']});
  check((await broken.authorized('/api/doom3/wake', {method: 'POST'})).status, 500, 'spawn failure reported');
  check((await broken.status()).state, 'failed', 'spawn failure is not running');
  check(resources(broken.id), {processes: [], sessions: []}, 'spawn failure cleans temporary session');
  check((await broken.authorized('/api/doom3/wake', {method: 'POST'})).status, 500, 'failed startup can be attempted again');
  check(resources(broken.id), {processes: [], sessions: []}, 'repeated failure does not leak');

  const suite = await start({extra: ['WASM_GAME_VARIANT=suite']});
  check((await (await suite.authorized('/game-data/status')).json()).variantRequired, true, 'managed suite preserves variant selection');
  assert.match(await (await suite.request('/wasm-game-config.js')).text(), /WASM_GAME_VARIANT = "suite"/);
  checks.push('suite variant configuration preserved');
  const proof = {scope: 'Actual packaged supervisor, framework password/data gates, real native map readiness and process/session lifecycle in isolated containers. WebSocket peer holds idle lifecycle but does not join as a native player; this is not a Chrome test.' + (bots ? ' Bot-enabled profile also proves actual native roster, movement, bot archive integrity and empty sleep/rewake.' : ' Bots are not established here.'),
    image: docker('image', 'inspect', image, '--format', '{{.Id}}'), checks, passed: true};
  if (process.env.D3_MANAGED_HTTP_PROOF) fs.writeFileSync(process.env.D3_MANAGED_HTTP_PROOF, JSON.stringify(proof, null, 2) + '\n');
  console.log(JSON.stringify(proof, null, 2));
} catch (error) {
  for (const id of containers) console.error(docker('logs', '--tail', '20', id));
  throw error;
} finally {
  for (const id of containers) docker('rm', '-f', '-v', id);
}
