'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');

const GAMES = Object.freeze({
  doom: { iwad: 'DOOM.WAD', map: 'E1M1', family: 'doom', warp: ['1', '1'] },
  doom2: { iwad: 'DOOM2.WAD', map: 'MAP01', family: 'doom', warp: ['1'] },
  tnt: { iwad: 'TNT.WAD', map: 'MAP01', family: 'doom', warp: ['1'] },
  plutonia: { iwad: 'PLUTONIA.WAD', map: 'MAP01', family: 'doom', warp: ['1'] },
  heretic: { iwad: 'HERETIC.WAD', map: 'E1M1', family: 'heretic', warp: ['1', '1'] },
  hexen: { iwad: 'HEXEN.WAD', map: 'MAP01', family: 'hexen', warp: ['1'] },
  chex: { iwad: 'CHEX.WAD', map: 'E1M1', family: 'doom', warp: ['1', '1'] }
});
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function launch(handle, label, binary, args, env) {
  const client = { child: spawn(binary, args, { cwd: handle.directory,
    env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] }),
    output: '', partial: '', lobby: null, tick: null };
  handle.clients.push(client);
  const fail = error => {
    if (handle.stopping) return;
    handle.failure ||= error;
    handle.options.onFailure?.(error);
  };
  const capture = chunk => {
    const text = String(chunk);
    client.output = (client.output + text).slice(-16000);
    client.partial += text;
    const lines = client.partial.split('\n'); client.partial = lines.pop().slice(-16000);
    for (const line of lines) {
      const match = line.match(/^\[classic-bot\] (\{.*\})$/);
      if (match) {
        let event;
        try { event = JSON.parse(match[1]); } catch { continue; }
        if (event.event === 'lobby-state') {
          client.lobby = event;
          if (event.controller && handle.phase !== 'playing') {
            handle.players = event.players; handle.capacity = event.capacity;
            handle.phase = event.remainingMs >= 0 ? 'countdown' : 'waiting';
            handle.joinClosesAt = event.remainingMs >= 0 ? Date.now() + event.remainingMs : null;
          }
        } else if (event.event === 'match-started' || event.event === 'tick') {
          handle.phase = 'playing'; handle.joinClosesAt = null;
          if (event.event === 'tick') client.tick = event;
        }
      }
      if (/consist[ae]ncy failure|segmentation|error:/i.test(line)) fail(new Error(`${label}: ${line}`));
    }
    handle.options.log?.(`[${label}] ${text}`);
  };
  client.child.stdout.on('data', capture);
  client.child.stderr.on('data', capture);
  client.child.once('error', error => fail(new Error(`${label}: ${error.message}`)));
  client.child.once('exit', (code, signal) => fail(new Error(`${label} exited: ${code ?? signal}`)));
  return client;
}

async function stopClient(client) {
  const child = client.child;
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  await new Promise((resolve, reject) => {
    const kill = setTimeout(() => child.kill('SIGKILL'), 1500);
    const limit = setTimeout(() => { clearTimeout(kill); reject(new Error(`Could not stop native process ${child.pid}`)); }, 5000);
    child.once('exit', () => { clearTimeout(kill); clearTimeout(limit); resolve(); });
    child.kill('SIGTERM');
  });
}

async function stopClassicMatch(handle) {
  if (handle.stopPromise) return handle.stopPromise;
  handle.stopping = true;
  handle.stopPromise = (async () => {
    // Stop clients before the relay, retaining session files if any child
    // cannot be stopped. The directory is the exact mkdtemp result we own.
    await Promise.all(handle.clients.slice(1).map(stopClient));
    if (handle.clients[0]) await stopClient(handle.clients[0]);
    await fs.rm(handle.directory, { recursive: true, force: true });
    handle.phase = 'stopped';
  })();
  return handle.stopPromise;
}

