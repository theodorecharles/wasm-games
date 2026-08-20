'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const rez = path.join(root, '..', 'data', 'nolf2', 'game', 'GAME.REZ');
const build = path.join(root, 'build-host');
const cli = path.join(build, 'nolf2_probe_cli');

function run(cmd, args) {
  const result = spawnSync(cmd, args, { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
  }
  return result;
}

if (!fs.existsSync(rez)) {
  process.stdout.write('probe cli skipped (no owner GAME.REZ)\n');
  process.exit(0);
}

run('cmake', ['-S', path.join(root, 'native'), '-B', build]);
run('cmake', ['--build', build, '--target', 'nolf2_probe_cli', '-j']);
const probe = spawnSync(cli, [rez], { encoding: 'utf8' });
process.stdout.write(probe.stdout || '');
process.stderr.write(probe.stderr || '');
assert.equal(probe.status, 0, probe.stderr);
assert.match(probe.stdout, /header=ok/);
assert.match(probe.stdout, /GAME\.REZ/);
process.stdout.write('probe cli ok\n');
