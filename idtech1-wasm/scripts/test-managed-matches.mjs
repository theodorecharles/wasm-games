#!/usr/bin/env node
// Disposable real-server integration. Never addresses or replaces a lab service.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const exec = promisify(execFile);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const legacy = process.argv.includes('--legacy');
const expectMenuBug = process.argv.includes('--expect-menu-bug');
const expectSilent = process.argv.includes('--expect-silent');
const image = process.env.IDTECH1_TEST_IMAGE || 'idtech1-wasm:dev';
const docker = async args => (await exec('docker', args, { timeout: 45000 })).stdout.trim();
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let container;
let socket;
const results = [];
const games = (process.env.IDTECH1_TEST_GAMES || 'doom2,doom,tnt,plutonia,heretic,hexen,chex').split(',');
assert.ok(games.length && games.every(game => ['doom2', 'doom', 'tnt', 'plutonia', 'heretic', 'hexen', 'chex'].includes(game)));
try {
  container = await docker(['run', '--rm', '-d', '-p', '127.0.0.1::8088',
    '-v', `${process.env.IDTECH1_DATA_DIR || '/home/ted/wasm-game-data/crispy'}:/data:ro`,
    ...(!legacy && !process.env.IDTECH1_TEST_FROM_IMAGE ?
      ['-v', `${repo}/server/supervisor.js:/opt/idtech1-server/supervisor.js:ro`,
        '-v', `${repo}/server/classic-match.js:/opt/idtech1-server/classic-match.js:ro`,
        ...(process.env.IDTECH1_NATIVE_BOT_DIR ? ['-v', `${process.env.IDTECH1_NATIVE_BOT_DIR}:/opt/classic-bots:ro`] : [])] : []),
    '-e', 'IDLE_TIMEOUT=2s', '-e', 'IDTECH1_LAUNCH_LEASE_MS=1000', image]);
  assert.match(container, /^[a-f0-9]{64}$/);
  const origin = 'http://' + await docker(['port', container, '8088/tcp']);
  async function status() { return (await fetch(`${origin}/status`)).json(); }
  async function waitFor(predicate, timeout = 10000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) { try { const value = await status(); if (predicate(value)) return value; } catch (_) {} await delay(40); }
    throw new Error('Timed out waiting for managed match state');
  }
  async function wake(variant, engine = 'zandronum') {
    const response = await fetch(`${origin}/wake`, { method: 'POST',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify({ engine, variant }) });
    return { status: response.status, body: await response.json() };
  }
  await waitFor(() => true);
  const first = await wake('doom');
  assert.equal(first.status, 200);
  assert.equal(first.body.variant, 'doom');
  if (legacy) {
    const second = await wake('heretic');
    assert.equal(second.status, 200);
    assert.equal(second.body.variant, 'doom', 'negative control must reproduce stale game selection');
    assert.equal(second.body.startedAt, first.body.startedAt);
    results.push({ expectedStaleSelection: true, requested: 'heretic', received: second.body });
  } else {
    const reserved = await wake('heretic');
    assert.equal(reserved.status, 409, 'an in-flight launch must reserve its match');
    const unchanged = await wake('doom');
    assert.equal(unchanged.body.startedAt, first.body.startedAt);
    assert.equal(unchanged.body.wsPath, first.body.wsPath);
    const simultaneous = await Promise.all([wake('doom'), wake('doom')]);
    assert.ok(simultaneous.every(value => value.status === 200 && value.body.startedAt === first.body.startedAt &&
      value.body.wsPath === first.body.wsPath), 'concurrent same-match launches must reuse one server');
    socket = new WebSocket(origin.replace(/^http/, 'ws') + first.body.wsPath);
    await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
    await waitFor(value => value.humans === 1);
    const busy = await wake('heretic');
    assert.equal(busy.status, 409, 'a launch must not evict another connected player');
    assert.equal((await status()).variant, 'doom');
    socket.close(); socket = null;
    await waitFor(value => value.humans === 0);
    const switched = await wake('heretic');
    assert.equal(switched.status, 200);
    assert.equal(switched.body.variant, 'heretic');
    assert.notEqual(switched.body.wsPath, first.body.wsPath);
    const stale = new WebSocket(origin.replace(/^http/, 'ws') + first.body.wsPath);
    await new Promise((resolve, reject) => {
      stale.addEventListener('open', () => { stale.close(); reject(new Error('stale relay was accepted')); });
      stale.addEventListener('error', resolve, { once: true });
    });
    const invalid = await wake('not-a-game');
    assert.equal(invalid.status, 409);
    assert.equal((await status()).variant, 'heretic');
    results.push({ reservationConflict: reserved.status, concurrentSameMatch: true, connectedConflict: busy.status,
      idleVariantSwitch: switched.body, staleRelayRejected: true, invalidVariantRejected: true });
    await waitFor(value => value.state === 'sleeping');
    const classic = await wake('doom2', 'classic');
    assert.equal(classic.body.mode, 'classic');
    await waitFor(value => value.state === 'sleeping');
    const modern = await wake('doom2');
    assert.equal(modern.body.mode, 'modernized');
    results.push({ classicThenModern: true });
    for (const game of games) {
      if ((await status()).humans > 0) await waitFor(value => value.humans === 0);
      // No waiting for the five-minute production idle timeout between titles.
      const { stdout, stderr } = await exec(process.execPath, [path.join(repo, 'scripts/test-zandronum-runtime.mjs'), game,
        ...['--audio', '--expect-silent', '--suspended'].filter(flag => process.argv.includes(flag)),
        ...(expectMenuBug ? ['--expect-menu-bug'] : [])],
        { timeout: 35000 + Number(process.env.IDTECH1_TEST_SUSTAIN_MS || 0), maxBuffer: 2 * 1024 * 1024,
          env: { ...process.env, IDTECH1_TEST_URL: origin } });
      results.push(JSON.parse(stdout));
      console.error(`PASS ${game} native multiplayer${stderr ? '\n' + stderr : ''}`);
    }
    await waitFor(value => value.state === 'sleeping');
    results.push({ idleShutdown: true });
  }
  console.log(JSON.stringify({ passed: true, negativeControl: legacy || expectMenuBug || expectSilent, image,
    supervisorFromImage: Boolean(process.env.IDTECH1_TEST_FROM_IMAGE) || legacy, results,
    scope: 'real disposable native servers and native Wasm; fake DOM/2D; not Chrome/GPU/audio acceptance' }, null, 2));
} catch (error) {
  console.error(error.stderr || error.stack);
  if (container) console.error(await docker(['logs', '--tail', '45', container]));
  process.exitCode = 1;
} finally {
  socket?.close();
  if (container) await docker(['stop', container]);
}
