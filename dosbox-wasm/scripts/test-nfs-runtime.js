#!/usr/bin/env node
'use strict';

// Optional owner-data regression: real DOS game + SDL/Wasm in Node, not Chrome.
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const args = process.argv.slice(2).filter(value => !value.startsWith('--'));
const pointer = process.argv.includes('--pointer');
const site = path.resolve(args[0] || path.join(__dirname, '../web/dist'));
const data = path.resolve(args[1] || process.env.DOSBOX_DATA_ROOT || '/home/ted/wasm-game-data/dosbox');
const keys = [
  { code: 27, at: 7000, holdMs: 200 },
  { code: 27, at: 13000, holdMs: 200 },
  // Control Central: select Drive, accept the default player name.
  ...(pointer ? [] : [
    { code: 274, at: 16000, holdMs: 150 },
    { code: 274, at: 17000, holdMs: 150 },
    { code: 274, at: 18000, holdMs: 150 },
    { code: 13, at: 20000, holdMs: 150 }
  ]),
  { code: 13, at: 24000, holdMs: 150 },
  { code: 13, at: 28000, holdMs: 150 },
  // The native controls menu defines A/Z for shifting and Up for throttle.
  // Engage first gear from neutral, accelerate, then briefly steer right.
  { code: 97, at: 35000, holdMs: 150 },
  { code: 273, at: 37000, holdMs: 15000 },
  { code: 275, at: 47000, holdMs: 500 }
];
execFileSync(process.execPath, [
  path.join(__dirname, 'test-installed-runtime.js'), site, 'nfs', data, '60000'
], {
  stdio: 'inherit', timeout: 90000,
  env: {
    ...process.env,
    DOSBOX_NATIVE_KEYS: JSON.stringify(keys),
    DOSBOX_NATIVE_CLICKS: '[]',
    DOSBOX_NATIVE_RELATIVE_MOUSE: JSON.stringify(pointer ? [
      { dx: -170, dy: 320, at: 17000, click: true, settleMs: 4000 }
    ] : []),
    DOSBOX_NATIVE_MIN_TIMER_MS: '4',
    DOSBOX_NATIVE_REQUIRE_AUDIO: '1',
    DOSBOX_NATIVE_REQUIRE_PROGRAM: 'TNFS',
    DOSBOX_NATIVE_REQUIRE_CANVAS: '640x400',
    DOSBOX_NATIVE_REQUIRE_LATE_ACTIVITY: '1'
  }
});
