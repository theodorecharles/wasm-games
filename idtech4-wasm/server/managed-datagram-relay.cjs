'use strict';
const dgram = require('node:dgram');

// Dedicated-server lifecycle and password checks are supplied by the owner
// supervisor. No unauthenticated/default-open or caller-selected UDP target.
function attachManagedDatagramRelay(server, options) {
  const {WebSocketServer, authorize, ensureDedicated} = options;
  const port = Number(options.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid managed UDP port.');
  if (typeof authorize !== 'function' || typeof ensureDedicated !== 'function') {
    throw new Error('Managed relay requires authorization and server lifecycle hooks.');
  }
  const maxPeers = 16;
  const maxPacket = 65507;
  const maxBytes = 1024 * 1024;
  const sockets = new WebSocketServer({noServer: true, perMessageDeflate: false, maxPayload: maxPacket});
  const peers = new Set();
  const identities = new Set();
  let upgrading = 0;
  let stopped = false;
  let clientPackets = 0;
  let serverPackets = 0;

  const reject = (socket, code) => {
    socket.end(`HTTP/1.1 ${code}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  };
  async function upgrade(request, socket, head) {
    let url;
    try { url = new URL(request.url, 'http://localhost'); } catch (_) { return; }
    if (url.pathname !== '/api/doom3/socket') return;
    if (stopped) { reject(socket, '503 Service Unavailable'); return; }
    // A page on another origin must not be able to borrow a browser's session
    // cookie to wake or join the owner's match. A TLS-terminating supervisor
    // must supply its configured publicOrigin, not trust arbitrary forwarded
    // headers from the requesting client.
    let origin;
    let expectedOrigin;
    try {
      origin = new URL(request.headers.origin);
      expectedOrigin = new URL(options.publicOrigin ||
        `${request.socket.encrypted ? 'https:' : 'http:'}//${request.headers.host}`).origin;
    } catch (_) {}
    if (!origin || !['http:', 'https:'].includes(origin.protocol) || origin.origin !== expectedOrigin) {
      reject(socket, '403 Forbidden'); return;
    }
    if (peers.size + upgrading >= maxPeers) { reject(socket, '503 Service Unavailable'); return; }
    upgrading++;
    try {
      if (!await authorize(request)) { reject(socket, '403 Forbidden'); return; }
      if (stopped || socket.destroyed) return;
      sockets.handleUpgrade(request, socket, head, webSocket => sockets.emit('connection', webSocket));
    } catch (_) { if (!socket.destroyed) reject(socket, '503 Service Unavailable'); }
    finally { upgrading--; }
  }
  server.on('upgrade', upgrade);

  sockets.on('connection', webSocket => {
    let octet = 2;
    while (identities.has(octet)) octet++;
    identities.add(octet);
    const udp = dgram.createSocket('udp4');
    const peer = {webSocket, udp, octet, closed: false, ready: false, pending: [], bytes: 0};
    peers.add(peer);
    options.onPeers?.(peers.size);
    const cleanup = () => {
      if (peer.closed) return;
      peer.closed = true;
      peer.pending = [];
      peer.bytes = 0;
      peers.delete(peer);
      identities.delete(octet);
      options.onPeers?.(peers.size);
      try { udp.close(); } catch (_) { /* already closed */ }
    };
    const fail = reason => { cleanup(); webSocket.close(1013, reason); };
    webSocket.once('close', cleanup);
    webSocket.once('error', cleanup);
    udp.on('error', () => fail('Managed UDP relay failed'));
    udp.on('message', packet => {
      // A connected UDP socket accepts only the configured server's replies.
      if (peer.closed || !packet.length || packet.length > maxPacket) return;
      if (webSocket.readyState !== 1 || webSocket.bufferedAmount + packet.length > maxBytes) return;
      serverPackets++;
      webSocket.send(packet, {binary: true});
    });
    function send(packet) {
      if (peer.closed) return;
      clientPackets++;
      udp.send(packet, error => { if (error && !peer.closed) fail('Managed UDP send failed'); });
    }
    webSocket.on('message', (packet, binary) => {
      if (peer.closed) return;
      if (!binary || !packet.length || packet.length > maxPacket) { webSocket.close(1003, 'Binary game datagrams only'); return; }
      if (peer.ready) { send(packet); return; }
      if (peer.pending.length >= 128 || peer.bytes + packet.length > maxBytes) {
        fail('Too much queued game data'); return;
      }
      peer.pending.push(Buffer.from(packet));
      peer.bytes += packet.length;
    });
    const bound = new Promise((resolve, rejectBind) => {
      udp.once('error', rejectBind);
      udp.bind(0, `127.0.0.${octet}`, () => {
        if (peer.closed) { resolve(); return; }
        udp.connect(port, '127.0.0.1', () => { udp.off('error', rejectBind); resolve(); });
      });
    });
    Promise.all([bound, Promise.resolve().then(() => ensureDedicated())]).then(() => {
      if (peer.closed) return;
      peer.ready = true;
      for (const packet of peer.pending) send(packet);
      peer.pending = [];
      peer.bytes = 0;
    }).catch(() => { if (!peer.closed) fail('Managed server wake failed'); });
  });

  return Object.freeze({
    stats: () => ({peers: peers.size, clientPackets, serverPackets}),
    disconnectAll() {
      for (const peer of peers) peer.webSocket.close(1012, 'Managed server sleeping');
    },
    close() {
      stopped = true;
      server.off('upgrade', upgrade);
      for (const peer of peers) peer.webSocket.terminate();
      sockets.close();
    }
  });
}
module.exports = {attachManagedDatagramRelay};
