#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const framework = process.env.WASM_FRAMEWORK_DIR || process.env.WASM_GAME_FRAMEWORK_ROOT || '/home/ted/Development/wasm-game-framework';
const lock = JSON.parse(fs.readFileSync(path.join(root, 'framework-lock.json'), 'utf8'));
process.stdout.write(`framework pin ${lock.package}@${lock.version}\n`);
if (!fs.existsSync(path.join(framework, 'dist', 'wasm-game-framework.js'))) {
  process.stderr.write(`separate wasm-game-framework checkout is missing at ${framework}.\n`);
  process.exit(1);
}
