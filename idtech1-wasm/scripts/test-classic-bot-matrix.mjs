#!/usr/bin/env node
// Native diagnostic matrix only. No production service or browser automation.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execute = promisify(execFile);
const script = fileURLToPath(new URL('./test-classic-bots.mjs', import.meta.url));
const withWasm = process.argv.includes('--wasm');
const games = ['doom', 'doom2', 'tnt', 'plutonia', 'heretic', 'hexen', 'chex'];
const cases = games.flatMap(game => withWasm
  ? [[game, '--wasm'], [game, '--wasm', '--smooth']] : [[game]]);
const jobs = Number(process.env.IDTECH1_BOT_TEST_JOBS || 2);
const duration = Number(process.env.IDTECH1_BOT_TEST_MS || 60000);
assert.ok(Number.isInteger(jobs) && jobs >= 1 && jobs <= 3);
assert.ok(Number.isInteger(duration) && duration >= 5000 && duration <= 300000);
const reports = [];
let next = 0;
async function worker() {
  while (next < cases.length) {
    const index = next++, args = cases[index];
    try {
      const { stdout } = await execute(process.execPath, [script, ...args], {
        env: { ...process.env, IDTECH1_BOT_TEST_MS: String(duration) },
        timeout: duration + 60000, maxBuffer: 4 * 1024 * 1024
      });
      reports[index] = JSON.parse(stdout);
      assert.equal(reports[index].passed, true);
      console.error(`PASS ${args.join(' ')}`);
    } catch (error) {
      try { reports[index] = JSON.parse(error.stdout); }
      catch { reports[index] = { passed: false, error: error.message }; }
      reports[index].passed = false;
      console.error(`FAIL ${args.join(' ')}: ${reports[index].error || error.message}`);
    }
    reports[index].args = args;
  }
}
await Promise.all(Array.from({ length: jobs }, worker));
console.log(JSON.stringify({
  passed: reports.every(report => report.passed), duration, cases: reports,
  scope: 'Isolated native clients/server; optional unchanged-Wasm peer with fake presentation. Not Chrome acceptance.'
}, null, 2));
process.exitCode = reports.every(report => report.passed) ? 0 : 1;
