'use strict';

/**
 * Real ET/Q3 connection handshake (getchallenge + Huffman-compressed connect).
 */

const dgram = require('dgram');
const crypto = require('crypto');
const path = require('path');
const { execFileSync } = require('child_process');

const HUFFPACK = path.join(__dirname, '..', 'tools', 'huffpack');
const OOB = Buffer.from([0xff, 0xff, 0xff, 0xff]);

function oob(cmd) {
  return Buffer.concat([OOB, Buffer.from(cmd)]);
}

function stripOob(buf) {
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xff && buf[2] === 0xff && buf[3] === 0xff) {
    return buf.slice(4).toString('binary');
  }
  return buf.toString('binary');
}

function infoEncode(fields) {
  let s = '';
  Object.keys(fields).forEach((k) => {
    s += '\\' + k + '\\' + String(fields[k]);
  });
  return s;
}

function packConnect(userinfo) {
  return execFileSync(HUFFPACK, {
    input: Buffer.from(userinfo, 'binary'),
    maxBuffer: 65536
  });
}

function connectClient(opts) {
  const host = (opts && opts.host) || '127.0.0.1';
  const port = (opts && opts.port) || 27961;
  const name = (opts && opts.name) || 'ETJSHuman';
  const protocol = (opts && opts.protocol) || 84;
  const timeoutMs = (opts && opts.timeoutMs) || 5000;

  return new Promise((resolve, reject) => {
    const sock = dgram.createSocket('udp4');
    let state = 'challenge';
    let finished = false;

    const finish = (err, result) => {
      if (finished) {
        return;
      }
      finished = true;
      clearTimeout(timer);
      if (err) {
        try { sock.close(); } catch (e) { /* ignore */ }
        reject(err);
        return;
      }
      resolve({
        name: name,
        socket: sock,
        challenge: result.challenge,
        close: () => {
          try { sock.close(); } catch (e) { /* ignore */ }
        }
      });
    };

    const timer = setTimeout(() => finish(new Error('protocol connect timeout in ' + state)), timeoutMs);

    sock.on('error', (err) => finish(err));
    sock.on('message', (msg) => {
      const text = stripOob(msg);
      if (opts && opts.debug) {
        console.error('oob <-', JSON.stringify(text.slice(0, 220)));
      }
      if (/temporarily banned/i.test(text)) {
        finish(new Error(text.replace(/\n/g, ' ')));
        return;
      }
      if (state === 'challenge' && text.indexOf('challengeResponse') === 0) {
        const parts = text.trim().split(/\s+/);
        const challenge = parts[1];
        const qport = String(10000 + Math.floor(Math.random() * 50000));
        const guid = crypto.randomBytes(16).toString('hex').toUpperCase();
        const userinfo = infoEncode({
          protocol: String(protocol),
          challenge: challenge,
          qport: qport,
          name: name,
          rate: '25000',
          snaps: '20',
          cl_guid: guid,
          cl_wwwDownload: '1',
          g_password: 'none'
        });
        state = 'connect';
        let pkt;
        try {
          pkt = packConnect(userinfo);
        } catch (err) {
          finish(new Error('huffpack failed: ' + err.message));
          return;
        }
        if (opts && opts.debug) {
          console.error('oob -> connect huff', pkt.length, userinfo.slice(0, 90));
        }
        sock.send(pkt, port, host);
        return;
      }
      if (state === 'connect' && /connectResponse/.test(text)) {
        finish(null, { challenge: true });
        return;
      }
      if (state === 'connect' && /^print/.test(text)) {
        finish(new Error('server rejected connect: ' + text.replace(/\n/g, ' ')));
      }
    });

    sock.bind(0, '0.0.0.0', () => {
      sock.send(oob('getchallenge'), port, host);
    });
  });
}

module.exports = {
  connectClient: connectClient,
  infoEncode: infoEncode,
  packConnect: packConnect
};
