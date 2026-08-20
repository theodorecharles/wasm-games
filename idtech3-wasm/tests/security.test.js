'use strict';

const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const listed = childProcess.execFileSync('git', [
  'ls-files', '--cached', '--others', '--exclude-standard', '-z'
], { cwd: root }).toString().split('\0').filter(Boolean);

assert.ok(listed.length > 20, 'family source inventory is unexpectedly small');
for (const relative of listed) {
  const lower = relative.toLowerCase();
  assert.doesNotMatch(lower, /(^|\/)(pak[0-9]*|mp_bin|sp_pak[0-9]*|mp_pak[^/]*)\.pk3$/);
  assert.doesNotMatch(lower, /\.(pak|wad|wasm|data)$/);
  assert.doesNotMatch(lower, /(^|\/)(id1|baseq3|main)\/(pak|sp_pak|mp_pak)/);
  assert.doesNotMatch(lower, /(^|\/)(\.env|credentials|secrets?)(\.|$)/);
  assert.doesNotMatch(lower, /(^|\/)node_modules\//);
  const absolute = path.join(root, relative);
  if (fs.existsSync(absolute)) assert.equal(fs.lstatSync(absolute).isSymbolicLink(), false, `${relative} is a symlink`);
}

const forbiddenDocument = /(^|\/)(index\.html|service-worker\.js|app\.webmanifest)$/;
const forbiddenStyle = /(^|\/)(shared-shell\/.*\.css|style\.css)$/;
assert.equal(listed.some(file => forbiddenDocument.test(file)), false, 'downstream launcher/PWA document found');
assert.equal(listed.some(file => forbiddenStyle.test(file)), false, 'downstream shared-shell style found');

for (const relative of listed.filter(file => /\.(js|json|md|sh|yml|yaml|xml|cfg|dockerfile)$/i.test(file) || path.basename(file) === 'Dockerfile')) {
  const value = fs.readFileSync(path.join(root, relative), 'utf8');
  assert.doesNotMatch(value, /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/, relative);
  assert.doesNotMatch(value, /The container stores your legally owned PAKs once; this browser also caches them for fast reloads\./, relative);
}

for (const relative of ['README.md', 'package.json']) {
  const publicCopy = fs.readFileSync(path.join(root, relative), 'utf8');
  assert.doesNotMatch(publicCopy, /\b(?:retail|piracy|entitlement|illegal)\b|legally owned|owner-supplied/i, relative);
}

for (const relative of listed.filter(file => file.startsWith('scripts/'))) {
  const value = fs.readFileSync(path.join(root, relative), 'utf8');
  assert.doesNotMatch(value, /\/home\/ted\/Development\/(wasm\/)?(quake3-wasm|rtcw-wasm|wolfetjs)/, `${relative} uses a migration worktree`);
}

assert.equal(listed.some(file => file.startsWith('games/wolfet/server/')), true,
  'WolfET must be developed in-tree like Quake III and RTCW');
assert.equal(listed.some(file => file.startsWith('games/wolfet/web/game-adapter.js')), true,
  'WolfET adapter must live under games/wolfet');
assert.equal(listed.some(file => forbiddenDocument.test(file) && file.startsWith('games/wolfet/')), false,
  'WolfET must not commit a downstream launcher document');

console.log('game-data boundary, downstream shell ban, and secrets checks passed');
