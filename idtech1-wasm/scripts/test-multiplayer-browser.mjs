#!/usr/bin/env node

import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const cdpBase = process.env.IDTECH1_CDP || 'http://127.0.0.1:9225';
const secondCdpBase = process.env.IDTECH1_CDP_SECOND || 'http://127.0.0.1:9226';
const gameBase = process.env.IDTECH1_TEST_URL || 'http://127.0.0.1:4184';
const allGames = Object.freeze(['doom', 'doom2', 'tnt', 'plutonia', 'heretic', 'hexen', 'chex']);
const allProfiles = Object.freeze(['original', 'smooth', 'modernized']);
const timeoutMs = Number(process.env.IDTECH1_TEST_TIMEOUT || 120000);

function selectedValues(flag, fallback) {
  const index = process.argv.indexOf(flag);
  if (index < 0) return [...fallback];
  return String(process.argv[index + 1] || '').split(',').map(value => value.trim()).filter(Boolean);
}

const games = selectedValues('--games', allGames);
const profiles = selectedValues('--profiles', allProfiles);
const outputIndex = process.argv.indexOf('--output');
const outputPath = outputIndex < 0 ? '' : String(process.argv[outputIndex + 1] || '').trim();
for (const game of games) assert(allGames.includes(game), `Unknown game: ${game}`);
for (const profile of profiles) assert(allProfiles.includes(profile), `Unknown multiplayer profile: ${profile}`);
if (outputIndex >= 0) assert(outputPath, '--output requires a report path.');
assert.notEqual(cdpBase, secondCdpBase,
  'Multiplayer proof requires two independent Chrome debugging endpoints.');

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function json(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`${options?.method || 'GET'} ${url}: ${response.status} ${await response.text()}`);
  return response.json();
}

class CdpPage {
  constructor(target, browserBase) {
    this.target = target;
    this.browserBase = browserBase;
    this.sequence = 0;
    this.pending = new Map();
    this.socket = null;
    this.logs = [];
  }

  async connect() {
    this.socket = new WebSocket(this.target.webSocketDebuggerUrl);
    this.socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.method === 'Runtime.consoleAPICalled') {
        const value = message.params.args.map(argument => argument.value ?? argument.description ?? '').join(' ');
        this.logs.push(`${message.params.type}: ${value}`);
        if (process.env.IDTECH1_LIVE_LOGS) process.stderr.write(`[browser] ${message.params.type}: ${value}\n`);
        if (process.env.IDTECH1_LIVE_LOGS && /Aborted|ABORT|RuntimeError/.test(String(value))) {
          process.stderr.write(`[browser-history] ${JSON.stringify(this.logs.slice(-80))}\n`);
        }
        this.logs = this.logs.slice(-80);
        return;
      }
      if (message.method === 'Log.entryAdded') {
        this.logs.push(`${message.params.entry.level}: ${message.params.entry.text}`);
        if (process.env.IDTECH1_LIVE_LOGS) process.stderr.write(`[browser] ${message.params.entry.level}: ${message.params.entry.text}\n`);
        this.logs = this.logs.slice(-80);
        return;
      }
      if (message.method === 'Runtime.exceptionThrown') {
        const detail = message.params.exceptionDetails;
        const value = detail.exception?.description || detail.text || JSON.stringify(detail);
        this.logs.push(`exception: ${value}`);
        if (process.env.IDTECH1_LIVE_LOGS) process.stderr.write(`[browser-exception] ${value}\n`);
        return;
      }
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message || JSON.stringify(message.error)));
      else pending.resolve(message.result);
    });
    await new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
    await this.call('Page.enable');
    await this.call('Runtime.enable');
    await this.call('Log.enable');
    return this;
  }

  call(method, params = {}) {
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const result = await this.call('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true
    });
    if (result.exceptionDetails) {
      const description = result.exceptionDetails.exception?.description ||
        result.exceptionDetails.exception?.value || result.exceptionDetails.text || 'Browser evaluation failed.';
      throw new Error(String(description));
    }
    return result.result.value;
  }

  async telemetry() {
    return this.evaluate(`(() => {
      const d = document.documentElement.dataset;
      const canvas = document.querySelector('canvas');
      const rect = canvas?.getBoundingClientRect();
      return {
        url: location.href,
        runtime: d.doomRuntime || '',
        state: d.shellEngineState || '',
        frames: Number(d.doomFrames || 0),
        fps: Number(d.doomFps || 0),
        testKeys: d.multiplayerTestKeys || '',
        activeElement: document.activeElement?.id || document.activeElement?.tagName || '',
        captured: d.shellInputCaptured || '',
        netgame: Number(d.doomNetgame || 0),
        lobbyPlayers: Number(d.doomLobbyPlayers ?? -1),
        lobbyController: Number(d.doomLobbyController || 0),
        waitingLaunch: Number(d.doomWaitingLaunch || 0),
        players: Number(d.doomPlayers || 0),
        slot: Number(d.doomConsolePlayer ?? -1),
        player: d.doomPlayer || '',
        attack: Number(d.doomAttackDown || 0),
        serverState: d.doomServerState || '',
        serverPeers: Number(d.doomServerPeers || 0),
        canvas: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null,
        join: (() => {
          const button = document.getElementById('join-deathmatch');
          return button ? { disabled: button.disabled, hidden: button.hidden, text: button.textContent } : null;
        })()
      };
    })()`);
  }

  async waitFor(description, predicate, limit = timeoutMs) {
    const deadline = Date.now() + limit;
    let last;
    let lastError;
    while (Date.now() < deadline) {
      try {
        last = await this.telemetry();
        lastError = null;
        if (predicate(last)) return last;
      } catch (error) {
        // Navigation briefly destroys the initial about:blank execution
        // context. Treat that as a transient condition while the page loads.
        lastError = error;
      }
      await delay(100);
    }
    throw new Error(`Timed out waiting for ${description}; last telemetry=${JSON.stringify(last)} ` +
      `last error=${lastError?.message || 'none'} console=${JSON.stringify(this.logs.slice(-30))}`);
  }

  async close() {
    try { this.socket?.close(); } catch (_) { /* already closed */ }
    await fetch(`${this.browserBase}/json/close/${this.target.id}`).catch(() => undefined);
  }
}

