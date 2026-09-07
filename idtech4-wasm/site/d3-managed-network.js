'use strict';

// One binary WebSocket message is one native Doom 3 datagram. The relay owns
// the fixed UDP destination; neither engine commands nor packet contents can
// turn it into an arbitrary-host proxy.
globalThis.createD3ManagedNetwork = function createD3ManagedNetwork(options) {
  const base = new URL(options.pageUrl);
  const endpoint = new URL('/api/doom3/socket', base);
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password) {
    throw new Error('Managed Doom 3 networking requires an HTTP(S) origin.');
  }
  endpoint.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
  const Socket = options.WebSocket || globalThis.WebSocket;
  const peers = new Map();
  const maximumPacket = 65507;
  const maximumBytes = 1024 * 1024;
  const maximumPackets = 128;
  let nextHandle = 1;

  function close(handle) {
    const peer = peers.get(handle);
    if (!peer) return;
    peers.delete(handle);
    peer.queue.length = 0;
    peer.bytes = 0;
    try { peer.socket.close(); } catch (_) { /* already closed */ }
  }

  return Object.freeze({
    open() {
      // idAsyncClient has one port. Refuse a second engine socket rather than
      // accidentally sharing/consuming the first client's incoming messages.
      if (peers.size) return 0;
      let socket;
      try { socket = new Socket(endpoint.href); }
      catch (error) { options.onError?.(String(error.message || error)); return 0; }
      socket.binaryType = 'arraybuffer';
      const handle = nextHandle++;
      const peer = {socket, queue: [], bytes: 0};
      peers.set(handle, peer);
      socket.onmessage = event => {
        if (peers.get(handle) !== peer) return;
        if (!(event.data instanceof ArrayBuffer)) return;
        const packet = new Uint8Array(event.data);
        if (!packet.byteLength || packet.byteLength > maximumPacket) return;
        // UDP-style bounded loss under pressure; never truncate a datagram or
        // let a slow/background tab accumulate unbounded engine traffic.
        if (peer.queue.length >= maximumPackets || peer.bytes + packet.byteLength > maximumBytes) return;
        peer.queue.push(packet);
        peer.bytes += packet.byteLength;
      };
      socket.onerror = () => {
        if (peers.get(handle) === peer) options.onError?.('Managed Doom 3 connection failed.');
      };
      socket.onclose = () => {
        if (peers.get(handle) !== peer) return;
        peers.delete(handle);
        peer.queue.length = 0;
        peer.bytes = 0;
        options.onClose?.();
      };
      return handle;
    },
    close,
    closeAll() {
      for (const handle of peers.keys()) close(handle);
    },
    receive(handle, target) {
      const peer = peers.get(handle);
      if (!peer || !peer.queue.length) return 0;
      const packet = peer.queue.shift();
      peer.bytes -= packet.byteLength;
      if (packet.byteLength > target.byteLength) return 0;
      target.set(packet);
      return packet.byteLength;
    },
    send(handle, packet) {
      const peer = peers.get(handle);
      if (!peer || peer.socket.readyState !== 1 || !packet.byteLength || packet.byteLength > maximumPacket) return false;
      if (peer.socket.bufferedAmount + packet.byteLength > maximumBytes) return false;
      // Copy out of Wasm memory: memory growth and caller buffer reuse must
      // not change a datagram after it is handed to the browser.
      try { peer.socket.send(packet.slice()); return true; }
      catch (_) { return false; }
    }
  });
};
