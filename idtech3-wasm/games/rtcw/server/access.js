'use strict';

const crypto = require('node:crypto');

function ensureSessionSecret(environment) {
  const env = environment || process.env;
  if (env.WASM_GAME_PASSWORD && !env.WASM_GAME_SESSION_SECRET) {
    env.WASM_GAME_SESSION_SECRET = crypto.randomBytes(32).toString('base64url');
  }
  return env.WASM_GAME_SESSION_SECRET || '';
}

function passwordProtectedPath(pathname) {
  return pathname === '/status' || pathname === '/wake' || pathname === '/config.json' ||
    pathname === '/game-data' || pathname.startsWith('/game-data/') ||
    pathname === '/game-adapter.js' || pathname === '/iowolfmp.js' ||
    pathname === '/iowolfmp.wasm' || pathname.startsWith('/qvm/') ||
    pathname.startsWith('/menus/');
}

function rejectWebSocket(socket) {
  socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
}

module.exports = Object.freeze({ ensureSessionSecret, passwordProtectedPath, rejectWebSocket });
