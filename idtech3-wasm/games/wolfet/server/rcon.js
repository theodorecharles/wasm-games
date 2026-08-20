'use strict';

const dgram = require('dgram');

const OOB = Buffer.from([0xff, 0xff, 0xff, 0xff]);

function sendRcon(command, opts) {
  const host = (opts && opts.host) || '127.0.0.1';
  const port = (opts && opts.port) || 27961;
  const password = opts && opts.password;
  const timeoutMs = (opts && opts.timeoutMs) || 2000;
  if (!password) {
    throw new Error('RCON password is required');
  }
  const payload = Buffer.concat([
    OOB,
    Buffer.from('rcon ' + password + ' ' + command)
  ]);

  return new Promise((resolve, reject) => {
    const sock = dgram.createSocket('udp4');
    const chunks = [];
    let done = false;
    let settleTimer = null;

    const finish = (err) => {
      if (done) {
        return;
      }
      done = true;
      clearTimeout(timer);
      if (settleTimer) {
        clearTimeout(settleTimer);
      }
      try {
        sock.close();
      } catch (e) {
        /* ignore */
      }
      if (err && chunks.length === 0) {
        reject(err);
      } else {
        resolve(Buffer.concat(chunks).toString('binary').replace(/\xff\xff\xff\xffprint\n?/g, ''));
      }
    };

    const timer = setTimeout(() => finish(new Error('rcon timeout')), timeoutMs);
    sock.on('error', (err) => finish(err));
    sock.on('message', (msg) => {
      chunks.push(msg);
      /* A local ET RCON reply may span packets. Complete after a short quiet
       * window instead of holding every successful command until timeout. */
      if (settleTimer) {
        clearTimeout(settleTimer);
      }
      settleTimer = setTimeout(() => finish(), 75);
    });
    sock.send(payload, port, host, (err) => {
      if (err) {
        finish(err);
      }
    });
  });
}

module.exports = {
  sendRcon: sendRcon
};
