#!/usr/bin/env node
// Read-only observer. Human clients must be driven separately through Chrome.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const [origin, count, output] = process.argv.slice(2);
const url = new URL(origin);
assert.equal(url.hostname, '127.0.0.1');
assert.equal(url.protocol, 'http:');
const humans = Number(count);
assert.ok(Number.isInteger(humans) && humans >= 0 && humans <= 8 && output);
const target = Math.min(2, 8 - humans);
const samples = [];
const deadline = Date.now() + 180000;
while (Date.now() < deadline) {
  const response = await fetch(new URL('/api/doom3/status', url), {signal: AbortSignal.timeout(5000)});
  assert.equal(response.status, 200);
  const state = await response.json();
  samples.push({observedAt: Date.now(), ...state});
  if (state.state === 'running' && state.nativeHumans === humans && state.players.length === humans &&
      state.bots === target && state.botTarget === target && state.botStatus === 'ready') {
    assert.equal(new Set(state.players.map(player => player.name)).size, humans);
    assert.equal(new Set(state.players.map(player => player.slot)).size, humans);
    assert.equal(state.botPlayers.length, target);
    assert.ok(state.botPlayers.every(bot => !state.players.some(player => player.slot === bot.slot)));
    assert.ok(state.browserPeers >= humans);
    assert.ok(Date.now() - state.botUpdatedAt < 15000);
    const proof = {scope: 'Read-only native roster/target and relay observation while separately controlled Chrome clients join or leave. This observer does not create humans, inject input or verify rendering.',
      origin, humans, target, samples, passed: true};
    fs.writeFileSync(output, JSON.stringify(proof, null, 2) + '\n');
    console.log(JSON.stringify({humans, bots: state.bots, target, names: state.players.map(player => player.name), samples: samples.length, passed: true}));
    process.exit(0);
  }
  await new Promise(resolve => setTimeout(resolve, 2000));
}
fs.writeFileSync(output, JSON.stringify({scope: 'Incomplete read-only Chrome capacity observation.', origin, humans, target, samples, passed: false}, null, 2) + '\n');
throw new Error('Timed out waiting for the expected real native human/bot population.');
