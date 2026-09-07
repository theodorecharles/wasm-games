#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../site/d3-managed-network.js', import.meta.url), 'utf8');
const context = vm.createContext({URL, ArrayBuffer, Uint8Array});
vm.runInContext(source, context);
const sockets = [];
class Socket {
  constructor(url) { this.url = url; this.readyState = 0; this.bufferedAmount = 0; this.sent = []; sockets.push(this); }
  send(value) { this.sent.push(value); }
  close() { this.readyState = 3; this.onclose?.(); }
  packet(value) { this.onmessage?.({data: new Uint8Array(value).buffer}); }
}
let cases = 0;
const check = (actual, expected, label) => { assert.deepEqual(actual, expected, label); cases++; };
const errors = [];
let closes = 0;
const create = pageUrl => context.createD3ManagedNetwork({pageUrl, WebSocket: Socket,
  onError: error => errors.push(error), onClose: () => closes++});
const network = create('https://game.test:8088/?destination=untrusted');
const handle = network.open();
check(handle, 1, 'valid handle');
const socket = sockets.at(-1);
check(socket.url, 'wss://game.test:8088/api/doom3/socket', 'fixed same-origin relay');
check(socket.binaryType, 'arraybuffer', 'binary datagrams');
check(network.open(), 0, 'one engine port');
check(network.send(handle, new Uint8Array([1])), false, 'connecting drops UDP packet');
socket.readyState = 1;
const outgoing = new Uint8Array([255, 0, 2]);
check(network.send(handle, outgoing), true, 'open send');
outgoing.fill(9);
check([...socket.sent[0]], [255, 0, 2], 'copy out of reusable Wasm memory');
check(network.send(999, outgoing), false, 'invalid handle send');
check(network.send(handle, new Uint8Array()), false, 'empty send');
check(network.send(handle, new Uint8Array(65508)), false, 'oversize send');
socket.bufferedAmount = 1024 * 1024;
check(network.send(handle, outgoing), false, 'bounded socket buffer');
socket.bufferedAmount = 0;
const target = new Uint8Array(4);
socket.packet([1, 2, 3, 4]);
check(network.receive(handle, target), 4, 'exact-capacity datagram');
check([...target], [1, 2, 3, 4], 'binary bytes intact');
check(network.receive(handle, target), 0, 'empty receive');
socket.packet([1, 2, 3, 4, 5]);
target.fill(7);
check(network.receive(handle, target), 0, 'oversize receive dropped not truncated');
check([...target], [7, 7, 7, 7], 'overflow leaves target intact');
socket.onmessage({data: 'text is not a datagram'});
socket.packet([]);
socket.packet(new Uint8Array(65508));
check(network.receive(handle, target), 0, 'malformed datagrams rejected');
for (let index = 0; index < 140; index++) socket.packet([index]);
let received = 0;
while (network.receive(handle, target)) received++;
check(received, 128, 'packet count bounded');
for (let index = 0; index < 25; index++) socket.packet(new Uint8Array(65507));
const large = new Uint8Array(65507);
received = 0;
while (network.receive(handle, large)) received++;
check(received, 16, 'incoming bytes bounded below 1 MiB');
socket.packet([5]);
network.close(handle);
check(network.receive(handle, target), 0, 'close clears buffered packets');
check(closes, 0, 'intentional close is not remote disconnect');
socket.packet([6]);
check(network.receive(handle, target), 0, 'late callback ignored');
const reopened = network.open();
check(reopened, 2, 'fresh handle on reconnect');
socket.packet([7]);
check(network.receive(reopened, target), 0, 'old connection cannot contaminate new one');
sockets.at(-1).onerror();
check(errors.length, 1, 'connection error reported');
sockets.at(-1).close();
check(closes, 1, 'remote disconnect reported once');
check(network.receive(reopened, target), 0, 'remote close clears queue');
network.close(reopened);
const http = create('http://127.0.0.1:32882/a');
const local = http.open();
check(sockets.at(-1).url, 'ws://127.0.0.1:32882/api/doom3/socket', 'local HTTP relay');
http.close(local);
const disposing = network.open();
const disposalSocket = sockets.at(-1);
disposalSocket.readyState = 1;
disposalSocket.packet([42]);
network.closeAll();
check(disposalSocket.readyState, 3, 'worker exit closes its active WebSocket');
check(network.receive(disposing, target), 0, 'worker exit discards queued packets');
check(closes, 1, 'worker exit does not report a remote close');
network.closeAll();
check(network.open() > disposing, true, 'disposal is idempotent and permits a fresh native connection');
network.closeAll();
for (const url of ['file:///tmp/no', 'ftp://host', 'https://user:password@host']) {
  assert.throws(() => create(url), /HTTP\(S\) origin/); cases++;
}
const unavailable = context.createD3ManagedNetwork({pageUrl: 'https://game.test/',
  WebSocket: class { constructor() { throw new Error('unavailable'); } },
  onError: error => errors.push(error)});
check(unavailable.open(), 0, 'constructor failure does not create phantom port');
check(errors.at(-1), 'unavailable', 'constructor failure reported');
console.log(`Doom 3 managed datagram worker transport: ${cases} cases passed (not a game handshake).`);
