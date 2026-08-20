'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const data = path.join(root, '..', 'data', 'nolf', 'game');
const build = path.join(root, 'build-host');
const cli = path.join(build, 'nolf_lith_cli');

function run(cmd, args) {
  const result = spawnSync(cmd, args, { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
  }
  return result;
}

function scenario(name) {
  const result = spawnSync(cli, [data, name], { encoding: 'utf8' });
  process.stdout.write(result.stdout || '');
  process.stderr.write(result.stderr || '');
  assert.equal(result.status, 0, `${name}: ${result.stderr}`);
  return result.stdout;
}

if (!fs.existsSync(data)) {
  process.stdout.write('lith session skipped (no owner data)\n');
  process.exit(0);
}

run('cmake', ['-S', path.join(root, 'native'), '-B', build]);
run('cmake', ['--build', build, '--target', 'nolf_lith_cli', '-j']);

scenario('render');
const menu = scenario('menu');
assert.match(menu, /state=menu/);
assert.match(menu, /art=splash/);
assert.match(menu, /level=/);
assert.doesNotMatch(menu, /level=\s*$/);

scenario('main');
scenario('single');
scenario('play');
process.stdout.write('lith session ok\n');
