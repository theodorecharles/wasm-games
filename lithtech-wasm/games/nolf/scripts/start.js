#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const framework = process.env.WASM_FRAMEWORK_DIR || process.env.WASM_GAME_FRAMEWORK_ROOT || '/home/ted/Development/wasm-game-framework';
process.env.WASM_GAME_SITE_ROOT = path.join(root, 'web');
process.env.WASM_GAME_SHELL_ROOT = path.join(framework, 'dist');
process.env.WASM_GAME_DATA_ROOT = process.env.WASM_GAME_DATA_ROOT || path.join(root, '.data');
process.env.WASM_GAME_HTTP_PORT = process.env.WASM_GAME_HTTP_PORT || '8088';
const child = spawn(process.execPath, [
  path.join(framework, 'server', 'static-server.js')
], { stdio: 'inherit' });
child.on('exit', code => process.exit(code || 0));
