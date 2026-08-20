'use strict';

const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const dgram = require('node:dgram');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const statusModule = require('../games/rtcw/server/status');
const { ensureSessionSecret, passwordProtectedPath } = require('../games/rtcw/server/access');
const { isPortAnnouncement } = require('../games/rtcw/server/ws-proxy');

function read(relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}

async function queryFixture() {
  const socket = dgram.createSocket('udp4');
  await new Promise(resolve => socket.bind(0, '127.0.0.1', resolve));
  socket.once('message', (message, sender) => {
    assert.deepEqual(message, Buffer.concat([
      Buffer.from([0xff, 0xff, 0xff, 0xff]), Buffer.from('getstatus')
    ]));
    const response = Buffer.concat([
      Buffer.from([0xff, 0xff, 0xff, 0xff]),
      Buffer.from('statusResponse\n\\mapname\\mp_depot\\g_gametype\\5\\sv_hostname\\Test Arena\n' +
        '12 42 "Paloooz"\n0 0 "Second Player"\n')
    ]);
    socket.send(response, sender.port, sender.address);
  });
  try {
    return await statusModule.queryStatus({ port: socket.address().port, timeoutMs: 1000 });
  } finally {
    socket.close();
  }
}

(async () => {
  const arena = require('../games/rtcw/server/arena');
  assert.deepEqual(arena.rotation(), ['mp_depot']);
  assert.equal(arena.isDepotOnly(arena.rotation()), true);
  assert.equal(arena.nextMap('mp_depot'), 'mp_depot');
  assert.equal(arena.nextMap('mp_beach'), 'mp_depot');
  assert.equal(arena.chooseStartMap('mp_village'), 'mp_depot');
  assert.equal(arena.GAMETYPE, 5);
  assert.equal(arena.BOT_POLICY, 'omnibot');
  assert.equal(arena.MANAGED_CONNECT, '127.0.0.1:27960');
  assert.equal(arena.desiredBots(0), 8);
  assert.equal(arena.desiredBots(1), 7);
  assert.equal(arena.desiredBots(8), 0);
  assert.equal(arena.assignmentsCoverTeamsAndClasses(8), true);
  assert.deepEqual(arena.nextBotAssignment(0), { team: 'axis', className: 'soldier' });
  assert.deepEqual(arena.nextBotAssignment(1), { team: 'allies', className: 'medic' });
  assert.equal(arena.botMinCommand(8), 'bot minbots 8');
  assert.equal(arena.botMaxCommand(7), 'bot maxbots 7');
  assert.ok(arena.requiredFrameworkFiles().includes('omnibot_rtcw.x86_64.so'));
  assert.ok(arena.requiredFrameworkFiles().includes('rtcw/nav/mp_depot.way'));
  assert.equal(arena.isOverflowLine('broadcast: print "x Server command overflow"'), true);
  assert.equal(arena.isOverflowLine('Omni-Bot added Axis Soldier'), false);
  assert.equal(arena.isFrameworkLoadedLine('Omni-Bot loaded successfully'), true);
  assert.equal(arena.classifyPlayer({ name: '^4[BOT]^7Walter', ping: 0 }), 'bot');
  assert.equal(arena.classifyPlayer({ name: 'Player', ping: 50 }), 'human');
  assert.equal(arena.joinKeepsRuntime(['loading', 'gameplay']), true);
  assert.equal(arena.joinKeepsRuntime(['loading', 'launcher']), false);

  const emptyFill = { humans: 0, bots: 0, slots: 8 };
  const limits = [];
  const hooks = {
    setLimits(plan) { limits.push(plan.target); emptyFill.bots = plan.target; }
  };
  assert.equal((await arena.applyFill(emptyFill, hooks)).target, 8);
  assert.deepEqual(limits, [8]);
  emptyFill.humans = 1;
  assert.equal((await arena.applyFill(emptyFill, hooks)).target, 7);
  assert.deepEqual(limits, [8, 7]);

  const parsed = statusModule.parseStatusResponse(Buffer.concat([
    Buffer.from([0xff, 0xff, 0xff, 0xff]),
    Buffer.from('statusResponse\n\\mapname\\mp_depot\\g_gametype\\5\n3 50 "Player"\n0 0 "^o[BOT]^7AxisSoldier"\n')
  ]));
  assert.equal(parsed.map, 'mp_depot');
  assert.equal(parsed.gametype, '5');
  assert.equal(parsed.humans, 1);
  assert.equal(parsed.bots, 1);
  assert.equal(parsed.players[0].kind, 'human');
  assert.equal(parsed.players[1].kind, 'bot');

  const queried = await queryFixture();
  assert.equal(queried.map, 'mp_depot');
  assert.equal(queried.humans, 2);
  assert.equal(queried.hostname, 'Test Arena');

  assert.equal(isPortAnnouncement(Buffer.from([
    0xff, 0xff, 0xff, 0xff, 0x70, 0x6f, 0x72, 0x74, 0x6d, 0x38
  ])), true);
  assert.equal(isPortAnnouncement(Buffer.from('connect')), false);

  const environment = { WASM_GAME_PASSWORD: 'test' };
  assert.match(ensureSessionSecret(environment), /^[A-Za-z0-9_-]{43}$/);
  for (const pathname of [
    '/status', '/wake', '/config.json', '/game-data/status', '/game-data/files/pak0',
    '/game-adapter.js', '/iowolfmp.js', '/iowolfmp.wasm', '/qvm/mp/ui.qvm',
    '/menus/mp_wasm.pk3'
  ]) assert.equal(passwordProtectedPath(pathname), true, pathname);
  assert.equal(passwordProtectedPath('/'), false);

  const supervisor = read('games/rtcw/server/supervisor.js');
  assert.match(supervisor, /IdleServiceSupervisor/);
assert.match(supervisor, /createProvisioningStore/);
assert.match(supervisor, /symlink\(source, target\)/,
  'validated RTCW archives must remain read-only links instead of startup copies');
  assert.match(supervisor, /queryStatus\(\{ port: GAME_PORT/);
  assert.match(supervisor, /lifecycle\.observeHumans\(status\.humans\)/);
  assert.match(supervisor, /gameProxy\?\.closeAll\(1012, 'game server sleeping'\)/);
  assert.match(supervisor, /'\+map', selectedMap/);
  assert.match(supervisor, /omnibot_enable/);
  assert.match(supervisor, /g_speed/);
  assert.match(supervisor, /g_arcade/);
  assert.match(supervisor, /gameMode\.GAME_SPEED/);
  const mode = require('../games/rtcw/server/mode');
  assert.equal(mode.parseMode('arcade'), 'arcade');
  assert.equal(mode.parseMode('VANILLA'), 'vanilla');
  assert.throws(() => mode.parseMode('fast'), /RTCW_MODE/);
  assert.ok(mode.MODES.includes('arcade'));
  assert.ok(mode.MODES.includes('vanilla'));
  assert.match(supervisor, /arena\.botMinCommand/);
  assert.match(supervisor, /arena\.botMaxCommand/);
  assert.match(supervisor, /requireOmniBotFramework/);
  assert.match(supervisor, /handle\.reconciling/);
  assert.doesNotMatch(supervisor, /bot addbot/);
  assert.doesNotMatch(supervisor, /bot_minplayers/);
  assert.match(supervisor, /arena\.rotation\(\)|MAP_ROTATION|mp_depot/);

  const fetchOmni = read('scripts/fetch-rtcw-omnibot.sh');
  assert.match(fetchOmni, /omni-bot_0_93_RTCW\.zip/);
  assert.match(fetchOmni, /6275af05c97016636aa810b41f7521a74b09655bbf02beda83f862c831bf2418/);
  assert.match(fetchOmni, /omnibot_rtcw\.x86_64\.so/);
  assert.match(fetchOmni, /mp_depot\.way/);
  for (const relative of arena.requiredFrameworkFiles()) {
    assert.ok(fs.existsSync(path.join(root, 'games/rtcw/omni-bot', relative)), relative);
  }
  const depotWay = fs.readFileSync(path.join(root, 'games/rtcw/omni-bot/rtcw/nav/mp_depot.way'));
  assert.ok(depotWay.length > 1000, 'mp_depot waypoints must be a real nav file');
  const moduleSo = fs.readFileSync(path.join(root, 'games/rtcw/omni-bot/omnibot_rtcw.x86_64.so'));
  assert.equal(moduleSo.slice(0, 4).toString('ascii'), '\x7fELF');

  const proxy = read('games/rtcw/server/ws-proxy.js');
  assert.match(proxy, /dgram\.createSocket\('udp4'\)/);
  assert.match(proxy, /isPortAnnouncement\(packet\)/);
  assert.match(proxy, /closeAll\(code, reason\)/);
  assert.match(proxy, /pendingBytes \+ packet\.length > 1024 \* 1024/);

  const config = read('games/rtcw/server/server.cfg');
  assert.match(config, /g_gametype "5"/);
  assert.match(config, /bot_enable "0"/);
  assert.match(config, /omnibot_enable "1"/);
  assert.match(config, /nextmap "map mp_depot"/);
  assert.doesNotMatch(config, /mp_beach|mp_village|mp_castle/);

  const dockerfile = read('games/rtcw/docker/Dockerfile.mp');
  assert.match(dockerfile, /FROM debian:bookworm-slim AS native-builder/);
  assert.match(dockerfile, /BUILD_SERVER=1 BUILD_CLIENT=0 BUILD_GAME_SO=0/);
  assert.match(dockerfile, /omni-bot\/native\/qagame\.mp\.x86_64\.so/);
  assert.match(dockerfile, /omnibot_rtcw\.x86_64\.so/);
  assert.match(dockerfile, /mp_depot\.way/);
  assert.match(dockerfile, /FROM \$\{FRAMEWORK_IMAGE\} AS framework/);
  assert.match(dockerfile, /FROM node:22-bookworm-slim/);
  assert.match(dockerfile, /COPY --from=framework \/opt\/shared-shell\/ \/opt\/shared-shell\//);
  assert.match(dockerfile, /WASM_GAME_SHELL_ROOT=\/opt\/shared-shell/);
  assert.match(dockerfile, /COPY omni-bot\/ \/opt\/omni-bot\//);
  const officialQagame = fs.readFileSync(path.join(root, 'games/rtcw/omni-bot/native/qagame.mp.x86_64.so'));
  assert.equal(officialQagame.slice(0, 4).toString('ascii'), '\x7fELF');
  assert.ok(officialQagame.length > 100000, 'official Omni-Bot qagame must be the real module');
  assert.doesNotMatch(read('games/rtcw/server/supervisor.js'), /trap_BotAllocateClient|G_OmniBot_Add/);
  assert.match(supervisor, /setInterval\(\(\) => \{[\s\S]*?\}, 5000\)/);
  assert.match(supervisor, /handle\.reconciling/);
  const userCfg = read('games/rtcw/omni-bot/rtcw/user/omni-bot.cfg');
  assert.match(userCfg, /MinBots = 8/);
  assert.match(userCfg, /MaxBots = 8/);
  const liveStatusB64 = fs.readFileSync(
    path.join(root, 'tests/fixtures/rtcw-mp-getstatus.b64'), 'utf8'
  ).trim();
  const livePacket = Buffer.from(liveStatusB64, 'base64');
  const liveText = livePacket.toString('latin1');
  assert.match(liveText, /statusResponse/);
  assert.match(liveText, /mapname\\mp_depot/);
  assert.match(liveText, /g_gametype\\5/);
  assert.match(liveText, /gamename\\omnibot/);
  assert.match(liveText, /omnibot_playing\\[1-9]/);
  assert.match(liveText, /\[BOT\]/);
  const liveParsed = statusModule.parseStatusResponse(livePacket);
  assert.equal(liveParsed.map, 'mp_depot');
  assert.equal(String(liveParsed.gametype), '5');
  assert.ok(liveParsed.bots >= 1, 'real Omni-Bot getstatus must list bots');
  assert.equal(liveParsed.players.filter(player => player.kind === 'bot').length, liveParsed.bots);
  const liveOmni = fs.readFileSync(path.join(root, '.sources/iortcw/MP/code/game/g_omnibot.c'), 'utf8');
  assert.doesNotMatch(liveOmni, /trap_BotAllocateClient/);
  assert.doesNotMatch(liveOmni, /ClientBegin/);
  assert.match(liveOmni, /return qfalse/);
  const depotNav = fs.readFileSync(path.join(root, 'games/rtcw/omni-bot/rtcw/nav/mp_depot.way'));
  assert.ok(depotNav.length > 1000);
  const frameworkSo = fs.readFileSync(path.join(root, 'games/rtcw/omni-bot/omnibot_rtcw.x86_64.so'));
  assert.equal(frameworkSo.slice(0, 4).toString('ascii'), '\x7fELF');
  assert.ok(frameworkSo.length > 1000 * 1000, 'official Omni-Bot module must be the real shared object');
  assert.match(read('scripts/build-rtcw-images.sh'), /fetch-rtcw-omnibot\.sh/);

  for (const relative of [
    'games/rtcw/server/access.js', 'games/rtcw/server/status.js',
    'games/rtcw/server/ws-proxy.js', 'games/rtcw/server/supervisor.js',
    'games/rtcw/server/arena.js', 'games/rtcw/server/rcon.js'
  ]) {
    const syntax = childProcess.spawnSync(process.execPath, ['--check', relative], {
      cwd: root, encoding: 'utf8'
    });
    assert.equal(syntax.status, 0, `${relative}: ${syntax.stderr}`);
  }

  const serverDir = path.join(root, 'games/rtcw/server');
  if (!fs.existsSync(path.join(serverDir, 'node_modules', 'ws'))) {
    const installed = childProcess.spawnSync('npm', ['ci', '--omit=dev'], {
      cwd: serverDir, encoding: 'utf8'
    });
    assert.equal(installed.status, 0, installed.stderr || installed.stdout);
  }
  const { WebSocket } = require(path.join(serverDir, 'node_modules', 'ws'));
  const { attachWebSocketUdpProxy } = require('../games/rtcw/server/ws-proxy');
  const dedicated = dgram.createSocket('udp4');
  await new Promise(resolve => dedicated.bind(0, '127.0.0.1', resolve));
  dedicated.on('message', (message, sender) => {
    assert.match(message.toString('latin1'), /getchallenge 1234567890 wolfmp/);
    dedicated.send(Buffer.concat([
      Buffer.from([0xff, 0xff, 0xff, 0xff]),
      Buffer.from('challengeResponse 42 0 1234567890 61')
    ]), sender.port, sender.address);
  });
  const httpServer = http.createServer();
  attachWebSocketUdpProxy(httpServer, {
    destinationHost: '127.0.0.1',
    destinationPort: dedicated.address().port
  });
  await new Promise(resolve => httpServer.listen(0, '127.0.0.1', resolve));
  const reply = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('getchallenge through /ws timed out')), 2000);
    const socket = new WebSocket(`ws://127.0.0.1:${httpServer.address().port}/ws`, 'binary');
    socket.on('open', () => {
      socket.send(Buffer.concat([
        Buffer.from([0xff, 0xff, 0xff, 0xff]),
        Buffer.from('getchallenge 1234567890 wolfmp')
      ]), { binary: true });
    });
    socket.on('message', data => {
      clearTimeout(timer);
      resolve(Buffer.from(data));
      socket.close();
    });
    socket.on('error', reject);
  });
  assert.match(reply.toString('latin1'), /challengeResponse 42 0 1234567890 61/);
  await new Promise(resolve => httpServer.close(resolve));
  dedicated.close();

  console.log('RTCW managed Objective server contract passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