async function newPage(url, browserBase) {
  const target = await json(`${browserBase}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
  return new CdpPage(target, browserBase).connect();
}

async function closeStaleTestPages() {
  const prefix = `${gameBase}/?`;
  for (const browserBase of new Set([cdpBase, secondCdpBase])) {
    const targets = await json(`${browserBase}/json/list`);
    for (const target of targets) {
      if (target.type === 'page' && target.url.startsWith(prefix) && target.url.includes('mpmatrix=')) {
        await fetch(`${browserBase}/json/close/${target.id}`).catch(() => undefined);
      }
    }
  }
}

async function waitForServer(predicate, description, limit = timeoutMs) {
  const deadline = Date.now() + limit;
  let status;
  while (Date.now() < deadline) {
    status = await json(`${gameBase}/status`);
    if (predicate(status)) return status;
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${description}; last status=${JSON.stringify(status)}`);
}

function parsePlayer(value) {
  const fields = String(value).split(',').map(Number);
  assert.equal(fields.length, 4, `Invalid player telemetry: ${value}`);
  assert(fields.every(Number.isFinite), `Non-numeric player telemetry: ${value}`);
  return { x: fields[0], y: fields[1], angle: fields[2], pitch: fields[3] };
}

async function focusCanvas(page) {
  await page.call('Page.bringToFront');
  await page.evaluate(`(() => {
    document.documentElement.dataset.multiplayerTestKeys = '';
    if (!window.__multiplayerKeyProbe) {
      window.__multiplayerKeyProbe = true;
      document.addEventListener('keydown', event => {
        document.documentElement.dataset.multiplayerTestKeys +=
          'down:' + event.key + ':' + event.code + ';';
      });
      document.addEventListener('keyup', event => {
        document.documentElement.dataset.multiplayerTestKeys +=
          'up:' + event.key + ':' + event.code + ';';
      });
    }
  })()`);
  const telemetry = await page.telemetry();
  assert(telemetry.canvas, 'Gameplay canvas is missing.');
  const x = telemetry.canvas.x + telemetry.canvas.width / 2;
  const y = telemetry.canvas.y + telemetry.canvas.height / 2;
  await page.call('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
  await delay(80);
  await page.call('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
  await page.evaluate(`document.querySelector('canvas')?.focus({preventScroll:true})`);
  await page.waitFor('pointer-lock input capture', value => value.captured === 'true', 5000);
  // Let SDL observe the pointer-lock transition before the first held key.
  await delay(300);
  return { x, y };
}

async function proveInput(page) {
  const center = await focusCanvas(page);
  const beforeMove = parsePlayer((await page.telemetry()).player);
  const movementKeys = [
    { key: 'w', code: 'KeyW', virtualKey: 87 },
    { key: 's', code: 'KeyS', virtualKey: 83 },
    { key: 'd', code: 'KeyD', virtualKey: 68 },
    { key: 'a', code: 'KeyA', virtualKey: 65 }
  ];
  let moved;
  let movementKey;
  for (const candidate of movementKeys) {
    await page.call('Input.dispatchKeyEvent', {
      type: 'keyDown', key: candidate.key, code: candidate.code,
      text: candidate.key, unmodifiedText: candidate.key,
      windowsVirtualKeyCode: candidate.virtualKey, nativeVirtualKeyCode: candidate.virtualKey
    });
    await delay(900);
    await page.call('Input.dispatchKeyEvent', {
      type: 'keyUp', key: candidate.key, code: candidate.code,
      windowsVirtualKeyCode: candidate.virtualKey, nativeVirtualKeyCode: candidate.virtualKey
    });
    try {
      moved = await page.waitFor(`keyboard movement from ${candidate.code}`, value => {
        if (!value.player) return false;
        const after = parsePlayer(value.player);
        return after.x !== beforeMove.x || after.y !== beforeMove.y;
      }, 2500);
      movementKey = candidate.code;
      break;
    } catch (_) {
      // A deathmatch spawn may face directly into a wall. Try another axis,
      // but never relax the required world-coordinate change.
    }
  }
  assert(moved, 'Directional keyboard events reached the game, but no movement direction changed world coordinates.');

  await page.call('Input.dispatchMouseEvent', {
    type: 'mousePressed', x: center.x, y: center.y, button: 'left', buttons: 1, clickCount: 1
  });
  const firing = await page.waitFor('mouse fire press', value => value.attack === 1, 5000);
  await page.call('Input.dispatchMouseEvent', {
    type: 'mouseReleased', x: center.x, y: center.y, button: 'left', buttons: 0, clickCount: 1
  });
  const released = await page.waitFor('mouse fire release', value => value.attack === 0, 5000);

  const beforeTurn = parsePlayer(released.player);
  await page.call('Input.dispatchMouseEvent', {
    type: 'mouseMoved', x: center.x + 120, y: center.y, button: 'none', buttons: 0
  });
  const turned = await page.waitFor('mouse turning', value => {
    if (!value.player) return false;
    return parsePlayer(value.player).angle !== beforeTurn.angle;
  }, 5000);

  return Object.freeze({
    keyboard: { key: movementKey, before: beforeMove, after: parsePlayer(moved.player) },
    mouseFire: { down: firing.attack, up: released.attack },
    mouseTurn: { before: beforeTurn.angle, after: parsePlayer(turned.player).angle }
  });
}

async function proveCase(game, profile) {
  const token = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const url = `${gameBase}/?game=${encodeURIComponent(game)}&profile=${encodeURIComponent(profile)}&mpmatrix=${token}`;
  let first;
  let second;
  const started = Date.now();
  const expectedPlayers = profile === 'modernized' ? 4 : 2;
  try {
    first = await newPage(`${url}&client=1`, cdpBase);
    await first.waitFor('first Join Deathmatch button', value =>
      value.join?.text === 'Join Deathmatch' && !value.join.disabled && !value.join.hidden);
    await first.evaluate(`document.getElementById('join-deathmatch').click()`);
    await waitForServer(status => status.state === 'running' && status.peers === 1,
      `${game}/${profile} first WebSocket peer`);

    second = await newPage(`${url}&client=2`, secondCdpBase);
    await second.waitFor('second Join Deathmatch button', value =>
      value.join?.text === 'Join Deathmatch' && !value.join.disabled && !value.join.hidden);
    await second.evaluate(`document.getElementById('join-deathmatch').click()`);

    let firstReady;
    try {
      firstReady = await first.waitFor('first two-player netgame', value =>
        value.runtime === 'ready' && value.state === 'gameplay' && value.netgame === 1 &&
          value.players >= expectedPlayers);
    } catch (error) {
      const secondState = await second.telemetry().catch(secondError => ({ error: secondError.message }));
      throw new Error(`${error.message} second telemetry=${JSON.stringify(secondState)} ` +
        `second console=${JSON.stringify(second.logs.slice(-30))}`);
    }
    const secondReady = await second.waitFor('second two-player netgame', value =>
      value.runtime === 'ready' && value.state === 'gameplay' && value.netgame === 1 &&
        value.players >= expectedPlayers);
    assert.notEqual(firstReady.slot, secondReady.slot, 'The two browser clients were assigned the same player slot.');
    if (profile !== 'modernized') {
      assert.deepEqual([firstReady.slot, secondReady.slot].sort((a, b) => a - b), [0, 1],
        'Expected the browser clients to occupy player slots 0 and 1.');
    }

    const server = await waitForServer(status => status.state === 'running' && status.humans === 2 && status.peers === 2,
      `${game}/${profile} two connected humans`);
    if (process.env.IDTECH1_DEBUG_PAUSE) {
      process.stdout.write(`DEBUG_READY ${game}/${profile}\n`);
      await delay(Number(process.env.IDTECH1_DEBUG_PAUSE));
    }
    const input = await proveInput(first);

    return {
      game,
      profile,
      passed: true,
      durationMs: Date.now() - started,
      clients: [
        { slot: firstReady.slot, netgame: firstReady.netgame, players: firstReady.players },
        { slot: secondReady.slot, netgame: secondReady.netgame, players: secondReady.players }
      ],
      server: {
        mode: server.mode, engine: server.engine, humans: server.humans,
        peers: server.peers, bots: server.bots, autoSleep: true
      },
      input
    };
  } finally {
    await Promise.all([first?.close(), second?.close()]);
    await waitForServer(status => status.state === 'sleeping', `${game}/${profile} automatic server sleep`, 30000);
  }
}

await closeStaleTestPages();
await waitForServer(status => status.state === 'sleeping', 'initial sleeping server', 30000);

const browserEndpoints = [...new Set([cdpBase, secondCdpBase])];
assert.equal(browserEndpoints.length, 2, 'Multiplayer proof requires two browser processes.');
const browsers = await Promise.all(browserEndpoints.map(async endpoint => ({
  endpoint,
  ...(await json(`${endpoint}/json/version`))
})));
assert.notEqual(browsers[0].webSocketDebuggerUrl, browsers[1].webSocketDebuggerUrl,
  'The two debugging endpoints resolve to the same Chrome browser process.');

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  proofCriteria: {
    independentBrowserProcesses: 2,
    distinctNetworkPlayers: true,
    keyboardWorldMovement: true,
    mouseAttackPressAndRelease: true,
    mouseHeadingChange: true,
    serverHumanAndPeerCounts: true,
    automaticServerSleep: true,
    modernizedBots: 2
  },
  browsers,
  endpoint: gameBase,
  cases: []
};

for (const game of games) {
  for (const profile of profiles) {
    process.stdout.write(`PROVING ${game}/${profile}\n`);
    const result = await proveCase(game, profile);
    report.cases.push(result);
    process.stdout.write(`PASS ${game}/${profile} slots=${result.clients.map(client => client.slot).join(',')} ` +
      `keyboard=yes mouse-fire=yes mouse-turn=yes auto-sleep=yes\n`);
  }
}

report.completedAt = new Date().toISOString();
report.passed = report.cases.length;
report.failed = 0;
if (outputPath) {
  await mkdir(path.dirname(path.resolve(outputPath)), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
}
process.stdout.write(`MULTIPLAYER_MATRIX_REPORT=${JSON.stringify(report)}\n`);
