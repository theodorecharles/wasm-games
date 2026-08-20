'use strict';

const net = require('net');
const os = require('os');
const fs = require('fs');
const path = require('path');

function normalizeAddress(value) {
  let address = String(value || '').trim().toLowerCase();
  if (address.startsWith('::ffff:')) {
    address = address.slice(7);
  }
  const zone = address.indexOf('%');
  if (zone !== -1) {
    address = address.slice(0, zone);
  }
  return address;
}

function isLoopback(address) {
  const value = normalizeAddress(address);
  return value === '::1' || value === '127.0.0.1' || value.startsWith('127.');
}

function isPrivate(address) {
  const value = normalizeAddress(address);
  if (isLoopback(value)) {
    return true;
  }
  if (net.isIP(value) === 4) {
    const octets = value.split('.').map(Number);
    return octets[0] === 10 ||
      (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
      (octets[0] === 192 && octets[1] === 168);
  }
  return value.startsWith('fc') || value.startsWith('fd') || value.startsWith('fe80:');
}

function interfaceAddresses() {
  const result = new Set();
  Object.values(os.networkInterfaces()).forEach((entries) => {
    (entries || []).forEach((entry) => result.add(normalizeAddress(entry.address)));
  });
  return result;
}

function configuredAdminAddresses(value) {
  return new Set(String(value || '').split(',')
    .map(normalizeAddress)
    .filter((address) => net.isIP(address)));
}

function hostAddress(req) {
  let host = String((req.headers && req.headers.host) || '').trim().toLowerCase();
  if (host.startsWith('[')) {
    const close = host.indexOf(']');
    return close === -1 ? '' : normalizeAddress(host.slice(1, close));
  }
  if ((host.match(/:/g) || []).length === 1) {
    host = host.split(':')[0];
  }
  return net.isIP(host) ? normalizeAddress(host) : '';
}

function effectiveAddress(req, trustProxy) {
  const direct = normalizeAddress(req.socket && req.socket.remoteAddress);
  const forwarded = String((req.headers && req.headers['x-forwarded-for']) || '').trim();
  if (!forwarded) {
    return direct;
  }
  /* A proxy header without an explicit trust decision must never turn every
   * request arriving from a local reverse proxy into an administrator. */
  if (!trustProxy) {
    return '';
  }
  return normalizeAddress(forwarded.split(',')[0]);
}

function connectionAddress(req, trustProxy) {
  const direct = normalizeAddress(req.socket && req.socket.remoteAddress);
  const forwarded = String((req.headers && req.headers['x-forwarded-for']) || '').trim();
  return trustProxy && forwarded ? normalizeAddress(forwarded.split(',')[0]) : direct;
}

function isAdminRequest(req, options) {
  const opts = options || {};
  const trustProxy = opts.trustProxy == null
    ? process.env.ETJS_TRUST_PROXY === '1'
    : !!opts.trustProxy;
  const client = effectiveAddress(req, trustProxy);
  if (!client || !net.isIP(client)) {
    return false;
  }
  const allowed = opts.adminAddresses || configuredAdminAddresses(process.env.ETJS_ADMIN_IPS);
  if (allowed.has(client)) {
    return true;
  }
  const local = normalizeAddress(req.socket && req.socket.localAddress);
  const interfaces = opts.interfaceAddresses || interfaceAddresses();
  if (client === local || interfaces.has(client)) {
    return true;
  }
  const requestedHost = hostAddress(req);
  if (requestedHost && client === requestedHost) {
    return true;
  }
  if (isLoopback(client) && (!requestedHost || isLoopback(requestedHost))) {
    return true;
  }
  /* Docker's published localhost port reaches the container from a private
   * bridge gateway. The loopback Host header is browser-controlled by the URL,
   * so a normal remote browser cannot satisfy this condition. */
  return isLoopback(requestedHost) && isPrivate(client) && !String(
    (req.headers && req.headers['x-forwarded-for']) || ''
  ).trim();
}

function createBanStore(filePath) {
  const bans = new Set();
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    (Array.isArray(parsed.addresses) ? parsed.addresses : []).forEach((address) => {
      const normalized = normalizeAddress(address);
      if (net.isIP(normalized)) {
        bans.add(normalized);
      }
    });
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw new Error('cannot read admin ban file: ' + err.message);
    }
  }

  function save() {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const temp = filePath + '.tmp-' + process.pid;
    fs.writeFileSync(temp, JSON.stringify({ addresses: Array.from(bans).sort() }, null, 2) + '\n', {
      encoding: 'utf8', mode: 0o600
    });
    fs.renameSync(temp, filePath);
  }

  return {
    filePath: filePath,
    isBanned: (address) => bans.has(normalizeAddress(address)),
    list: () => Array.from(bans).sort(),
    add: (address) => {
      const normalized = normalizeAddress(address);
      if (!net.isIP(normalized)) {
        throw new Error('invalid IP address');
      }
      bans.add(normalized);
      save();
      return normalized;
    },
    remove: (address) => {
      const normalized = normalizeAddress(address);
      const removed = bans.delete(normalized);
      if (removed) {
        save();
      }
      return removed;
    }
  };
}

