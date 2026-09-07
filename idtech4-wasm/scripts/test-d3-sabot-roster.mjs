#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const {createSabotRoster} = require('../server/sabot-roster.cjs');
const actual = JSON.parse(fs.readFileSync(new URL('../proofs/d3-sabot-two-client-status-2026-09-05.json', import.meta.url)));
const rows = actual.botPlayers;
assert.equal(rows.length, 2);
const frame = (count = 2, time = rows[0].time) => 'SABOT_FRAME ' + JSON.stringify({time, bots: count}) + '\n';
const sample = row => 'SABOT_SAMPLE ' + JSON.stringify(row) + '\n';
const wire = frame() + rows.map(sample).join('');
const checks = [];
function test(label, run) { run(); checks.push(label); }
test('real native frame survives every possible chunk split', () => {
  for (let split = 0; split <= wire.length; split++) {
    const parser = createSabotRoster();
    parser.push(wire.slice(0, split)); parser.push(wire.slice(split));
    assert.deepEqual(parser.snapshot().players, rows);
  }
});
test('one-byte chunks and CRLF', () => {
  const parser = createSabotRoster();
  for (const byte of Buffer.from(wire.replaceAll('\n', '\r\n'))) parser.push(Buffer.from([byte]));
  assert.deepEqual(parser.snapshot().players, rows);
});
test('partial frames never create a new roster; old data expires', () => {
  let tick = 0;
  const parser = createSabotRoster({now: () => tick});
  parser.push(wire); tick = 14999;
  parser.push(frame() + sample(rows[0]));
  assert.equal(parser.snapshot().fresh, true);
  tick = 15000;
  assert.equal(parser.snapshot().fresh, false);
  assert.deepEqual(parser.snapshot().players, []);
});
for (const [label, invalid] of [
  ['invalid JSON', 'SABOT_FRAME {broken}\n'],
  ['null JSON', 'SABOT_FRAME null\n'],
  ['oversized count', frame(32)], ['negative count', frame(-1)], ['fractional count', frame(1.5)],
  ['out-of-range time', frame(2, -1)],
  ['duplicate slot', frame() + sample(rows[0]) + sample(rows[0])],
  ['wrong sample time', frame() + sample({...rows[0], time: rows[0].time + 1})],
  ['zero slot', frame() + sample({...rows[0], slot: 0})],
  ['oversized slot', frame() + sample({...rows[0], slot: 32})],
  ['bad health', frame() + sample({...rows[0], health: '100'})],
  ['bad spectator flag', frame() + sample({...rows[0], spectating: 2})],
  ['bad vector', frame() + sample({...rows[0], origin: [0, 1]})],
  ['non-finite vector', frame() + sample(rows[0]).replace('"origin":[', '"origin":[1e999,')],
  ['bad movement', frame() + sample({...rows[0], move: [128, 0, 0]})],
  ['bad buttons', frame() + sample({...rows[0], buttons: 256})],
  ['bad weapon', frame() + sample({...rows[0], weapon: 64})],
  ['bad frags', frame() + sample({...rows[0], frags: 0.5})],
  ['sample without frame', sample(rows[0])],
]) test(label + ' invalidates readiness without throwing', () => {
  const parser = createSabotRoster(); parser.push(wire); parser.push(invalid);
  assert.deepEqual(parser.snapshot(), {fresh: false, updatedAt: null, players: []});
});
test('oversized partial line is bounded, discarded and recovers on next frame', () => {
  const parser = createSabotRoster(); parser.push(wire);
  for (let i = 0; i < 8; i++) parser.push('x'.repeat(1024 * 1024));
  assert.equal(parser.snapshot().fresh, false);
  parser.push('\n' + wire); assert.deepEqual(parser.snapshot().players, rows);
});
test('empty frame clears bots immediately', () => {
  const parser = createSabotRoster(); parser.push(wire); parser.push(frame(0));
  assert.equal(parser.snapshot().fresh, true); assert.deepEqual(parser.snapshot().players, []);
});
test('map time reset is allowed and ignores ordinary diagnostic lines', () => {
  const parser = createSabotRoster(); parser.push(wire);
  parser.push('Restarting map\n' + frame(1, 0) + sample({...rows[0], time: 0}));
  assert.deepEqual(parser.snapshot().players, [{...rows[0], time: 0}]);
});
test('status consumers cannot mutate the internal roster', () => {
  const parser = createSabotRoster(); parser.push(wire);
  parser.snapshot().players[0].origin[0] = 1e8;
  assert.deepEqual(parser.snapshot().players, rows);
});
const populationFrame = (humans, target, bots = 2) => 'SABOT_FRAME ' + JSON.stringify({time: rows[0].time, bots, humans, target}) + '\n';
test('population mode rejects legacy frames instead of inventing human/target counts', () => {
  const parser = createSabotRoster({requirePopulation: true}); parser.push(wire);
  assert.equal(parser.snapshot().fresh, false);
});
test('population metadata commits with the complete bot frame', () => {
  const parser = createSabotRoster({requirePopulation: true});
  parser.push(populationFrame(2, 2) + sample(rows[0]));
  assert.equal(parser.snapshot().fresh, false);
  parser.push(sample(rows[1]));
  assert.equal(parser.snapshot().humans, 2); assert.equal(parser.snapshot().target, 2);
});
test('eight humans and zero desired bots is a valid fresh population frame', () => {
  const parser = createSabotRoster({requirePopulation: true}); parser.push(populationFrame(8, 0, 0));
  assert.equal(parser.snapshot().fresh, true); assert.equal(parser.snapshot().humans, 8);
  assert.equal(parser.snapshot().target, 0); assert.deepEqual(parser.snapshot().players, []);
});
for (const [humans, target, bots] of [[-1,2,2],[33,0,0],[2,32,2],[2,-2,2],[2.5,2,2],[2,1.5,2],[31,2,2]]) {
  test('invalid population metadata ' + JSON.stringify({humans,target,bots}), () => {
    const parser = createSabotRoster({requirePopulation: true}); parser.push(populationFrame(humans, target, bots));
    assert.equal(parser.snapshot().fresh, false);
  });
}
const proof = {scope: 'Bounded native stdout telemetry parsing using real two-bot samples and adversarial framing/schema/freshness cases; not gameplay.', checks, passed: true};
if (process.env.D3_SABOT_ROSTER_PROOF) fs.writeFileSync(process.env.D3_SABOT_ROSTER_PROOF, JSON.stringify(proof, null, 2) + '\n');
console.log(JSON.stringify(proof, null, 2));
