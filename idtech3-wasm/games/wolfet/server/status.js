'use strict';

const dgram = require('dgram');

const OOB = Buffer.from([0xff, 0xff, 0xff, 0xff]);

function infoStringToObject(info) {
  const out = {};
  if (!info) {
    return out;
  }
  const s = info.charAt(0) === '\\' ? info.slice(1) : info;
  const parts = s.split('\\');
  for (let i = 0; i + 1 < parts.length; i += 2) {
    out[parts[i]] = parts[i + 1];
  }
  return out;
}

function parsePlayerLine(line) {
  // Q3/ET: score ping "name"
  const m = /^(-?\d+)\s+(\d+)\s+"(.*)"\s*$/.exec(line);
  if (!m) {
    return null;
  }
  return {
    score: Number(m[1]),
    ping: Number(m[2]),
    name: m[3]
  };
}

function classifyPlayer(player, info) {
  const name = String(player.name || '');
  // Omni-Bot names are "^o[BOT]^7Name"; rcon status address is "bot".
  if (player.bot === true || /\[BOT\]/i.test(name) || player.address === 'bot') {
    return 'bot';
  }
  return 'human';
}

function parseStatusResponse(buf) {
  const text = Buffer.isBuffer(buf) ? buf.toString('binary') : String(buf);
  const stripped = text.replace(/^\xff\xff\xff\xff/, '');
  if (!stripped.startsWith('statusResponse')) {
    throw new Error('not a statusResponse: ' + stripped.slice(0, 32));
  }
  const body = stripped.replace(/^statusResponse\n?/, '');
  const lines = body.split('\n').filter((l) => l.length > 0);
  const info = infoStringToObject(lines[0] || '');
  const players = [];
  for (let i = 1; i < lines.length; i++) {
    const p = parsePlayerLine(lines[i]);
    if (p) {
      p.kind = classifyPlayer(p, info);
      players.push(p);
    }
  }
  const humans = players.filter((p) => p.kind === 'human').length;
  const bots = players.filter((p) => p.kind === 'bot').length;
  return {
    info: info,
    players: players,
    humans: humans,
    bots: bots,
    map: info.mapname || info.map || '',
    gametype: info.g_gametype || info.gametype || '',
    hostname: info.sv_hostname || info.hostname || ''
  };
}

function queryStatus(opts) {
  const host = (opts && opts.host) || '127.0.0.1';
  const port = (opts && opts.port) || 27961;
  const timeoutMs = (opts && opts.timeoutMs) || 2000;
  const payload = Buffer.concat([OOB, Buffer.from('getstatus')]);

  return new Promise((resolve, reject) => {
    const sock = dgram.createSocket('udp4');
    let done = false;

    const finish = (err, result) => {
      if (done) {
        return;
      }
      done = true;
      clearTimeout(timer);
      try {
        sock.close();
      } catch (e) {
        /* ignore */
      }
      if (err) {
        reject(err);
      } else {
        resolve(result);
      }
    };

    const timer = setTimeout(() => finish(new Error('getstatus timeout')), timeoutMs);

    sock.on('error', (err) => finish(err));
    sock.on('message', (msg) => {
      try {
        finish(null, parseStatusResponse(msg));
      } catch (err) {
        finish(err);
      }
    });
    sock.send(payload, port, host, (err) => {
      if (err) {
        finish(err);
      }
    });
  });
}

module.exports = {
  infoStringToObject: infoStringToObject,
  parsePlayerLine: parsePlayerLine,
  parseStatusResponse: parseStatusResponse,
  queryStatus: queryStatus,
  classifyPlayer: classifyPlayer
};
