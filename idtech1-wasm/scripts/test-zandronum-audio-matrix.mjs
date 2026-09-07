#!/usr/bin/env node
// Real native Wasm from isolated images; fake DOM/WebAudio, not Chrome/audio-device proof.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
const exec = promisify(execFile);
const directory = path.dirname(fileURLToPath(import.meta.url));
const cases = [
  { mode: 'both', games: 'doom2,doom,tnt,plutonia,heretic,hexen,chex' },
  { mode: 'music', games: 'doom2,heretic,hexen' },
  { mode: 'sfx', games: 'doom2,heretic,hexen' },
  { mode: 'muted', games: 'doom2,heretic,hexen' },
  { mode: 'disabled', games: 'doom2,heretic,hexen' },
  { mode: 'both', suspended: true, games: 'doom2,heretic,hexen' },
  { mode: 'both', sustainMs: 30000, games: 'doom2,heretic,hexen' }
];
const results = new Array(cases.length);
let next = 0;
async function worker() {
  while (next < cases.length) {
    const index = next++, test = cases[index];
    const { stdout, stderr } = await exec(process.execPath, [path.join(directory, 'test-managed-matches.mjs'),
      '--audio', ...(test.suspended ? ['--suspended'] : [])], {
      env: { ...process.env, IDTECH1_TEST_FROM_IMAGE: '1', IDTECH1_TEST_GAMES: test.games,
        IDTECH1_ZANDRONUM_RUNTIME_DIR: '',
        IDTECH1_TEST_SUSTAIN_MS: String(test.sustainMs || 0),
        IDTECH1_ZANDRONUM_AUDIO_MODE: test.mode }, timeout: 180000, maxBuffer: 4 * 1024 * 1024
    });
    results[index] = { ...test, report: JSON.parse(stdout) };
    assert.ok(results[index].report.results.filter(entry => entry.game)
      .every(entry => entry.runtimeOrigin === 'image-http'));
    console.error(`PASS ${test.mode}${test.suspended ? ' suspended' : ''}\n${stderr}`);
  }
}
try {
  await Promise.all([worker(), worker()]);
  console.log(JSON.stringify({ passed: true, casesTested: results.reduce((n, result) =>
    n + result.report.results.filter(entry => entry.game).length, 0), results,
    scope: 'real native Wasm/relay with fake DOM/WebAudio; no Chrome/audible-output acceptance' }, null, 2));
} catch (error) { console.error(error.stderr || error.stack); process.exitCode = 1; }
