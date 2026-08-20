'use strict';

/**
 * Emscripten SOCKFS datagram <-> native UDP proxy.
 *
 * Browser/WASM clients open ws://host:port and send binary datagrams.
 * The first packet may be the SOCKFS port announcement:
 *   FF FF FF FF 'p' 'o' 'r' 't' hi lo
 * which is not forwarded. Each WebSocket gets its own UDP socket so
 * etlded sees distinct clients.
 */

const dgram = require('dgram');
const http = require('http');
const { WebSocketServer } = require('ws');

const PORT_MAGIC = Buffer.from([0xff, 0xff, 0xff, 0xff, 0x70, 0x6f, 0x72, 0x74]);

function isPortAnnouncement(buf) {
  return buf.length === 10 && buf.slice(0, 8).equals(PORT_MAGIC);
}

function attachWsProxy(server, opts) {
  const destHost = (opts && opts.destHost) || '127.0.0.1';
  const destPort = (opts && opts.destPort) || 27961;
  const path = (opts && opts.path) || '/ws';

  const wss = new WebSocketServer({ noServer: true });

  const registry = opts && opts.registry;
  const banStore = opts && opts.banStore;
  const clientAddress = opts && opts.clientAddress;
  const ensureDedicated = opts && opts.ensureDedicated;
  const authorizeUpgrade = opts && opts.authorizeUpgrade;

  server.on('upgrade', (request, socket, head) => {
    let pathname = '';
    try { pathname = new URL(request.url, 'http://localhost').pathname; } catch (error) {
      socket.destroy();
      return;
    }
    if (pathname !== path) {
      socket.destroy();
      return;
    }
    if (authorizeUpgrade && !authorizeUpgrade(request)) {
      socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
      return;
    }
    wss.handleUpgrade(request, socket, head, (webSocket) => {
      wss.emit('connection', webSocket, request);
    });
  });

  wss.on('connection', (ws, req) => {
    const address = clientAddress ? clientAddress(req) : String(req.socket.remoteAddress || '');
    if (banStore && banStore.isBanned(address)) {
      ws.close(1008, 'banned by server administrator');
      return;
    }
    const udp = dgram.createSocket('udp4');
    udp.bind(0, '127.0.0.1');
    let proxyPort = 0;
    let wakePromise = null;
    let ready = !ensureDedicated;
    let pending = [];
    let pendingBytes = 0;

    const beginWake = () => {
      if (wakePromise || ready) {
        return;
      }
      wakePromise = Promise.resolve().then(() => ensureDedicated('browser game connection'))
        .then(() => {
          ready = true;
          const queued = pending;
          pending = [];
          pendingBytes = 0;
          queued.forEach((packet) => udp.send(packet, destPort, destHost));
        })
        .catch((err) => {
          pending = [];
          pendingBytes = 0;
          try { ws.close(1013, 'game server wake failed'); } catch (e) { /* ignore */ }
        });
    };
    udp.on('listening', () => {
      proxyPort = udp.address().port;
      if (registry) {
        registry.set(proxyPort, { ws: ws, address: address });
      }
    });

    udp.on('message', (msg) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(msg, { binary: true });
      }
    });

    udp.on('error', (err) => {
      try {
        ws.close();
      } catch (e) {
        /* ignore */
      }
    });

    ws.on('message', (data) => {
      const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
      if (isPortAnnouncement(buf)) {
        return;
      }
      if (!ready) {
        if (pending.length >= 256 || pendingBytes + buf.length > 1024 * 1024) {
          ws.close(1009, 'too much queued game data');
          return;
        }
        pending.push(Buffer.from(buf));
        pendingBytes += buf.length;
        beginWake();
        return;
      }
      udp.send(buf, destPort, destHost);
    });

    const cleanup = () => {
      pending = [];
      pendingBytes = 0;
      if (registry && proxyPort) {
        registry.delete(proxyPort);
      }
      try {
        udp.close();
      } catch (e) {
        /* ignore */
      }
    };
    ws.on('close', cleanup);
    ws.on('error', cleanup);
  });

  return wss;
}

function listenProxy(port, opts) {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('etjs websocket game proxy\n');
  });
  attachWsProxy(server, opts);
  return new Promise((resolve) => {
    server.listen(port, '0.0.0.0', () => resolve(server));
  });
}

module.exports = {
  isPortAnnouncement: isPortAnnouncement,
  attachWsProxy: attachWsProxy,
  listenProxy: listenProxy
};
