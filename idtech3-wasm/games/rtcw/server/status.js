'use strict';

const dgram = require('node:dgram');
const { rosterFromPlayers } = require('./arena');

const OOB = Buffer.from([0xff, 0xff, 0xff, 0xff]);

function infoStringToObject(value) {
  const result = {};
  const parts = String(value || '').replace(/^\\/, '').split('\\');
  for (let index = 0; index + 1 < parts.length; index += 2) {
    if (parts[index]) result[parts[index]] = parts[index + 1];
  }
  return result;
}

function parsePlayer(line) {
  const match = /^(-?\d+)\s+(\d+)\s+"(.*)"\s*$/.exec(String(line || ''));
  if (!match) return null;
  return Object.freeze({ score: Number(match[1]), ping: Number(match[2]), name: match[3] });
}

function parseStatusResponse(packet) {
  const text = Buffer.isBuffer(packet) ? packet.toString('latin1') : String(packet || '');
  const stripped = text.replace(/^\xff\xff\xff\xff/, '');
  if (!stripped.startsWith('statusResponse')) throw new Error('not an RTCW statusResponse');
  const lines = stripped.replace(/^statusResponse\n?/, '').split('\n').filter(Boolean);
  const info = infoStringToObject(lines.shift() || '');
  const roster = rosterFromPlayers(lines.map(parsePlayer).filter(Boolean));
  return Object.freeze({
    info: Object.freeze(info),
    players: roster.players,
    humans: roster.humans,
    bots: roster.bots,
    map: info.mapname || '',
    gametype: info.g_gametype || '',
    hostname: info.sv_hostname || ''
  });
}

function queryStatus(options) {
  const config = options || {};
  const host = config.host || '127.0.0.1';
  const port = Number(config.port || 27960);
  const timeoutMs = Number(config.timeoutMs || 1500);
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket('udp4');
    let finished = false;
    const finish = (error, value) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      try { socket.close(); } catch (_) { /* already closed */ }
      if (error) reject(error); else resolve(value);
    };
    const timer = setTimeout(() => finish(new Error('RTCW getstatus timeout')), timeoutMs);
    socket.once('error', error => finish(error));
    socket.once('message', packet => {
      try { finish(null, parseStatusResponse(packet)); } catch (error) { finish(error); }
    });
    socket.send(Buffer.concat([OOB, Buffer.from('getstatus')]), port, host, error => {
      if (error) finish(error);
    });
  });
}

module.exports = Object.freeze({ infoStringToObject, parsePlayer, parseStatusResponse, queryStatus });
