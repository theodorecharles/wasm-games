'use strict';

const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const framework = process.env.WASM_FRAMEWORK_DIR || process.env.WASM_GAME_FRAMEWORK_ROOT || '/home/ted/Development/wasm-game-framework';
const checker = path.join(framework, 'scripts', 'check-game-package.js');
const site = path.join(root, 'web');
const result = spawnSync(process.execPath, [checker, site], { encoding: 'utf8' });
if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout || 'package contract failed\n');
  process.exit(result.status || 1);
}
process.stdout.write(result.stdout);
