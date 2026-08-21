'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'web', 'game-adapter.js'), 'utf8');
assert.match(source, /_lith_host_state/);
assert.match(source, /'menu'/);
assert.match(source, /'gameplay'/);
assert.match(source, /readEngineState/);
assert.doesNotMatch(source, /engineState = 'menu'/);
assert.doesNotMatch(source, /engineState = 'gameplay'/);
process.stdout.write('adapter state ok\n');
