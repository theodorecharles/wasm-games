#!/usr/bin/env node
'use strict';

// The pinned historical client hard-codes ws:// without a configurable path.
// Only alter its browser transport glue; keep the compiled game/renderer intact.
const fs = require('node:fs');
const original = "var url = 'ws://' + addr + ':' + port;";
const replacement = "var url = !ENVIRONMENT_IS_NODE && Module['wasmGameWebSocketUrl'] || 'ws://' + addr + ':' + port;";

function patchClientTransport(source) {
  if (source.split(original).length !== 2 || source.includes(replacement)) {
    throw new Error('QuakeJS browser WebSocket seam changed or was already patched.');
  }
  return source.replace(original, replacement);
}

if (require.main === module) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output || input === output) throw new Error('usage: public-websocket.js INPUT DISTINCT_OUTPUT');
  fs.writeFileSync(output, patchClientTransport(fs.readFileSync(input, 'utf8')), { flag: 'wx' });
}

module.exports = { patchClientTransport, original, replacement };
