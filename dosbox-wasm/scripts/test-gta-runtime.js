#!/usr/bin/env node
'use strict';

// Optional owner-data regression. This drives the real DOS program in Node,
// not Chrome, and checks non-silent PCM through the page audio handoff.
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const site = path.resolve(process.argv[2] || path.join(__dirname, '../web/dist'));
const data = path.resolve(process.argv[3] || process.env.DOSBOX_DATA_ROOT || '/home/ted/wasm-game-data/dosbox');
const keys = [
  { code: 13, at: 2000 },
  { code: 13, at: 13000 },
  { code: 13, at: 15000 },
  { code: 13, at: 18000 },
  { code: 13, at: 21000 },
  { code: 273, at: 31000, holdMs: 2500 },
  { code: 306, at: 35000, holdMs: 500 }
];
execFileSync(process.execPath, [
  path.join(__dirname, 'test-installed-runtime.js'), site, 'gta', data, '42000'
], {
  stdio: 'inherit', timeout: 60000,
  env: {
    ...process.env,
    DOSBOX_NATIVE_KEYS: JSON.stringify(keys),
    DOSBOX_NATIVE_MIN_TIMER_MS: '4',
    DOSBOX_NATIVE_REQUIRE_AUDIO: '1'
  }
});
