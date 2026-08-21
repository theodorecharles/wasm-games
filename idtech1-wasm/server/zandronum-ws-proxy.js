'use strict';

const dgram = require('node:dgram');

function attachZandronumWebSocketProxy(server, options) {
  const config = options || {};
  const WebSocketServer = config.WebSocketServer || require('ws').WebSocketServer;
  const destinationHost = config.destinationHost || '127.0.0.1';
  const destinationPort = Number(config.destinationPort || 10666);
  const pathname = config.path || '/ws/zandronum';
  const webSockets = new WebSocketServer({ noServer: true, perMessageDeflate: false });
  const peers = new Set();

  function notifyPeers() {
    config.onPeers?.(peers.size);
  }

  server.on('upgrade', (request, socket, head) => {
    let requestedPath;
    try { requestedPath = new URL(request.url, 'http://localhost').pathname; } catch (_) {
      socket.destroy();
      return;
    }
    if (requestedPath !== pathname) return;
    if (config.authorize && !config.authorize(request)) {
      if (config.reject) config.reject(socket); else socket.destroy();
      return;
    }
    webSockets.handleUpgrade(request, socket, head, webSocket => {
      webSockets.emit('connection', webSocket, request);
    });
  });

  webSockets.on('connection', webSocket => {
    const udp = dgram.createSocket('udp4');
    const peer = { webSocket, udp, closed: false };
    let ready = !config.ensureDedicated;
    let wakePromise = null;
    let pending = [];
    let pendingBytes = 0;
    peers.add(peer);
    notifyPeers();

    const cleanup = () => {
      if (peer.closed) return;
      peer.closed = true;
      peers.delete(peer);
      pending = [];
      pendingBytes = 0;
      try { udp.close(); } catch (_) { /* already closed */ }
      notifyPeers();
    };
    const wake = () => {
      if (ready || wakePromise) return;
      wakePromise = Promise.resolve(config.ensureDedicated('Zandronum browser connection')).then(() => {
        ready = true;
        const queued = pending;
        pending = [];
        pendingBytes = 0;
        for (const packet of queued) udp.send(packet, destinationPort, destinationHost);
      }).catch(() => {
        pending = [];
        pendingBytes = 0;
        try { webSocket.close(1013, 'Zandronum game server wake failed'); } catch (_) { /* closed */ }
      });
    };

    udp.bind(0, '127.0.0.1');
    udp.on('message', packet => {
      if (webSocket.readyState === webSocket.OPEN) webSocket.send(packet, { binary: true });
    });
    udp.on('error', () => {
      try { webSocket.close(1011, 'Zandronum UDP proxy failed'); } catch (_) { /* closed */ }
    });
    webSocket.on('message', value => {
      const packet = Buffer.isBuffer(value) ? value : Buffer.from(value);
      if (!packet.length || packet.length > 131072) return;
      if (!ready) {
        if (pending.length >= 256 || pendingBytes + packet.length > 16 * 1024 * 1024) {
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
      try { peer.webSocket.close(code || 1012, reason || 'Zandronum server sleeping'); } catch (_) { /* closed */ }
      try { peer.udp.close(); } catch (_) { /* closed */ }
      peer.closed = true;
      peers.delete(peer);
    }
    notifyPeers();
  }

  return Object.freeze({ webSockets, closeAll, peerCount: () => peers.size });
}

module.exports = Object.freeze({ attachZandronumWebSocketProxy });
