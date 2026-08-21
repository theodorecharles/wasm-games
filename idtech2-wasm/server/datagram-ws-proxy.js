'use strict';

const dgram = require('node:dgram');

function attachDatagramWebSocketProxy(server, options) {
  const config = options || {};
  const WebSocketServer = config.WebSocketServer || require('ws').WebSocketServer;
  const destinationHost = config.destinationHost || '127.0.0.1';
  const initialDestinationPort = Number(config.destinationPort);
  const pathname = String(config.path);
  const webSockets = new WebSocketServer({ noServer: true, perMessageDeflate: false });
  const peers = new Set();
  const sourceOctets = new Set();
  let clientPackets = 0;
  let serverPackets = 0;
  let acceptedPort = initialDestinationPort;

  function allocateSourceOctet() {
    for (let octet = 2; octet <= 254; octet += 1) {
      if (!sourceOctets.has(octet)) {
        sourceOctets.add(octet);
        return octet;
      }
    }
    throw new Error('The browser datagram relay has no free loopback identities.');
  }

  function notifyPeers() {
    config.onPeers?.(peers.size);
  }

  function socketPort(socket) {
    try { return socket.address().port || 0; } catch (_) { return 0; }
  }

  server.on('upgrade', (request, socket, head) => {
    let requestedPath;
    try { requestedPath = new URL(request.url, 'http://localhost').pathname; } catch (_) {
      socket.destroy();
      return;
    }
    if (requestedPath !== pathname) return;
    webSockets.handleUpgrade(request, socket, head, webSocket => {
      webSockets.emit('connection', webSocket, request);
    });
  });

  webSockets.on('connection', webSocket => {
    const udp = dgram.createSocket('udp4');
    const sourceOctet = allocateSourceOctet();
    const peer = {
      webSocket, udp, closed: false, ready: !config.ensureDedicated,
      wakePromise: null, pending: [], pendingBytes: 0,
      destinationPort: initialDestinationPort,
      sourceOctet, sourceHost: `127.0.0.${sourceOctet}`,
      clientPackets: 0, serverPackets: 0, controlTransfers: 0
    };
    peers.add(peer);
    notifyPeers();

    function cleanup() {
      if (peer.closed) return;
      peer.closed = true;
      peers.delete(peer);
      sourceOctets.delete(peer.sourceOctet);
      peer.pending = [];
      peer.pendingBytes = 0;
      try { udp.close(); } catch (_) { /* already closed */ }
      notifyPeers();
    }

    function sendUdp(packet) {
      peer.clientPackets += 1;
      udp.send(packet, peer.destinationPort, destinationHost);
    }

    function wake() {
      if (peer.ready || peer.wakePromise) return;
      peer.wakePromise = Promise.resolve(config.ensureDedicated('browser datagram connection')).then(() => {
        peer.ready = true;
        const pending = peer.pending;
        peer.pending = [];
        peer.pendingBytes = 0;
        for (const packet of pending) sendUdp(packet);
      }).catch(() => {
        peer.pending = [];
        peer.pendingBytes = 0;
        try { webSocket.close(1013, 'game server wake failed'); } catch (_) { /* closed */ }
      });
    }

    // WinQuake treats another connection from the same IP as a crashed client
    // returning and closes the old socket. Give every browser a distinct
    // loopback address so several local WebSocket clients remain independent.
    udp.bind(0, peer.sourceHost);
    udp.on('message', packet => {
      serverPackets += 1;
      peer.serverPackets += 1;
      // NetQuake's CCREP_ACCEPT response transfers the connection from the
      // well-known control port to a per-client UDP port. Keep that native
      // protocol behavior intact behind the browser's single WebSocket.
      const controlHeader = packet.length >= 4 ? packet.readUInt32BE(0) : 0;
      const isControlPacket = ((controlHeader & 0xffff0000) >>> 0) === 0x80000000 &&
        (controlHeader & 0xffff) === packet.length;
      if (config.protocol === 'netquake' && packet.length >= 9 &&
          isControlPacket && packet[4] === 0x81) {
        const nextPort = packet.readInt32LE(5);
        if (nextPort > 0 && nextPort <= 65535) {
          peer.destinationPort = nextPort;
          acceptedPort = peer.destinationPort;
          peer.controlTransfers += 1;
        }
      }
      if (webSocket.readyState === webSocket.OPEN) webSocket.send(packet, { binary: true });
    });
    udp.on('error', () => {
      try { webSocket.close(1011, 'UDP relay failed'); } catch (_) { /* closed */ }
    });
    webSocket.on('message', value => {
      const packet = Buffer.isBuffer(value) ? value : Buffer.from(value);
      if (!packet.length || packet.length > 131072) return;
      clientPackets += 1;
      if (!peer.ready) {
        if (peer.pending.length >= 256 || peer.pendingBytes + packet.length > 16 * 1024 * 1024) {
          webSocket.close(1009, 'too much queued game data');
          return;
        }
        peer.pending.push(Buffer.from(packet));
        peer.pendingBytes += packet.length;
        wake();
        return;
      }
      sendUdp(packet);
    });
    webSocket.once('close', cleanup);
    webSocket.once('error', cleanup);
  });

  function closeAll(code, reason) {
    for (const peer of Array.from(peers)) {
      try { peer.webSocket.close(code || 1012, reason || 'game server sleeping'); } catch (_) { /* closed */ }
      try { peer.udp.close(); } catch (_) { /* closed */ }
      peer.closed = true;
      peers.delete(peer);
      sourceOctets.delete(peer.sourceOctet);
    }
    notifyPeers();
  }

  return Object.freeze({
    webSockets, closeAll, peerCount: () => peers.size,
    stats: () => Object.freeze({
      clientPackets, serverPackets, acceptedPort,
      peers: Array.from(peers, peer => Object.freeze({
        sourceHost: peer.sourceHost,
        sourcePort: socketPort(peer.udp),
        destinationPort: peer.destinationPort,
        clientPackets: peer.clientPackets,
        serverPackets: peer.serverPackets,
        controlTransfers: peer.controlTransfers
      }))
    })
  });
}

module.exports = Object.freeze({ attachDatagramWebSocketProxy });