function stripColors(value) {
  return String(value || '').replace(/\^[A-Za-z0-9]/g, '');
}

function cleanRconOutput(value) {
  return String(value || '').replace(/\xff\xff\xff\xffprint\n?/g, '');
}

function parseRconPlayers(value) {
  const players = [];
  cleanRconOutput(value).split(/\r?\n/).forEach((line) => {
    const match = /^\s*(\d+)\s+(-?\d+)\s+(\d+)\s+(.*?)\s+(\d+)\s+(\S+)\s+(\d+)\s+(\d+)\s+(\d+)\s*$/.exec(line);
    if (!match) {
      return;
    }
    players.push({
      slot: Number(match[1]),
      score: Number(match[2]),
      ping: Number(match[3]),
      name: match[4],
      plainName: stripColors(match[4]),
      address: match[6],
      proxyPort: match[6] === 'bot' ? 0 : Number(match[6].split(':').at(-1))
    });
  });
  return players;
}

function findPlayer(players, selector) {
  const wanted = String(selector || '').trim();
  if (/^\d+$/.test(wanted)) {
    return players.find((player) => player.slot === Number(wanted));
  }
  const lower = stripColors(wanted).toLowerCase();
  const exact = players.filter((player) => player.plainName.toLowerCase() === lower);
  if (exact.length === 1) {
    return exact[0];
  }
  const partial = players.filter((player) => player.plainName.toLowerCase().includes(lower));
  return partial.length === 1 ? partial[0] : null;
}

function createAdminController(options) {
  const opts = options || {};
  const registry = opts.registry;
  const banStore = opts.banStore;
  const sendRcon = opts.sendRcon;
  const maps = opts.maps;

  async function rcon(command) {
    return cleanRconOutput(await sendRcon(command));
  }

  async function players() {
    return parseRconPlayers(await rcon('status'));
  }

  return async function runAdminCommand(input) {
    const commandLine = String(input || '').trim();
    const split = commandLine.indexOf(' ');
    const command = (split === -1 ? commandLine : commandLine.slice(0, split)).toLowerCase();
    const argument = split === -1 ? '' : commandLine.slice(split + 1).trim();
    if (!command || command === 'help') {
      return 'Commands: status, kick <slot|name>, ban <slot|name>, banip <ip>, unban <ip>, bans, map <name>, map_restart, nextmap';
    }
    if (command === 'status') {
      return await rcon('status');
    }
    if (command === 'bans') {
      const list = banStore.list();
      return list.length ? list.join('\n') : 'No browser IP bans.';
    }
    if (command === 'banip') {
      const banned = banStore.add(argument);
      registry.forEach((entry) => {
        if (normalizeAddress(entry.address) === banned) {
          entry.ws.close(1008, 'banned by server administrator');
        }
      });
      return 'Banned browser IP ' + banned;
    }
    if (command === 'unban') {
      return banStore.remove(argument) ? 'Removed browser IP ban ' + normalizeAddress(argument) : 'IP was not banned.';
    }
    if (command === 'kick' || command === 'ban') {
      if (!argument || /[\r\n;]/.test(argument)) {
        throw new Error('use ' + command + ' <slot|name>');
      }
      const player = findPlayer(await players(), argument);
      if (!player) {
        throw new Error('player not found or name is ambiguous');
      }
      if (command === 'ban') {
        if (!player.proxyPort) {
          throw new Error('bots do not have a browser IP to ban');
        }
        const entry = registry.get(player.proxyPort);
        if (!entry) {
          throw new Error('player WebSocket is no longer connected');
        }
        const banned = banStore.add(entry.address);
        entry.ws.close(1008, 'banned by server administrator');
        await rcon('clientkick ' + player.slot);
        return 'Kicked ' + player.plainName + ' and banned browser IP ' + banned;
      }
      await rcon('clientkick ' + player.slot);
      return 'Kicked ' + player.plainName;
    }
    if (command === 'map') {
      if (!/^[A-Za-z0-9_-]+$/.test(argument) || !maps().some((name) => name.toLowerCase() === argument.toLowerCase())) {
        throw new Error('map must be present in the configured Objective rotation');
      }
      await rcon('map ' + argument);
      return 'Changing map to ' + argument;
    }
    if (command === 'map_restart') {
      if (argument) {
        throw new Error('map_restart does not take an argument here');
      }
      await rcon('map_restart 0');
      return 'Restarting the current map';
    }
    if (command === 'nextmap') {
      await rcon('vstr nextmap');
      return 'Advancing to the next map';
    }
    throw new Error('unknown admin command; use etjs_admin help');
  };
}

module.exports = {
  normalizeAddress: normalizeAddress,
  isLoopback: isLoopback,
  isPrivate: isPrivate,
  interfaceAddresses: interfaceAddresses,
  configuredAdminAddresses: configuredAdminAddresses,
  hostAddress: hostAddress,
  effectiveAddress: effectiveAddress,
  connectionAddress: connectionAddress,
  isAdminRequest: isAdminRequest,
  createBanStore: createBanStore,
  cleanRconOutput: cleanRconOutput,
  parseRconPlayers: parseRconPlayers,
  findPlayer: findPlayer,
  createAdminController: createAdminController
};
