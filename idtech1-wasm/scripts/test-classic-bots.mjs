#!/usr/bin/env node
// Isolated real native UDP clients/server. Not browser acceptance. No lab writes.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const exec = promisify(execFile);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const binaryDir = process.env.IDTECH1_NATIVE_BOT_DIR;
assert.ok(binaryDir && path.isAbsolute(binaryDir), 'set IDTECH1_NATIVE_BOT_DIR to the built native bin directory');
const dataDir = process.env.IDTECH1_DATA_DIR || '/home/ted/wasm-game-data/crispy';
const game = process.argv[2] || 'doom2';
const withWasm = process.argv.includes('--wasm');
const wadNames = { doom: 'DOOM.WAD', doom2: 'DOOM2.WAD', tnt: 'TNT.WAD',
  plutonia: 'PLUTONIA.WAD', heretic: 'HERETIC.WAD', hexen: 'HEXEN.WAD', chex: 'CHEX.WAD' };
assert.ok(wadNames[game]);
const family = ['heretic', 'hexen'].includes(game) ? game : 'doom';
const digest = async file => createHash('sha256').update(await fs.readFile(file)).digest('hex');
const artifactHashes = {
  bot: await digest(path.join(binaryDir, `classic-bot-${family}`)),
  commandProducer: await digest(path.join(repo, 'bots/classic-bot.c')),
  lobbyPolicy: await digest(path.join(repo, 'bots/classic-bot-lobby.c')),
  build: await digest(path.join(repo, 'bots/CMakeLists.txt'))
};
const duration = Number(process.env.IDTECH1_BOT_TEST_MS || 25000);
assert.ok(duration >= 5000 && duration <= 300000);
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'classic-bot-native-'));
const clients = [];
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const docker = async args => (await exec('docker', args, { timeout: 45000 })).stdout.trim();
let container;
let reference;
let referenceReport;
function events(client) {
  return [...client.output.matchAll(/\[classic-bot\] (\{[^\n]+\})/g)].map(match => JSON.parse(match[1]));
}
async function waitFor(predicate, timeout = 10000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (reference) assert.ok(reference.child.exitCode === null || reference.child.exitCode === 0, reference.output);
    for (const client of clients) {
      assert.equal(client.child.exitCode, null, `native bot exited: ${client.output.slice(-2500)}`);
      assert.ok(!/consistency failure|consistancy failure|segmentation|error:/i.test(client.output), client.output.slice(-2500));
    }
    if (predicate()) return;
    await delay(40);
  }
  throw new Error(`Timed out waiting for native bots: ${clients.map(c => c.output.slice(-2000)).join('\n')}`);
}
try {
  for (let i = 0; i < 2; ++i) {
    await fs.writeFile(path.join(temp, `bot-${i}.cfg`),
      `player_name "Lab Bot ${i + 1}"\nuse_mouse 0\nuse_joystick 0\nshow_endoom 0\n`);
    await fs.writeFile(path.join(temp, `extra-${i}.cfg`), 'crispy_hires 0\ncrispy_uncapped 0\n');
  }
  container = await docker(['run', '--rm', '-d',
    ...(withWasm ? ['-p', '127.0.0.1::2342/udp'] : []),
    '-v', `${binaryDir}:/bots:ro`, '-v', `${dataDir}:/data:ro`,
    '-v', `${temp}:/session`, '-v', `${repo}/web/dist/chex.deh:/chex.deh:ro`,
    '--entrypoint', '/usr/games/chocolate-server', 'idtech1-wasm:dev', '-port', '2342']);
  assert.match(container, /^[a-f0-9]{64}$/);
  for (let i = 0; i < 2; ++i) {
    const args = ['exec', '-e', 'SDL_VIDEODRIVER=dummy', '-e', 'SDL_AUDIODRIVER=dummy',
      '-e', 'SDL_RENDER_DRIVER=software', container, `/bots/classic-bot-${family}`,
      '-iwad', `/data/${wadNames[game]}`, '-config', `/session/bot-${i}.cfg`,
      '-extraconfig', `/session/extra-${i}.cfg`, '-savedir', '/session',
      '-window', '-nofullscreen', '-width', '320', '-height', '200',
      '-nosound', '-nomusic', '-nojoy', '-nograbmouse', '-nomonsters',
      '-deathmatch', '-nodes', withWasm ? '3' : '2', '-connect', '127.0.0.1:2342', '-warp', '1',
      ...(!['doom2', 'tnt', 'plutonia', 'hexen'].includes(game) ? ['1'] : []),
      ...(game === 'chex' ? ['-deh', '/chex.deh'] : [])];
    const client = { child: spawn('docker', args), output: '' };
    clients.push(client);
    const capture = chunk => { client.output = (client.output + chunk).slice(-1048576); };
    client.child.stdout.on('data', capture);
    client.child.stderr.on('data', capture);
    await waitFor(() => events(client).some(event => event.event === 'lobby'));
  }
  if (withWasm) {
    const endpoint = await docker(['port', container, '2342/udp']);
    assert.match(endpoint, /^127\.0\.0\.1:\d+$/);
    reference = { output: '', errors: '', child: spawn(process.execPath,
      [path.join(repo, 'scripts/test-crispy-runtime.mjs'), game, '--network', '--nosound',
        ...(process.argv.includes('--smooth') ? ['--smooth'] : [])],
      { env: { ...process.env, IDTECH1_CLASSIC_UDP_PORT: endpoint.split(':')[1] } }) };
    reference.child.stdout.on('data', chunk => { reference.output += chunk; });
    reference.child.stderr.on('data', chunk => { reference.errors += chunk; });
  }
  await waitFor(() => clients.every(client => events(client).some(event => event.event === 'tick')));
  await delay(duration);
  await waitFor(() => true);
  if (reference) {
    await waitFor(() => reference.child.exitCode !== null, 15000);
    referenceReport = JSON.parse(reference.output);
  }
  const results = clients.map((client, index) => {
    const samples = events(client).filter(event => event.event === 'tick');
    assert.ok(samples.length >= 5, `bot ${index} must keep simulating`);
    const x = samples.map(s => s.x), y = samples.map(s => s.y);
    const moved = Math.max(Math.max(...x) - Math.min(...x), Math.max(...y) - Math.min(...y));
    assert.ok(moved > 96, `bot ${index} must navigate, not just turn in place (${moved} units)`);
    return { slot: samples[0].slot, moved, attacks: samples.filter(s => s.attack).length,
      attackTics: Math.max(...samples.map(s => s.attackTics || 0)),
      frags: Math.max(...samples.map(s => s.frags || 0)),
      deaths: Math.max(...samples.map(s => s.deaths || 0)),
      healthChanged: samples.some(s => s.health < 100),
      anyPlayerHealthChanged: samples.some(s => s.playerHealth?.some(h => h !== null && h < 100)), samples };
  });
  assert.deepEqual(results.map(result => result.slot), [0, 1]);
  assert.ok(results.some(result => result.attacks > 0 || result.attackTics > 0), 'bots must acquire and attack a real opponent');
  assert.ok(results.some(result => result.healthChanged || (withWasm && result.anyPlayerHealthChanged)),
    'a real player must lose health during the combat smoke test');
  if (process.argv.includes('--require-frag'))
    assert.ok(results.some(result => result.frags > 0), 'native simulation must credit an opponent kill');
  console.log(JSON.stringify({ passed: true, game, duration, artifactHashes, results,
    reference: referenceReport,
    scope: 'real native bot clients and Chocolate UDP server; optional shipped-Wasm peer; not Chrome acceptance' }, null, 2));
} catch (error) {
  console.log(JSON.stringify({ passed: false, game, duration, artifactHashes,
    error: error.message, results: clients.map(client => ({ samples: events(client)
      .filter(event => event.event === 'tick') })),
    reference: referenceReport,
    scope: 'failed native bot diagnostic; not Chrome acceptance' }, null, 2));
  console.error(error.stack);
  for (const [i, client] of clients.entries()) console.error(`BOT ${i}\n${client.output.slice(-6000)}`);
  if (reference) console.error(`WASM\n${reference.errors}\n${reference.output}`);
  process.exitCode = 1;
} finally {
  if (container) await docker(['stop', '-t', '2', container]);
  if (reference?.child.exitCode === null) reference.child.kill('SIGTERM');
  await fs.rm(temp, { recursive: true, force: true });
}