async function startClassicMatch(options) {
  const game = GAMES[options.variant];
  if (!Object.hasOwn(GAMES, options.variant)) throw new Error(`Unsupported classic game: ${options.variant}`);
  if (!Number.isInteger(options.port) || options.port < 1 || options.port > 65535)
    throw new Error('Invalid classic UDP port');
  const graceMs = options.graceMs ?? 8000;
  if (!Number.isInteger(graceMs) || graceMs < 100 || graceMs > 60000)
    throw new Error('Invalid classic lobby grace');
  const handle = { options, game, graceMs, clients: [], phase: 'starting',
    players: 0, capacity: 0, joinClosesAt: null, stopping: false, failure: null,
    directory: await fs.mkdtemp(path.join(os.tmpdir(), 'idtech1-classic-')) };
  try {
    launch(handle, 'chocolate-server', options.server,
      ['-port', String(options.port), ...(options.netlog ? ['-netlog', path.join(handle.directory, 'net.log')] : [])]);
    return handle;
  } catch (error) { await stopClassicMatch(handle); throw error; }
}

async function waitUntilClassicReady(handle) {
  async function waitFor(predicate) {
    const deadline = Date.now() + 12000;
    while (Date.now() < deadline) {
      if (handle.failure) throw handle.failure;
      if (predicate()) return;
      await delay(30);
    }
    throw new Error(`Classic bots did not become ready: ${handle.clients.map(c => c.output.slice(-1500)).join('\n')}`);
  }
  try {
    // Native client connection retries handle relay bind startup. Slot zero
    // must finish joining before the second bot is started.
    await delay(100);
    for (let index = 0; index < 2; ++index) {
      if (handle.failure) throw handle.failure;
      const config = path.join(handle.directory, `bot-${index}.cfg`);
      const extra = path.join(handle.directory, `extra-${index}.cfg`);
      await fs.writeFile(config, `player_name "Lab Bot ${index + 1}"\nuse_mouse 0\nuse_joystick 0\nshow_endoom 0\n`);
      await fs.writeFile(extra, 'crispy_hires 0\ncrispy_uncapped 0\n');
      const { options, game } = handle;
      const client = launch(handle, `classic-bot-${index}`,
        path.join(options.botRoot, `classic-bot-${game.family}`), [
          '-iwad', path.join(options.dataRoot, game.iwad), '-config', config,
          '-extraconfig', extra, '-savedir', handle.directory,
          '-window', '-nofullscreen', '-width', '320', '-height', '200',
          '-nosound', '-nomusic', '-nojoy', '-nograbmouse', '-nomonsters',
          '-deathmatch', '-nodes', '0', '-bot-lobby-grace-ms', String(handle.graceMs),
          '-connect', `127.0.0.1:${options.port}`, '-warp', ...game.warp
        ], { SDL_VIDEODRIVER: 'dummy', SDL_AUDIODRIVER: 'dummy', SDL_RENDER_DRIVER: 'software',
          // Chex's required patch is discovered before -deh arguments. Keep
          // discovery in the packaged support directory, not owner data/cwd.
          DOOMWADPATH: path.join(options.siteRoot, 'dist') });
      await waitFor(() => client.lobby?.slot === index);
    }
    await waitFor(() => handle.clients.slice(1).every(c => c.lobby?.players === 2));
  } catch (error) {
    await stopClassicMatch(handle);
    throw error;
  }
}

function classicMatchStatus(handle) {
  return { bots: handle && !handle.stopping ? handle.clients.slice(1).filter(c =>
    c.lobby && c.child.exitCode === null && c.child.signalCode === null).length : 0,
    matchPhase: handle?.phase || 'idle', lobbyPlayers: handle?.players || 0,
    lobbyCapacity: handle?.capacity || 0, lobbyGraceMs: handle?.graceMs || 8000,
    joinClosesAt: handle?.joinClosesAt || null,
    botPlayers: handle && !handle.stopping ? handle.clients.slice(1).flatMap(client => {
      const sample = client.tick;
      return sample ? [{ slot: sample.slot, tic: sample.tic, health: sample.health,
        weapon: sample.weapon, attackTics: sample.attackTics, frags: sample.frags,
        deaths: sample.deaths }] : [];
    }) : [] };
}

module.exports = { GAMES, startClassicMatch, waitUntilClassicReady, stopClassicMatch, classicMatchStatus };
