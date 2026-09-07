#!/usr/bin/env node
// Run installed owner data against the unchanged production Wasm ABI.
// No browser automation, GPU validation, or audible-output acceptance.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
const execute = promisify(execFile);
const script = fileURLToPath(new URL('./test-crispy-runtime.mjs', import.meta.url));
const negative = process.argv.includes('--expect-deadlock');
const cases = negative
  ? ['doom', 'heretic', 'hexen'].map(game => [game, '--expect-deadlock'])
  : ['doom', 'doom2', 'tnt', 'plutonia', 'heretic', 'hexen', 'chex']
    .flatMap(game => [[], ['--smooth']].flatMap(profile =>
      [[], ['--warp']].map(mode => [game, ...profile, ...mode])))
    .concat([['doom', '--suspended'], ['heretic', '--smooth', '--suspended'],
      ['hexen', '--suspended'], ['doom', '--nosound']]);
const reports = [];
let next = 0;
async function worker() {
  while (next < cases.length) {
    const index = next++;
    const args = cases[index];
    try {
      const { stdout, stderr } = await execute(process.execPath, [script, ...args],
        { timeout: 25000, maxBuffer: 1024 * 1024, env: process.env });
      reports[index] = JSON.parse(stdout);
      console.error(`PASS ${args.join(' ')}`);
      if (stderr) console.error(stderr);
    } catch (error) {
      reports[index] = { args, failed: true, error: error.message, stderr: error.stderr };
      console.error(`FAIL ${args.join(' ')}: ${error.stderr || error.message}`);
    }
  }
}
await Promise.all([worker(), worker()]);
console.log(JSON.stringify({
  scope: 'Native Wasm, fake DOM/2D/audio destination. Not Chrome, GPU, or audible-output acceptance.',
  negativeControl: negative,
  passed: reports.every(report => !report.failed), cases: reports
}, null, 2));
process.exitCode = reports.some(report => report.failed) ? 1 : 0;
