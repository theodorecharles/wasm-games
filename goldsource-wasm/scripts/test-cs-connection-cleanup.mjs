import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../src/framework-adapter.js', import.meta.url), 'utf8');
const bridgeClass = source.slice(source.indexOf('class WebRtcXash '), source.indexOf('\nfunction configurationFor'));
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const tick = async () => { for (let n = 0; n < 8; n++) await Promise.resolve(); };
function fixture({ fallback = false, constructorFails = false } = {}) {
  const sockets = [], peers = [], timers = new Map(), incoming = [], native = deferred();
  let timerId = 0;
  class Socket {
    static OPEN = 1;
    constructor(url) { if (constructorFails) throw Error('constructor failed'); this.url = String(url); this.readyState = 1; this.sent = []; sockets.push(this); }
    close() { this.closed = true; }
    send(message) { this.sent.push(message); }
  }
  class Peer {
    constructor() { this.remote = deferred(); this.answers = 0; peers.push(this); }
    async setRemoteDescription(value) { await this.remote.promise; this.remoteDescription = value; }
    async addIceCandidate() {}
    async createAnswer() { this.answers++; return { type: 'answer', sdp: 'test' }; }
    async setLocalDescription() {}
    close() { this.closed = true; }
  }
  const context = vm.createContext({ URL, URLSearchParams, Blob, Uint8Array, Set, Error,
    location: { search: '' }, BRIDGE_FALLBACK: '127.0.0.1:4192', WebSocket: Socket, RTCPeerConnection: Peer,
    Xash3D: class { init() { return native.promise; } }, Net: class { incoming = { enqueue: item => incoming.push(item) }; },
    setTimeout: fn => { timers.set(++timerId, fn); return timerId; }, clearTimeout: id => timers.delete(id) });
  const Engine = vm.runInContext(`${bridgeClass}\nWebRtcXash`, context);
  const engine = new Engine({ localBridgeFallback: fallback }, new URL('wss://games.test/counter-strike/websocket'));
  const signal = socket => socket.onmessage({ data: JSON.stringify(['v1:offer', { type: 'offer', sdp: 'test' }]) });
  return { engine, sockets, peers, timers, native, incoming, signal };
}
let cases = 0;
{
  const f = fixture({ constructorFails: true });
  await assert.rejects(f.engine.connectWithFallback(), /constructor failed/);
  assert.equal(f.timers.size, 0); assert.equal(f.engine.cancelConnect, null); cases++;
}
{
  const f = fixture(); const connecting = f.engine.connectWithFallback();
  f.timers.values().next().value();
  await assert.rejects(connecting, /Timed out/);
  assert.equal(f.timers.size, 0); assert.equal(f.sockets.length, 1); assert.ok(f.sockets[0].closed); cases++;
}
{
  const f = fixture({ fallback: true }); const connecting = f.engine.init();
  f.native.reject(Error('native compilation failed'));
  await assert.rejects(connecting, /native compilation failed/); await tick();
  assert.equal(f.timers.size, 0); assert.equal(f.sockets.length, 1); assert.ok(f.sockets[0].closed);
  assert.equal(f.engine.connectionAborted, true); cases++;
}
{
  const f = fixture({ fallback: true }); const connecting = f.engine.connectWithFallback();
  const oldOffer = f.signal(f.sockets[0]);
  const oldPeer = f.peers[0];
  f.sockets[0].onerror(); await tick();
  assert.equal(f.sockets.length, 2); assert.ok(oldPeer.closed); assert.ok(f.sockets[0].closed);
  const newOffer = f.signal(f.sockets[1]); const peer = f.peers[1];
  oldPeer.remote.resolve(); await oldOffer;
  assert.equal(oldPeer.answers, 0); assert.equal(peer.answers, 0); assert.equal(f.sockets[1].sent.length, 0);
  peer.remote.resolve(); await newOffer;
  const channels = ['read', 'write'].map(label => ({ label, close() { this.closed = true; } }));
  for (const channel of channels) { peer.ondatachannel({ channel }); channel.onopen(); }
  await connecting;
  assert.equal(f.timers.size, 0); assert.equal(peer.answers, 1);
  f.engine.disposeConnection();
  assert.ok(peer.closed); assert.ok(channels.every(channel => channel.closed && !channel.onmessage && !channel.onopen));
  assert.equal(f.engine.channel, null); assert.equal(f.engine.channels.size, 0); cases++;
}
{
  const f = fixture({ fallback: true }); const connecting = f.engine.connectWithFallback();
  f.sockets[0].onerror(); await tick(); f.sockets[1].onclose({ code: 1006 });
  await assert.rejects(connecting, /closed/);
  assert.equal(f.sockets.length, 2); assert.ok(f.sockets.every(socket => socket.closed)); assert.equal(f.timers.size, 0); cases++;
}
{
  const f = fixture(); f.engine.connectionAborted = true;
  await assert.rejects(f.engine.connectWithFallback(), /aborted/);
  assert.equal(f.sockets.length, 0); assert.equal(f.timers.size, 0); cases++;
}
console.log(`Counter-Strike connection cleanup: ${cases} timeout/native-failure/retry/stale-offer/disposal cases passed.`);
