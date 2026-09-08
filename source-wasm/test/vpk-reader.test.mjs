import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { crc32, openVpk, parseVpkDirectory } from '../scripts/vpk-reader.mjs';
import { makeVpk } from './vpk-fixture.mjs';

function archive(t, fixture) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'vpk-reader-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const directory = path.join(root, 'fixture_dir.vpk');
  writeFileSync(directory, fixture.bytes);
  for (const [index, bytes] of fixture.archives) writeFileSync(path.join(root, `fixture_${String(index).padStart(3, '0')}.vpk`), bytes);
  return { root, directory };
}

test('CRC matches the published check vector and the empty payload', () => {
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926);
  assert.equal(crc32(Buffer.alloc(0)), 0);
});
test('VPK v1 and v2 read embedded and external payloads with preload and nonzero offsets', t => {
  for (const version of [1, 2]) {
    const entries = [
      { path: 'root.txt', bytes: 'embedded payload', preloadLength: 3, padding: 5 },
      { path: 'maps/first.bsp', bytes: 'external with preload', preloadLength: 8, archive: 7, padding: 9 },
      { path: 'maps/second.bsp', bytes: 'same numbered archive', archive: 7 },
      { path: 'README', bytes: 'preload only', preloadLength: 12, archive: 42 },
      { path: 'empty.bin', bytes: '', archive: 43 }
    ];
    const fixture = makeVpk(entries, { version }), { directory } = archive(t, fixture);
    const reader = openVpk(directory);
    try {
      assert.deepEqual(reader.entries.map(entry => entry.path), entries.map(entry => entry.path));
      assert.deepEqual(reader.entries.map(entry => reader.read(entry).toString()), entries.map(entry => entry.bytes));
      assert.equal(reader.read(reader.entries[1]).toString(), entries[1].bytes, 'reused archive descriptor preserves independent offsets');
    } finally { reader.close(); }
    reader.close();
  }
});
test('bad header, version, directory, preload, terminator and embedded length reject before reading', () => {
  const fixture = makeVpk([{ path: 'test.txt', bytes: '123456789', preloadLength: 3 }]);
  const cases = [
    [Buffer.alloc(0), /header/],
    [fixture.bytes.subarray(0, 20), /header/],
    [fixture.bytes.subarray(0, fixture.dataOffset - 1), /directory/],
    [fixture.bytes.subarray(0, -1), /embedded data/]
  ];
  for (const [offset, value, expected] of [[4, 9, /version/], [fixture.metadataOffsets[0] + 12, 999, /embedded entry/]]) {
    const bytes = Buffer.from(fixture.bytes); bytes.writeUInt32LE(value, offset); cases.push([bytes, expected]);
  }
  const preload = Buffer.from(fixture.bytes); preload.writeUInt16LE(65535, fixture.metadataOffsets[0] + 4); cases.push([preload, /preload/]);
  const terminator = Buffer.from(fixture.bytes); terminator.writeUInt16LE(0, fixture.metadataOffsets[0] + 16); cases.push([terminator, /terminator/]);
  const string = Buffer.from(fixture.bytes); string.fill(0x61, 28, fixture.dataOffset); cases.push([string, /unterminated/]);
  for (const [bytes, expected] of cases) assert.throws(() => parseVpkDirectory(bytes), expected);
});
test('VPK rejects traversal, absolute, Windows and case-insensitive duplicate paths', () => {
  for (const unsafe of ['../escape.txt', '/absolute.txt', 'a/../escape.txt', 'a//double.txt', 'a\\escape.txt', 'C:/drive.txt', './dot.txt']) {
    assert.throws(() => parseVpkDirectory(makeVpk([{ path: unsafe, bytes: 'bad' }]).bytes), /unsafe VPK path/, unsafe);
  }
  assert.throws(() => parseVpkDirectory(makeVpk([{ path: 'Maps/Test.bsp' }, { path: 'maps/test.BSP' }]).bytes), /duplicate VPK path/);
});
test('CRC corruption and short external archives fail without accepting partial data', t => {
  for (const external of [false, true]) {
    const fixture = makeVpk([{ path: 'test.bin', bytes: 'real bytes', preloadLength: 2, archive: external ? 3 : 0x7fff }]);
    const { root, directory } = archive(t, fixture);
    const payloadPath = external ? path.join(root, 'fixture_003.vpk') : directory;
    const bytes = readFileSync(payloadPath); bytes[bytes.length - 1] ^= 0xff; writeFileSync(payloadPath, bytes);
    const reader = openVpk(directory);
    try { assert.throws(() => reader.read(reader.entries[0]), /CRC mismatch/); } finally { reader.close(); }
  }
  const fixture = makeVpk([{ path: 'test.bin', bytes: 'payload', archive: 1, padding: 3 }]), { root, directory } = archive(t, fixture);
  writeFileSync(path.join(root, 'fixture_001.vpk'), 'short');
  const reader = openVpk(directory);
  try { assert.throws(() => reader.read(reader.entries[0]), /truncated VPK archive/); } finally { reader.close(); }
});
test('directory and numbered VPK symlinks are rejected', t => {
  const fixture = makeVpk([{ path: 'payload.bin', bytes: 'external', archive: 1 }]), { root, directory } = archive(t, fixture);
  const linked = path.join(root, 'linked_dir.vpk'); symlinkSync(directory, linked);
  assert.throws(() => openVpk(linked), /symlink|regular file|symbolic/i);
  const external = path.join(root, 'fixture_001.vpk'); rmSync(external); symlinkSync(directory, external);
  const reader = openVpk(directory);
  try { assert.throws(() => reader.read(reader.entries[0]), /symlink|regular file|symbolic/i); } finally { reader.close(); }
});
