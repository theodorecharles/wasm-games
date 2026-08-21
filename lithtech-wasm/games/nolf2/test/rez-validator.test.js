'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function main() {
  const root = path.resolve(__dirname, '..');
  const mod = await import(pathToFileURL(path.join(root, 'web', 'data-validator.mjs')).href);
  const header = Buffer.alloc(160, 0x20);
  header.write('\r\nRezMgr Version 1 Copyright (C) 1995 MONOLITH INC.', 0);
  header[0x7c] = 0x0d;
  header[0x7d] = 0x0a;
  header[0x7e] = 0x1a;
  header[0x7f] = 0x01;
  header[0x80] = 0x00;
  header[0x81] = 0x00;
  header[0x82] = 0x00;

  const ok = await mod.validateLithRez({
    name: 'GAME.REZ',
    size: 224475015,
    policy: { identity: 'GAME.REZ' },
    read: async () => new Uint8Array(header)
  });
  assert.equal(ok.accepted, true, ok.error);

  const sdkRez = path.join(root, 'vendor', 'nolf2-source', 'Engine', 'sdk', 'rez', 'Engine.REZ');
  if (fs.existsSync(sdkRez)) {
    const fd = fs.openSync(sdkRez, 'r');
    const buf = Buffer.alloc(160);
    fs.readSync(fd, buf, 0, 160, 0);
    fs.closeSync(fd);
    const live = await mod.validateLithRez({
      name: 'Engine.REZ',
      size: fs.statSync(sdkRez).size,
      policy: { identity: 'Engine.REZ' },
      read: async () => new Uint8Array(buf)
    });
    assert.equal(live.accepted, true, live.error);
  }

  const bad = await mod.validateLithRez({
    name: 'GAME.REZ',
    size: 100,
    policy: {},
    read: async () => new Uint8Array([1, 2, 3])
  });
  assert.equal(bad.accepted, false);

  const owner = path.join(process.env.WASM_GAME_DATA_ROOT || '/home/ted/wasm-game-data/nolf2', 'game', 'GAME.REZ');
  if (fs.existsSync(owner)) {
    const ownerFd = fs.openSync(owner, 'r');
    const ownerBuf = Buffer.alloc(160);
    fs.readSync(ownerFd, ownerBuf, 0, 160, 0);
    fs.closeSync(ownerFd);
    const ownerLive = await mod.validateLithRez({
      name: 'GAME.REZ',
      size: fs.statSync(owner).size,
      policy: { identity: 'GAME.REZ' },
      read: async () => new Uint8Array(ownerBuf)
    });
    assert.equal(ownerLive.accepted, true, ownerLive.error);
  }

  process.stdout.write('rez validator ok\n');
}

main().catch((error) => {
  process.stderr.write(`${error && error.stack || error}\n`);
  process.exit(1);
});
