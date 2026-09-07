// Native-Wasm diagnostic transport only; never used by the production adapter.
import assert from 'node:assert/strict';
import dgram from 'node:dgram';
import framing from '../../server/classic-ws-proxy.js';

export function classicUdpWebSocket(port) {
  assert.ok(Number.isInteger(port) && port > 0 && port < 65536);
  const sockets = new Set();
  class NativeDiagnosticSocket {
    readyState = 0;
    bufferedAmount = 0;
    binaryType = 'arraybuffer';
    constructor() {
      this.socket = dgram.createSocket('udp4');
      sockets.add(this);
      this.socket.on('message', (packet, from) => {
        if (from.address !== '127.0.0.1' || from.port !== port) return;
        const framed = framing.encodeServerPacket(packet);
        this.onmessage?.({ data: framed.buffer.slice(framed.byteOffset, framed.byteOffset + framed.byteLength) });
      });
      this.socket.on('error', error => this.onerror?.(error));
      this.socket.bind(0, '127.0.0.1', () => {
        this.readyState = 1;
        this.onopen?.({});
      });
    }
    send(data) {
      assert.equal(this.readyState, 1);
      const packet = framing.decodeClientPacket(Buffer.from(data));
      assert.ok(packet, 'native client must send the production relay framing');
      this.socket.send(packet, port, '127.0.0.1');
    }
    close() {
      if (this.readyState === 3) return;
      this.readyState = 3;
      sockets.delete(this);
      this.socket.close();
      this.onclose?.({ code: 1000, reason: 'diagnostic complete', wasClean: true });
    }
  }
  return { WebSocket: NativeDiagnosticSocket, close: () => { for (const socket of [...sockets]) socket.close(); } };
}
