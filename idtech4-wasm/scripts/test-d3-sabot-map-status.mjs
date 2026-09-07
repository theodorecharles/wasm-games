#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = process.env.D3_SABOT_RUNTIME_SOURCE || path.join(root, '.work/d3-sabot-browser-candidate/runtime.cjs');
const source = fs.readFileSync(file, 'utf8');
const start = source.indexOf('    status() {');
assert.ok(start >= 0);
let end = source.indexOf('{', start) + 1, depth = 1;
while (depth && end < source.length) { if (source[end] === '{') depth++; if (source[end] === '}') depth--; end++; }
assert.equal(depth, 0);
const method = source.slice(start, end);
function observe(text, state, roster, configured = 'game/mp/d3dm1') {
  return vm.runInNewContext('({' + text + '}).status()', {
    lifecycle: {status: () => ({state, map: configured})}, map: configured,
    roster, active: null, browserPeers: 0, botReady: () => false
  });
}
const checks = [];
for (let initial = 1; initial <= 5; initial++) for (let current = 1; current <= 5; current++) {
  const map = `game/mp/d3dm${current}`;
  const value = observe(method, 'running', {map, protocol: '1.42', players: [{slot: 0, name: 'VoteMarine'}]}, `game/mp/d3dm${initial}`);
  assert.equal(value.map, map);
  assert.equal(value.protocol, '1.42');
  assert.equal(value.players[0].name, 'VoteMarine');
  checks.push(`configured d3dm${initial}, native d3dm${current}`);
}
for (const state of ['sleeping', 'starting', 'failed']) for (let initial = 1; initial <= 5; initial++) {
  const map = `game/mp/d3dm${initial}`;
  assert.equal(observe(method, state, null, map).map, map);
  checks.push(`${state} without native roster reports configured d3dm${initial}`);
}
const old = method.replace('map: roster?.map || map', 'map');
assert.notEqual(old, method, 'actual method must report the native map');
const legacy = observe(old, 'running', {map: 'game/mp/d3dm2'}, 'game/mp/d3dm1');
assert.equal(legacy.map, 'game/mp/d3dm1');
const proof = {scope: 'Exact candidate status method executed with fixture lifecycle/roster state. All 25 configured/native stock-map pairs and 15 no-roster states; not a Chrome transition test.',
  runtimeSHA256: crypto.createHash('sha256').update(source).digest('hex'), checks,
  negativeControl: {nativeMap: 'game/mp/d3dm2', incorrectlyReported: legacy.map}, passed: true};
if (process.env.D3_SABOT_MAP_STATUS_PROOF) fs.writeFileSync(process.env.D3_SABOT_MAP_STATUS_PROOF, JSON.stringify(proof, null, 2) + '\n');
console.log(JSON.stringify(proof, null, 2));
