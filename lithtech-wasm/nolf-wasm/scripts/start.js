#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..');
process.env.WASM_GAME_SITE_ROOT = path.join(root, 'web');
process.env.WASM_GAME_SHELL_ROOT = path.join(root, 'vendor', 'wasm-game-framework', 'dist');
process.env.WASM_GAME_DATA_ROOT = process.env.WASM_GAME_DATA_ROOT || path.join(root, '.data');
process.env.WASM_GAME_HTTP_PORT = process.env.WASM_GAME_HTTP_PORT || '8088';
const child = spawn(process.execPath, [
  path.join(root, 'vendor', 'wasm-game-framework', 'server', 'static-server.js')
], { stdio: 'inherit' });
child.on('exit', code => process.exit(code || 0));
