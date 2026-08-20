'use strict';

const dgram = require('node:dgram');

const OOB = Buffer.from([0xff, 0xff, 0xff, 0xff]);

function sendRcon(command, options) {
  const config = options || {};
  const host = config.host || '127.0.0.1';
  const port = Number(config.port || 27960);
  const password = config.password;
  const timeoutMs = Number(config.timeoutMs || 2000);
  if (!password) throw new Error('RCON password is required');
  const payload = Buffer.concat([OOB, Buffer.from(`rcon ${password} ${command}`)]);
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket('udp4');
    const chunks = [];
    let finished = false;
    let settle = null;
    const finish = error => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (settle) clearTimeout(settle);
      try { socket.close(); } catch (_) { /* closed */ }
      if (error && !chunks.length) reject(error);
      else resolve(Buffer.concat(chunks).toString('latin1').replace(/\xff\xff\xff\xffprint\n?/g, ''));
    };
    const timer = setTimeout(() => finish(new Error('rcon timeout')), timeoutMs);
    socket.on('error', error => finish(error));
    socket.on('message', message => {
      chunks.push(message);
      if (settle) clearTimeout(settle);
      settle = setTimeout(() => finish(), 75);
    });
    socket.send(payload, port, host, error => {
      if (error) finish(error);
    });
  });
}

module.exports = Object.freeze({ sendRcon });
