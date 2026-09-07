'use strict';
// Independent, localhost-only DOM fullscreen diagnostic; no game/owner data.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const page = fs.readFileSync(path.join(__dirname, '../tests/fullscreen-browser.html'));
http.createServer((request, response) => {
  if (request.method !== 'GET' || request.url !== '/') {
    response.writeHead(404); response.end(); return;
  }
  response.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp', 'X-Content-Type-Options': 'nosniff'
  });
  response.end(page);
}).listen(32957, '127.0.0.1', () => console.log('Fullscreen diagnostic: http://127.0.0.1:32957/'));
