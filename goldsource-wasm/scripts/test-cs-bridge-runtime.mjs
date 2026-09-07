#!/usr/bin/env node
// WHATWG Fetch/WebSocket network smoke, not Chrome or WebRTC gameplay proof.
import assert from 'node:assert/strict';

const endpoint = new URL(process.env.CS_BRIDGE_URL || 'ws://127.0.0.1:4192/websocket');
assert.ok(['ws:', 'wss:'].includes(endpoint.protocol));
const config = new URL('/v1/config', endpoint);
config.protocol = endpoint.protocol === 'wss:' ? 'https:' : 'http:';
const response = await fetch(config, {signal: AbortSignal.timeout(5000)});
assert.equal(response.status, 200);
const settings = await response.json();
assert.equal(settings.game_dir, 'cstrike');
const socket = new WebSocket(endpoint);
try {
  const offer = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('signaling offer timed out')), 10000);
    const fail = error => { clearTimeout(timer); reject(error); };
    socket.addEventListener('error', event => fail(event.error || new Error('WebSocket failed')), {once: true});
    socket.addEventListener('close', () => fail(new Error('closed before a signaling offer')), {once: true});
    socket.addEventListener('message', event => {
      try {
        const value = JSON.parse(event.data);
        if (value[0] !== 'v1:offer') return;
        assert.equal(value[1].type, 'offer');
        assert.match(value[1].sdp, /m=application/);
        clearTimeout(timer);
        resolve(value);
      } catch (error) { fail(error); }
    });
  });
  console.log(JSON.stringify({passed: true, endpoint: endpoint.href, configHTTP: response.status,
    signalingEvent: offer[0], nativeOnly: true, browserGameplayVerified: false}));
} finally {
  socket.close();
}
