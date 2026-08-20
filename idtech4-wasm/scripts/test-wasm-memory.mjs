#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const site = path.resolve(process.argv[2] || new URL('../build/site', import.meta.url).pathname);

function readUleb(bytes, cursor) {
  let value = 0;
  let shift = 0;
  for (;;) {
    assert.ok(cursor.offset < bytes.length, 'truncated unsigned LEB128 value');
    const byte = bytes[cursor.offset++];
    value += (byte & 0x7f) * 2 ** shift;
    if ((byte & 0x80) === 0) return value;
    shift += 7;
    assert.ok(shift <= 49, 'oversized unsigned LEB128 value');
  }
}

function memoryDeclaration(artifact) {
  const bytes = fs.readFileSync(path.join(site, artifact));
  assert.equal(bytes.subarray(0, 8).toString('hex'), '0061736d01000000', `${artifact}: invalid wasm header`);
  const cursor = { offset: 8 };
  while (cursor.offset < bytes.length) {
    const section = bytes[cursor.offset++];
    const size = readUleb(bytes, cursor);
    const end = cursor.offset + size;
    assert.ok(end <= bytes.length, `${artifact}: truncated section ${section}`);
    if (section !== 5) {
      cursor.offset = end;
      continue;
    }
    assert.equal(readUleb(bytes, cursor), 1, `${artifact}: expected one linear memory`);
    const flags = readUleb(bytes, cursor);
    assert.equal(flags & 4, 0, `${artifact}: memory64 is outside the wasm32 contract`);
    const initial = readUleb(bytes, cursor);
    const maximum = flags & 1 ? readUleb(bytes, cursor) : null;
    return { initial, maximum };
  }
  throw new Error(`${artifact}: no linear memory declaration`);
}

for (const [artifact, initial] of [
  ['dhewm3-base.wasm', 2048],
  ['dhewm3-roe.wasm', 2048],
  ['openQ4-client_wasm32.wasm', 4096],
  ['prey06.wasm', 4096]
]) {
  assert.deepEqual(memoryDeclaration(artifact), { initial, maximum: 32768 },
    `${artifact}: unexpected wasm32 initial/maximum page limits`);
}

console.log('id Tech 4 wasm memory declarations passed (Doom 3/RoE 128 MiB; Quake 4/Prey 256 MiB; all max 2 GiB)');
