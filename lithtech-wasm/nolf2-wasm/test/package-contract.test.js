'use strict';

const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const checker = path.join(root, 'vendor', 'wasm-game-framework', 'scripts', 'check-game-package.js');
const site = path.join(root, 'web');
const result = spawnSync(process.execPath, [checker, site], { encoding: 'utf8' });
if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout || 'package contract failed\n');
  process.exit(result.status || 1);
}
process.stdout.write(result.stdout);
