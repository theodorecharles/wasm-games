'use strict';

const { afterEach, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const admin = require('../server/admin');

const temporaryRoots = [];

function request(remoteAddress, localAddress, host, forwarded) {
  const headers = { host: host };
  if (forwarded) {
    headers['x-forwarded-for'] = forwarded;
  }
  return { socket: { remoteAddress: remoteAddress, localAddress: localAddress }, headers: headers };
}

afterEach(() => {
  while (temporaryRoots.length) {
    fs.rmSync(temporaryRoots.pop(), { recursive: true, force: true });
  }
});

describe('local server administration', () => {
  it('recognizes same-host requests without trusting arbitrary proxy headers', () => {
    const interfaces = new Set(['127.0.0.1', '192.168.1.20']);
    assert.equal(admin.isAdminRequest(
      request('127.0.0.1', '127.0.0.1', '127.0.0.1:8088'),
      { interfaceAddresses: interfaces, adminAddresses: new Set(), trustProxy: false }
    ), true);
    assert.equal(admin.isAdminRequest(
      request('192.168.1.20', '192.168.1.20', '192.168.1.20:8088'),
      { interfaceAddresses: interfaces, adminAddresses: new Set(), trustProxy: false }
    ), true);
    assert.equal(admin.isAdminRequest(
      request('127.0.0.1', '127.0.0.1', 'game.example', '203.0.113.8'),
      { interfaceAddresses: interfaces, adminAddresses: new Set(), trustProxy: false }
    ), false);
    assert.equal(admin.isAdminRequest(
      request('127.0.0.1', '127.0.0.1', 'game.example', '192.168.1.20'),
      { interfaceAddresses: interfaces, adminAddresses: new Set(), trustProxy: true }
    ), true);
  });

  it('maps RCON status slots back to WebSocket proxy ports', () => {
    const players = admin.parseRconPlayers(
      'num score ping name lastmsg address qport rate lastConnectTime\n' +
      '  3    12   45 ^1Alice The Great^7  10 127.0.0.1:44123 1234 25000 99\n' +
      '  4   100    0 ^o[BOT]^7Bob          0 bot                 0 16384 99\n'
    );
    assert.equal(players.length, 2);
    assert.equal(players[0].slot, 3);
    assert.equal(players[0].plainName, 'Alice The Great');
    assert.equal(players[0].proxyPort, 44123);
    assert.equal(admin.findPlayer(players, 'alice the great').slot, 3);
    assert.equal(admin.findPlayer(players, '4').address, 'bot');
  });

  it('persists real browser IP bans and closes the matching WebSocket', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wolfet-admin-'));
    temporaryRoots.push(root);
    const banStore = admin.createBanStore(path.join(root, 'bans.json'));
    let closed = false;
    const registry = new Map([[44123, {
      address: '203.0.113.8',
      ws: { close: () => { closed = true; } }
    }]]);
    const commands = [];
    const controller = admin.createAdminController({
      registry: registry,
      banStore: banStore,
      maps: () => ['oasis', 'custom_one'],
      sendRcon: async (command) => {
        commands.push(command);
        if (command === 'status') {
          return '  3    12   45 Alice  10 127.0.0.1:44123 1234 25000 99\n';
        }
        return 'OK';
      }
    });

    const response = await controller('ban Alice');
    assert.match(response, /203\.0\.113\.8/);
    assert.equal(closed, true);
    assert.equal(banStore.isBanned('203.0.113.8'), true);
    assert.deepEqual(commands, ['status', 'clientkick 3']);
    assert.match(fs.readFileSync(path.join(root, 'bans.json'), 'utf8'), /203\.0\.113\.8/);
    await assert.rejects(() => controller('map not-installed'), /configured Objective rotation/);
    assert.equal(await controller('map custom_one'), 'Changing map to custom_one');
  });
});
