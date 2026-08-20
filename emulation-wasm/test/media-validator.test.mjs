import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { validateConsoleMedia, validateConsoleMediaBundle } from '../web/data-validator.mjs';

function request(bytes, name, kind) {
  return {
    name,
    size: bytes.byteLength,
    policy: { kind },
    async read(offset, length) { return bytes.subarray(offset, offset + length); },
    async digest(algorithm) {
      assert.equal(algorithm, 'SHA-256');
      return createHash('sha256').update(bytes).digest('hex');
    }
  };
}

function bundleFile(bytes, name) {
  const value = request(bytes, name, 'unused');
  return { name: value.name, size: value.size, read: value.read, digest: value.digest };
}

function bundle(files, system) {
  const byName = new Map(files.map(entry => [entry.name, entry]));
  return { files, totalSize: files.reduce((sum, file) => sum + file.size, 0), policy: { system }, file: name => byName.get(name) || null };
}

test('accepts an iNES header and rejects an arbitrary NES file', async () => {
  const good = new Uint8Array(16 + 16384);
  good.set([0x4e, 0x45, 0x53, 0x1a]);
  assert.equal((await validateConsoleMedia(request(good, 'test.nes', 'nes-media'))).accepted, true);
  const bad = new Uint8Array(good.length);
  assert.match((await validateConsoleMedia(request(bad, 'test.nes', 'nes-media'))).error, /iNES/);
});

test('accepts a structurally plausible SNES internal header', async () => {
  const bytes = new Uint8Array(32768);
  bytes.set(new TextEncoder().encode('FRAMEWORK TEST ROM   '), 0x7fc0);
  bytes[0x7fc0 + 28] = 0xcb;
  bytes[0x7fc0 + 29] = 0xed;
  bytes[0x7fc0 + 30] = 0x34;
  bytes[0x7fc0 + 31] = 0x12;
  const result = await validateConsoleMedia(request(bytes, 'test.sfc', 'snes-media'));
  assert.equal(result.accepted, true);
  assert.equal(result.metadata.copierHeader, 0);
});

test('CUE validation returns safe related tracks and rejects traversal', async () => {
  const valid = new TextEncoder().encode('FILE "disc.bin" BINARY\n  TRACK 01 MODE2/2352\n    INDEX 01 00:00:00\n');
  const accepted = await validateConsoleMedia(request(valid, 'disc.cue', 'cue-sheet'));
  assert.equal(accepted.accepted, true);
  assert.deepEqual(accepted.metadata.references, ['disc.bin']);

  const unsafe = new TextEncoder().encode('FILE "../disc.bin" BINARY\n  TRACK 01 MODE2/2352\n');
  assert.match((await validateConsoleMedia(request(unsafe, 'disc.cue', 'cue-sheet'))).error, /safe track/);
});

test('PS1 firmware is size-structural rather than tied to one release hash', async () => {
  const result = await validateConsoleMedia(request(new Uint8Array(512 * 1024), 'scph5501.bin', 'ps1-firmware'));
  assert.equal(result.accepted, true);
  assert.equal(result.identity, 'ps1-firmware');
});

test('PS2 ISO validation checks the primary volume descriptor', async () => {
  const bytes = new Uint8Array(17 * 2048);
  bytes.set([1, 0x43, 0x44, 0x30, 0x30, 0x31, 1], 16 * 2048);
  assert.equal((await validateConsoleMedia(request(bytes, 'disc.iso', 'ps2-iso'))).accepted, true);
  bytes[16 * 2048 + 1] = 0;
  assert.match((await validateConsoleMedia(request(bytes, 'disc.iso', 'ps2-iso'))).error, /descriptor/);
});

test('bundle validator accepts one NES cart and rejects hidden extras', async () => {
  const bytes = new Uint8Array(16 + 16384);
  bytes.set([0x4e, 0x45, 0x53, 0x1a]);
  const media = bundle([bundleFile(bytes, 'mario.nes')], 'nes');
  const accepted = await validateConsoleMediaBundle(media);
  assert.equal(accepted.accepted, true);
  assert.equal(accepted.primary, 'mario.nes');
  assert.equal(accepted.metadata.system, 'nes');
  assert.match((await validateConsoleMediaBundle(bundle([
    ...media.files, bundleFile(new Uint8Array(16), 'extra.nes')
  ], 'nes'))).error, /exactly one file/);
});

test('bundle validator treats a CUE and every referenced track atomically', async () => {
  const cue = new TextEncoder().encode('FILE "track01.bin" BINARY\n  TRACK 01 MODE2/2352\n    INDEX 01 00:00:00\n');
  const track = new Uint8Array(2352);
  const files = [bundleFile(cue, 'disc/game.cue'), bundleFile(track, 'disc/track01.bin')];
  const accepted = await validateConsoleMediaBundle(bundle(files, 'ps1'));
  assert.equal(accepted.accepted, true);
  assert.equal(accepted.primary, 'disc/game.cue');
  assert.equal(accepted.metadata.fileCount, 2);
  const missing = await validateConsoleMediaBundle(bundle([files[0]], 'ps1'));
  assert.match(missing.error, /missing track/);
  const extra = await validateConsoleMediaBundle(bundle([
    ...files, bundleFile(new Uint8Array(2352), 'disc/unreferenced.bin')
  ], 'ps1'));
  assert.match(extra.error, /unreferenced file/);
});

test('PS1 media rejects formats outside the shipped CUE/BIN runtime', async () => {
  const chd = new Uint8Array(124);
  chd.set(new TextEncoder().encode('MComprHD'));
  const result = await validateConsoleMediaBundle(bundle([bundleFile(chd, 'disc.chd')], 'ps1'));
  assert.equal(result.accepted, false);
  assert.match(result.error, /exactly one CUE/);
});

test('PS2 bundle is structurally accepted but deployment cache remains separately fail closed', async () => {
  const iso = new Uint8Array(17 * 2048);
  iso.set([1, 0x43, 0x44, 0x30, 0x30, 0x31, 1], 16 * 2048);
  const result = await validateConsoleMediaBundle(bundle([bundleFile(iso, 'game.iso')], 'ps2'));
  assert.equal(result.accepted, true);
  assert.equal(result.primary, 'game.iso');
});
