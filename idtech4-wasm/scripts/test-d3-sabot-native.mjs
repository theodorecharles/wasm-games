#!/usr/bin/env node
// Isolated SABot integration probe. Does not stage or replace production binaries.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const native = path.resolve(process.env.D3_SABOT_NATIVE || path.join(root, '.work/d3-managed-sabot'));
const pack = path.join(root, '.work/idtech4a-bot-reference/Q3E/src/main/assets/pak/doom3/d3_sabot_a7.pk4');
const expectedPack = 'b15e8f94c2b4ade06d59c093943c512e95f257a237f40224c496710beb7d24ff';
const hash = async file => crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
if (await hash(pack) !== expectedPack) throw new Error('Unrecognized SABot reference pack');
const map = process.env.D3_SABOT_MAP || 'game/mp/d3dm1';
if (!/^game\/mp\/d3dm[1-5]$/.test(map)) throw new Error('Stock multiplayer maps only');
const seconds = Number(process.env.D3_SABOT_SECONDS || 60);
if (!Number.isFinite(seconds) || seconds < 5 || seconds > 300) throw new Error('Duration must be 5–300 seconds');
const owner = process.env.D3_OWNER_DATA || '/home/ted/wasm-game-data/doom3';
const cycle = process.env.D3_SABOT_CYCLE === '1';
const automatic = process.env.D3_SABOT_AUTO === '1';
if (cycle && (map !== 'game/mp/d3dm1' || seconds < 65)) throw new Error('Cycle starts at d3dm1 and needs at least 65 seconds');
const workdir = await fs.mkdtemp(path.join(os.tmpdir(), 'd3-sabot-proof-'));
const name = 'd3-sabot-proof-' + crypto.randomBytes(6).toString('hex');
let child, timer;
let output = '', errors = '', exitCode = null;
const samples = [];
const frames = [];
const now = Date.now();
const waits = new Set();
const delay = ms => new Promise(resolve => { const handle = setTimeout(() => { waits.delete(handle); resolve(); }, ms); waits.add(handle); });
try {
  await fs.mkdir(path.join(workdir, 'base'));
  for (let i = 0; i < 9; ++i) {
    const file = `base/pak00${i}.pk4`;
    await fs.access(path.join(owner, file));
    await fs.symlink('/data/' + file, path.join(workdir, file));
  }
  await fs.symlink('/bot-assets.pk4', path.join(workdir, 'base/zz_sabot.pk4'));
  const set = (key, value) => ['+set', key, String(value)];
  child = spawn('docker', ['run', '--rm', '-i', '--name', name, '--network', 'none',
    '--user', `${process.getuid()}:${process.getgid()}`,
    '-v', `${native}:/native:ro`, '-v', `${owner}:/data:ro`,
    '-v', `${pack}:/bot-assets.pk4:ro`, '-v', `${workdir}:/session`, '-w', '/session',
    'local/idtech4-managed-native-toolchain:bookworm', '/native/dhewm3ded',
    ...set('fs_basepath', '/session'), ...set('fs_cdpath', '/session'),
    ...set('fs_savepath', '/session/save'), ...set('fs_configpath', '/session/save'),
    ...set('sys_tty', 0), ...set('net_ip', '127.0.0.1'), ...set('net_port', 27666),
    ...set('net_LANServer', 1), ...set('si_pure', 0), ...set('si_gameType', 'deathmatch'),
    ...set('si_maxPlayers', 8), ...set('si_warmup', 0), ...set('si_fragLimit', 100),
    ...set('harm_g_autoGenAASFileInMPGame', 0), ...set('harm_si_autoFillBots', automatic ? 2 : 0), ...set('si_map', map),
    '+spawnServer', ...(automatic ? [] : ['+addBots', 'bot_sabot_tinman', 'bot_sabot_fluffy']), '+sabot'],
    {stdio: ['pipe', 'pipe', 'pipe']});
  let partial = '';
  let observedMap = map;
  let phase = 0;
  let cycleNeedsBots = false;
  child.stdout.on('data', data => {
    output += data;
    partial += data;
    const lines = partial.split('\n');
    partial = lines.pop();
    for (const line of lines) {
      const loaded = line.match(/^loading maps\/(game\/mp\/d3dm[1-5])\.botaas48$/);
      if (loaded) {
        if (cycle && loaded[1] !== observedMap) { cycleNeedsBots = !automatic; ++phase; }
        observedMap = loaded[1];
      }
      const match = line.match(/SABOT_SAMPLE (\{.*\})/);
      if (match) samples.push({...JSON.parse(match[1]), map: observedMap, phase});
      const frame = line.match(/SABOT_FRAME (\{.*\})/);
      if (frame) frames.push({...JSON.parse(frame[1]), map: observedMap, phase});
      if (/BotAI initialized|SpawnBotPlayer|ERROR:|FATAL|killed|fragged/i.test(line)) console.log(line);
    }
  });
  child.stderr.on('data', data => { errors += data; });
  child.stdin.on('error', () => {});
  const exited = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', code => { exitCode = code; resolve(); });
  });
  let tick = 0;
  timer = setInterval(() => {
    if (child.exitCode !== null) return;
    ++tick;
    if (cycle && tick % 5 === 0 && tick <= 25) {
      const next = (tick / 5) % 5 + 1;
      // The native map-change command is deferred to a later engine frame.
      child.stdin.write(`set si_map game/mp/d3dm${next}; spawnServer\n`);
    } else if (cycleNeedsBots) {
      cycleNeedsBots = false;
      child.stdin.write('addBots bot_sabot_tinman bot_sabot_fluffy; sabot\n');
    } else child.stdin.write('sabot\n');
  }, 2000);
  await Promise.race([exited, delay(seconds * 1000)]);
  clearInterval(timer);
  if (child.exitCode === null) {
    child.stdin.write('sabot\nquit\n');
    await Promise.race([exited, delay(5000)]);
  }
  const slots = [...new Set(samples.map(s => s.slot))];
  const behavior = slots.map(slot => {
    const observations = samples.filter(s => s.slot === slot);
    const first = observations[0];
    return {slot, samples: observations.length,
      gameTimeMs: observations.at(-1).time - first.time,
      maxDisplacement: Math.max(...observations.map(s => Math.hypot(...s.origin.map((v, i) => v - first.origin[i])))),
      healthValues: [...new Set(observations.map(s => s.health))],
      attackSamples: observations.filter(s => s.buttons & 1).length,
      fragValues: [...new Set(observations.map(s => s.frags))],
      weapons: [...new Set(observations.map(s => s.weapon))]};
  });
  const phases = [...new Set(frames.map(f => f.phase))].map(phase => {
    const phaseFrames = frames.filter(f => f.phase === phase);
    const firstLive = phaseFrames.findIndex(f => f.bots === 2);
    const movement = slots.map(slot => {
      const observations = samples.filter(s => s.phase === phase && s.slot === slot);
      return {slot, samples: observations.length,
        maxDisplacement: observations.length ? Math.max(...observations.map(s => Math.hypot(...s.origin.map((v, i) => v - observations[0].origin[i])))) : 0};
    });
    // A full map change deletes all players; automatic mode relies on the
    // engine policy, while manual mode explicitly refills after map load.
    // Keep zero-population transition samples visible and bound recovery.
    return {phase, map: phaseFrames[0].map, firstLiveTime: firstLive < 0 ? null : phaseFrames[firstLive].time, movement,
      passed: firstLive >= 0 && phaseFrames[firstLive].time < 5000
        && phaseFrames.slice(0, firstLive).every(f => f.bots === 0)
        && phaseFrames.slice(firstLive).length >= 2 && phaseFrames.slice(firstLive).every(f => f.bots === 2)
        && movement.every(m => m.samples >= 2 && m.maxDisplacement > 64)};
  });
  const proof = {scope: 'Real native SABot AI/script/physics, no browser or human-client acceptance; no injected movement/combat.',
    sourceCommit: '31e877e7e4e691ed9f98603da9cd95ac59540cf3',
    botReferenceCommit: 'dea1eb9f122cfae042961cfc32a3474e59354589', packSHA256: expectedPack,
    serverSHA256: await hash(path.join(native, 'dhewm3ded')), gameSHA256: await hash(path.join(native, 'base.so')),
    map, cycle, automatic, wallTimeMs: Date.now() - now, exitCode, behavior, phases, frames, samples, output, errors,
    passed: exitCode === 0 && slots.length === 2 && /Bot AAS loaded: 1/.test(output)
      && frames.length >= 3 && (cycle ? phases.length === 6 && phases.every(p => p.passed)
        && new Set(frames.map(f => f.map)).size === 5 && frames.at(-1).map === map : automatic ? phases.every(p => p.passed) : frames.every(f => f.bots === 2))
      && (!automatic || frames.every(f => f.humans === 0 && f.target === 2))
      && behavior.every(b => b.gameTimeMs > 3000 && b.maxDisplacement > 64)};
  if (process.env.D3_SABOT_PROOF) await fs.writeFile(process.env.D3_SABOT_PROOF, JSON.stringify(proof, null, 2) + '\n');
  console.log(JSON.stringify({...proof, output: output.slice(-800), errors, frames: frames.length, samples: samples.length}, null, 2));
  if (!proof.passed) process.exitCode = 1;
} finally {
  clearInterval(timer);
  for (const handle of waits) clearTimeout(handle);
  // Only this randomly named test container and its mkdtemp session are removed.
  await new Promise(resolve => { const stop = spawn('docker', ['rm', '-f', name], {stdio: 'ignore'}); stop.once('exit', resolve); stop.once('error', resolve); });
  await fs.rm(workdir, {recursive: true, force: true});
}
