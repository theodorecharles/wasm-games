'use strict';

const dgram = require('node:dgram');

const PORT_MAGIC = Buffer.from([0xff, 0xff, 0xff, 0xff, 0x70, 0x6f, 0x72, 0x74]);

function isPortAnnouncement(packet) {
  return packet.length === 10 && packet.subarray(0, PORT_MAGIC.length).equals(PORT_MAGIC);
}

function attachWebSocketUdpProxy(server, options) {
  const config = options || {};
  const WebSocketServer = config.WebSocketServer || require('ws').WebSocketServer;
  const destinationHost = config.destinationHost || '127.0.0.1';
  const destinationPort = Number(config.destinationPort || 27960);
  const pathname = config.path || '/ws';
  const webSockets = new WebSocketServer({ noServer: true, perMessageDeflate: false });
  const peers = new Set();

  server.on('upgrade', (request, socket, head) => {
    let requestedPath;
    try { requestedPath = new URL(request.url, 'http://localhost').pathname; } catch (_) {
      socket.destroy();
      return;
    }
    if (requestedPath !== pathname) {
      socket.destroy();
      return;
    }
    if (config.authorize && !config.authorize(request)) {
      if (config.reject) config.reject(socket); else socket.destroy();
      return;
    }
    webSockets.handleUpgrade(request, socket, head, webSocket => {
      process.stdout.write('websocket proxy upgrade path=/ws\n');
      webSockets.emit('connection', webSocket, request);
    });
  });

  webSockets.on('connection', webSocket => {
    const udp = dgram.createSocket('udp4');
    const peer = { webSocket, udp };
    peers.add(peer);
    let ready = !config.ensureDedicated;
    let wakePromise = null;
    let pending = [];
    let pendingBytes = 0;

    const cleanup = () => {
      peers.delete(peer);
      pending = [];
      pendingBytes = 0;
      try { udp.close(); } catch (_) { /* already closed */ }
    };
    const wake = () => {
      if (ready || wakePromise) return;
      wakePromise = Promise.resolve(config.ensureDedicated('browser game connection')).then(() => {
        ready = true;
        const queued = pending;
        pending = [];
        pendingBytes = 0;
        for (const packet of queued) udp.send(packet, destinationPort, destinationHost);
      }).catch(() => {
        pending = [];
        pendingBytes = 0;
        try { webSocket.close(1013, 'game server wake failed'); } catch (_) { /* closed */ }
      });
    };

    udp.bind(0, '127.0.0.1');
    udp.on('message', packet => {
      if (webSocket.readyState === webSocket.OPEN) webSocket.send(packet, { binary: true });
    });
    udp.on('error', () => {
      try { webSocket.close(1011, 'UDP proxy failed'); } catch (_) { /* closed */ }
    });
    webSocket.on('message', value => {
      const packet = Buffer.isBuffer(value) ? value : Buffer.from(value);
      const head = packet.subarray(0, Math.min(16, packet.length)).toString('hex');
      process.stdout.write(`websocket datagram bytes=${packet.length} head=${head} dest=${destinationHost}:${destinationPort}\n`);
      if (isPortAnnouncement(packet)) return;
      if (!ready) {
        if (pending.length >= 256 || pendingBytes + packet.length > 1024 * 1024) {
          webSocket.close(1009, 'too much queued game data');
          return;
        }
        pending.push(Buffer.from(packet));
        pendingBytes += packet.length;
        wake();
        return;
      }
      udp.send(packet, destinationPort, destinationHost);
    });
    webSocket.once('close', cleanup);
    webSocket.once('error', cleanup);
  });

  function closeAll(code, reason) {
    for (const peer of Array.from(peers)) {
      try { peer.webSocket.close(code || 1012, reason || 'game server sleeping'); } catch (_) { /* closed */ }
      try { peer.udp.close(); } catch (_) { /* closed */ }
      peers.delete(peer);
    }
  }

  return Object.freeze({ webSockets, closeAll, peerCount: () => peers.size });
}

module.exports = Object.freeze({ isPortAnnouncement, attachWebSocketUdpProxy });
