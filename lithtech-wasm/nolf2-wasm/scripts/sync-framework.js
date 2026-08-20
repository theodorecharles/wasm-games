#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const vendor = path.join(root, 'vendor', 'wasm-game-framework');
const lock = JSON.parse(fs.readFileSync(path.join(root, 'framework-lock.json'), 'utf8'));
process.stdout.write(`framework pin ${lock.package}@${lock.version}\n`);
if (!fs.existsSync(path.join(vendor, 'dist', 'wasm-game-framework.js'))) {
  process.stderr.write('vendor/wasm-game-framework is missing. Re-run create-wasm-game or copy the framework package.\n');
  process.exit(1);
}
