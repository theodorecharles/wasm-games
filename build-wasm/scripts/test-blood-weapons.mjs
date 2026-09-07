#!/usr/bin/env node
// Broad native crash diagnostic. Test-only observer builds, not Chrome proof.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const exec = promisify(execFile);
const directory = path.dirname(fileURLToPath(import.meta.url));
const pitchfork = process.argv.includes('--pitchfork');
const production = process.argv.includes('--production');
assert.ok(!production || pitchfork, 'production mode tests the unmodified starting weapon');
assert.ok(production || process.env.BUILD_RUNTIME_DIR, 'select a separate diagnostic build');
const cases = pitchfork ? [44100, 48000].flatMap(sampleRate => ['keyboard', 'mouse'].flatMap(input =>
  [false, true].map(tapAttack => ({ weapon: 1, input, menuStart: true, sampleRate, tapAttack,
    walk: !tapAttack, duration: 10000 })))) : [
  ...Array.from({ length: 12 }, (_, i) => ({ weapon: i + 1, input: 'mouse', god: true })),
  ...Array.from({ length: 12 }, (_, i) => ({ weapon: i + 1, input: 'mouse', alternate: true, god: true })),
  ...[1, 3, 4].map(weapon => ({ weapon, input: 'keyboard', duration: 10000 })),
  ...[1, 3, 4, 5, 6, 7].map(weapon => ({ weapon, input: 'mouse', walk: true, god: true, duration: 6000 })),
  { weapon: 1, input: 'none' }
];
const results = new Array(cases.length);
let next = 0;
async function worker() {
  while (next < cases.length) {
    const index = next++, test = cases[index];
    const args = [path.join(directory, 'test-blood-runtime.mjs'), ...(!production ? ['--observe-weapon'] : []),
      ...(test.god ? ['--god'] : []), ...(test.alternate ? ['--alternate'] : []), ...(test.walk ? ['--walk'] : []),
      ...(test.menuStart ? ['--menu-start'] : []), ...(test.tapAttack ? ['--tap-attack'] : [])];
    const name = `weapon-${test.weapon}/${test.input}${test.alternate ? '/alternate' : ''}${test.walk ? '/walk' : ''}` +
      `${test.tapAttack ? '/taps' : ''}${test.sampleRate ? `/${test.sampleRate}Hz` : ''}`;
    try {
      const { stdout } = await exec(process.execPath, args, {
        env: { ...process.env, BLOOD_TEST_WEAPON: String(test.weapon), BLOOD_TEST_INPUT: test.input,
          BLOOD_TEST_FIRE_MS: String(test.duration || 2500),
          BLOOD_TEST_SAMPLE_RATE: String(test.sampleRate || 44100),
          BUILD_RUNTIME_DIR: production ? '' : process.env.BUILD_RUNTIME_DIR },
        timeout: 45000, maxBuffer: 2 * 1024 * 1024
      });
      results[index] = { name, ...test, result: JSON.parse(stdout) };
      console.error(`PASS ${name}`);
    } catch (error) {
      let failure;
      try { failure = JSON.parse(error.stderr); } catch { failure = { error: error.stderr || error.stack }; }
      results[index] = { name, ...test, result: { passed: false, ...failure } };
      console.error(`FAIL ${name}: ${failure.error?.split('\n')[0]}`);
    }
  }
}
await Promise.all([worker(), worker()]);
const passed = results.every(test => test.result.passed);
console.log(JSON.stringify({ passed, casesTested: results.length, production, pitchfork, results,
  scope: production
    ? 'HTTP-served production native Wasm; real menu start, injected input; fake DOM/2D/WebAudio; not Chrome acceptance'
    : 'instrumented native Wasm weapon-callback/ammunition tests with fake DOM/2D/WebAudio; god/give console setup only where recorded; not Chrome acceptance' }, null, 2));
if (!passed) process.exitCode = 1;
