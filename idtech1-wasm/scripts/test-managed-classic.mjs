#!/usr/bin/env node
// Real isolated managed server/bots; never targets the running lab container.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const exec = promisify(execFile);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const image = process.env.IDTECH1_TEST_IMAGE || 'idtech1-wasm:dev';
const fromImage = Boolean(process.env.IDTECH1_TEST_FROM_IMAGE);
const missingBots = process.argv.includes('--missing-bots');
const binaries = process.env.IDTECH1_NATIVE_BOT_DIR;
assert.ok(fromImage || (binaries && path.isAbsolute(binaries)));
const docker = async args => (await exec('docker', args, { timeout: 45000 })).stdout.trim();
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let container;
const results = [];
try {
  container = await docker(['run', '--rm', '-d', '-p', '127.0.0.1::8088',
    '-v', `${process.env.IDTECH1_DATA_DIR || '/home/ted/wasm-game-data/crispy'}:/data:ro`,
    ...(!fromImage ? ['-v', `${repo}/server/supervisor.js:/opt/idtech1-server/supervisor.js:ro`,
      '-v', `${repo}/server/classic-match.js:/opt/idtech1-server/classic-match.js:ro`,
      '-v', `${binaries}:/opt/classic-bots:ro`] : []),
    '-e', 'IDLE_TIMEOUT=2s', '-e', 'IDTECH1_LAUNCH_LEASE_MS=1000',
    ...(missingBots ? ['-e', 'IDTECH1_CLASSIC_BOT_ROOT=/missing-classic-bots'] : []),
    '-e', 'IDTECH1_CLASSIC_LOBBY_GRACE_MS=3000', image]);
  assert.match(container, /^[a-f0-9]{64}$/);
  const origin = 'http://' + await docker(['port', container, '8088/tcp']);
  const status = async () => (await fetch(`${origin}/status`)).json();
  async function waitFor(predicate, ms = 15000) {
    const until = Date.now() + ms;
    while (Date.now() < until) {
      try { const value = await status(); if (predicate(value)) return value; } catch {}
      await delay(50);
    }
    throw new Error('Timed out waiting for managed Classic state');
  }
  const wake = async variant => {
    const response = await fetch(`${origin}/wake`, { method: 'POST',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify({ variant, engine: 'classic' }) });
    return { code: response.status, status: await response.json() };
  };
  async function rejectRelay(wsPath) {
    const socket = new WebSocket(origin.replace(/^http/, 'ws') + wsPath);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { socket.close(); reject(new Error('Relay rejection timed out')); }, 5000);
      socket.addEventListener('open', () => {
        clearTimeout(timer); socket.close(); reject(new Error('Unavailable Classic relay was accepted'));
      }, { once: true });
      socket.addEventListener('error', () => { clearTimeout(timer); resolve(); }, { once: true });
    });
  }
  const nativeProcesses = async () => JSON.parse(await docker(['exec', container, 'node', '-e',
    "const fs=require('node:fs');const found=[];for(const id of fs.readdirSync('/proc').filter(n=>/^\\d+$/.test(n))){try{const binary=fs.readFileSync('/proc/'+id+'/cmdline','utf8').split('\\0')[0];if(binary==='/usr/games/chocolate-server'||binary.startsWith('/opt/classic-bots/classic-bot-'))found.push({pid:Number(id),binary});}catch{}}console.log(JSON.stringify(found))"]));
  await waitFor(() => true);
  if (missingBots) {
    for (let attempt = 0; attempt < 2; ++attempt) {
      const failed = await wake('doom2');
      assert.equal(failed.code, 500);
      assert.match(failed.status.error, /ENOENT/);
      assert.deepEqual(await nativeProcesses(), [], 'failed startup must not leak the relay');
      const directories = JSON.parse(await docker(['exec', container, 'node', '-e',
        "console.log(JSON.stringify(require('node:fs').readdirSync('/tmp').filter(n=>n.startsWith('idtech1-classic-'))))"]));
      assert.deepEqual(directories, [], 'failed startup must clean only its generated sessions');
      results.push({ missingBotBinary: true, failedStartupCleaned: true, attempt });
    }
  }
  for (const game of (missingBots || process.argv.includes('--joins') ? [] : ['doom', 'doom2', 'tnt', 'plutonia', 'heretic', 'hexen', 'chex', 'doom2'])) {
    const match = await wake(game);
    assert.equal(match.code, 200, JSON.stringify(match));
    assert.equal(match.status.bots, 2);
    assert.equal(match.status.lobbyPlayers, 2);
    assert.equal(match.status.matchPhase, 'waiting', 'bots alone must not start the match');
    assert.equal(match.status.humans, 0);
    assert.equal(match.status.peers, 0);
    const conflict = await wake(game === 'doom' ? 'heretic' : 'doom');
    assert.equal(conflict.code, 409);
    await delay(1700);
    assert.notEqual((await status()).matchPhase, 'playing', 'no human means no countdown launch');
    const asleep = await waitFor(value => value.state === 'sleeping');
    assert.equal(asleep.bots, 0);
    const directories = await docker(['exec', container, 'node', '-e',
      "const fs=require('node:fs');console.log(JSON.stringify(fs.readdirSync('/tmp').filter(n=>n.startsWith('idtech1-classic-'))))"]);
    assert.deepEqual(JSON.parse(directories), [], 'idle cleanup must remove its own temporary sessions');
    assert.deepEqual(await nativeProcesses(), [], 'idle cleanup must stop bots and relay');
    await rejectRelay(match.status.wsPath);
    assert.equal((await status()).state, 'sleeping', 'a stale relay must not wake the match');
    results.push({ game, ready: match.status, idleCleanup: true, staleRelayRejected: true });
    console.error(`PASS ${game} managed bots: lobby, reservation, idle cleanup`);
  }
  for (const invalid of ['not-a-game', '__proto__', 'constructor']) {
    assert.equal((await wake(invalid)).code, 409);
  }
  if (process.argv.includes('--joins')) {
    const games = (process.env.IDTECH1_TEST_GAMES || 'doom,doom2,tnt,plutonia,heretic,hexen,chex').split(',');
    assert.ok(games.every(game => ['doom', 'doom2', 'tnt', 'plutonia', 'heretic', 'hexen', 'chex'].includes(game)));
    for (const game of games) for (const profile of ['original', 'smooth']) {
      const selected = await wake(game);
      assert.equal(selected.code, 200, JSON.stringify(selected));
      const run = exec(process.execPath, [path.join(repo, 'scripts/test-crispy-runtime.mjs'),
        game, '--network', ...(profile === 'smooth' ? ['--smooth'] : [])], {
        timeout: 90000, maxBuffer: 2 * 1024 * 1024,
        env: { ...process.env, IDTECH1_BOT_TEST_MS: '10000',
          IDTECH1_CLASSIC_WS_URL: origin.replace(/^http/, 'ws') + selected.status.wsPath }
      });
      // Observe the real WS peer and native lobby; bots must not inflate humans.
      run.catch(() => {});
      const playing = await waitFor(value => value.matchPhase === 'playing' && value.humans === 1);
      assert.equal(playing.bots, 2);
      assert.equal(playing.lobbyPlayers, 3);
      assert.equal((await wake(game)).code, 409, 'ordinary late joins must not hang in an already-started match');
      await rejectRelay(selected.status.wsPath);
      assert.equal((await status()).humans, 1, 'rejected late socket must not count as a human');
      const report = JSON.parse((await run).stdout);
      await waitFor(value => value.state === 'sleeping');
      await rejectRelay(selected.status.wsPath);
      results.push({ game, profile, playing, runtime: report, idleCleanup: true,
        lateRelayRejected: true, staleRelayRejected: true });
      console.error(`PASS ${game}/${profile}: managed join, native movement/fire/audio, late-join rejection, idle cleanup`);
    }
    const selected = await wake('doom2');
    assert.equal(selected.code, 200);
    const endpoint = origin.replace(/^http/, 'ws') + selected.status.wsPath;
    const peer = slot => exec(process.execPath, [path.join(repo, 'scripts/test-crispy-runtime.mjs'),
      'doom2', '--network', ...(slot === 3 ? ['--smooth'] : [])], {
      timeout: 90000, maxBuffer: 2 * 1024 * 1024, env: { ...process.env,
        IDTECH1_BOT_TEST_MS: '10000', IDTECH1_CLASSIC_WS_URL: endpoint,
        IDTECH1_CLASSIC_EXPECTED_PLAYERS: '4', IDTECH1_CLASSIC_EXPECTED_SLOT: String(slot),
        IDTECH1_CLASSIC_DRAIN_MS: '3000' }
    });
    const firstPeer = peer(2); firstPeer.catch(() => {});
    const countdown = await waitFor(value => value.lobbyPlayers === 3 && value.matchPhase === 'countdown');
    assert.ok(countdown.joinClosesAt > Date.now());
    const secondPeer = peer(3); secondPeer.catch(() => {});
    const fourPlayers = await waitFor(value => value.matchPhase === 'playing' && value.humans === 2);
    assert.equal(fourPlayers.lobbyPlayers, 4);
    assert.equal(fourPlayers.bots, 2);
    const peers = (await Promise.all([firstPeer, secondPeer])).map(result => JSON.parse(result.stdout));
    assert.deepEqual(peers.map(p => p.consolePlayer), [2, 3]);
    await waitFor(value => value.state === 'sleeping');
    assert.deepEqual(await nativeProcesses(), []);
    results.push({ twoHumanAdmission: true, countdown, playing: fourPlayers, peers, idleCleanup: true });
    console.error('PASS two human clients admitted during countdown: Original + Smooth, slots 2/3, four players');
  }
  for (const target of (missingBots ? [] : ['bot', 'server'])) {
    assert.equal((await wake('doom2')).code, 200);
    const before = await nativeProcesses();
    assert.equal(before.length, 3);
    const process = before.find(p => target === 'server' ? p.binary === '/usr/games/chocolate-server'
      : p.binary.startsWith('/opt/classic-bots/classic-bot-'));
    assert.ok(process);
    await docker(['exec', container, 'node', '-e', `process.kill(${process.pid}, 'SIGTERM')`]);
    await waitFor(value => value.state === 'sleeping');
    assert.deepEqual(await nativeProcesses(), []);
    const recovered = await wake('doom2');
    assert.equal(recovered.code, 200);
    assert.equal(recovered.status.bots, 2);
    await waitFor(value => value.state === 'sleeping');
    results.push({ terminated: target, failureCleanup: true, freshWake: true });
    console.error(`PASS ${target} failure: all children cleaned up, fresh two-bot wake`);
  }
  console.log(JSON.stringify({ passed: true, image, fromImage, results,
    scope: 'Real isolated managed native bots and optional unchanged-Wasm WebSocket joins; not Chrome acceptance' }, null, 2));
} catch (error) {
  console.error(error.stack);
  if (container) console.error(await docker(['logs', '--tail', '65', container]));
  process.exitCode = 1;
} finally {
  if (container) await docker(['stop', '-t', '3', container]);
}
