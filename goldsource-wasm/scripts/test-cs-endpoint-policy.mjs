#!/usr/bin/env node
// Execute the actual adapter policy, without replacing its decision logic.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../src/framework-adapter.js', import.meta.url), 'utf8');
const start = source.indexOf('  async connectWithFallback() {');
const end = source.indexOf('\n  createPeer(', start);
assert.ok(start >= 0 && end > start, 'actual transport policy must be found');
const method = source.slice(start, end).trim();
const fallback = 'ws://127.0.0.1:4192/websocket';
const cases = [
  { search: '?game=counter-strike', endpoint: 'ws://127.0.0.1:8017/websocket', retry: true },
  { search: '?game=half-life', endpoint: 'https://games.example.test/websocket'.replace('https:', 'wss:'), local: false, retry: false },
  { search: '?game=counter-strike', endpoint: 'ws://games.example.test/counter-strike/websocket', local: false, retry: false },
  { search: '?game=counter-strike', endpoint: 'ws://127.0.0.1:8017/counter-strike/websocket', local: false, retry: false },
  { search: '?game=counter-strike&server=', endpoint: 'ws://127.0.0.1:8017/websocket', retry: true },
  { search: '?game=counter-strike', endpoint: fallback, retry: false },
  { search: '?game=counter-strike&server=127.0.0.1:4392', endpoint: 'ws://127.0.0.1:4392/websocket', retry: false },
  { search: '?game=half-life&server=lan.example.test:4192', endpoint: 'ws://lan.example.test:4192/websocket', retry: false },
  { search: '?server=wss%3A%2F%2Fgames.example.test%2Fwebsocket', endpoint: 'wss://games.example.test/websocket', retry: false },
  { search: '?server=127.0.0.1:8017', endpoint: 'ws://127.0.0.1:8017/websocket', retry: false },
  { search: '?server=127.0.0.1:4192', endpoint: fallback, retry: false }
];

async function exercise(policy) {
  let checks = 0;
  for (const entry of cases) {
    for (const outcome of ['success', 'first-failure', 'all-fail']) {
      const sandbox = vm.createContext({ URL, URLSearchParams, location: { search: entry.search }, BRIDGE_FALLBACK: '127.0.0.1:4192' });
      const probe = vm.runInContext(`({${policy}})`, sandbox);
      probe.endpoint = new URL(entry.endpoint);
      probe.allowLocalFallback = entry.local !== false;
      probe.disposeConnection = () => {};
      const attempts = [];
      const original = new Error('original endpoint failed');
      const final = new Error('fallback endpoint failed');
      probe.connect = async function () {
        attempts.push(this.endpoint.href);
        if (outcome === 'success') return;
        if (attempts.length === 1) throw original;
        if (outcome === 'all-fail') throw final;
      };
      const label = `${entry.search}: ${outcome}`;
      if (outcome === 'success' || (entry.retry && outcome === 'first-failure')) {
        await probe.connectWithFallback();
      } else {
        await assert.rejects(probe.connectWithFallback(), error => error === (entry.retry ? final : original), label);
      }
      assert.deepEqual(attempts, outcome !== 'success' && entry.retry ? [entry.endpoint, fallback] : [entry.endpoint], label);
      checks++;
    }
  }
  return checks;
}

const checks = await exercise(method);
const guard = "new URLSearchParams(location.search).get('server') || ";
assert.equal(method.split(guard).length, 2, 'negative control must remove precisely the new endpoint guard');
let negativeFailure = '';
try { await exercise(method.replace(guard, '')); }
catch (error) { negativeFailure = error.message; }
assert.match(negativeFailure, /server=127\.0\.0\.1:4392/, 'the old policy must fail an explicit-server case');
const report = {
  generatedAt: new Date().toISOString(),
  adapterSourceSHA256: createHash('sha256').update(source).digest('hex'),
  cases: checks,
  negativeControl: { failedAsExpected: true, error: negativeFailure },
  browserGameplay: false,
  passed: true
};
if (process.env.CS_ENDPOINT_PROOF) await writeFile(process.env.CS_ENDPOINT_PROOF, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
